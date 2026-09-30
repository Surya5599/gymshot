-- Web push for GymShot: squad activity and the daily reminder reach a phone
-- even when the app is closed.
--
-- Shape: each browser that opts in stores one row in push_subscriptions.
-- Triggers on squad tables and a 15-minute cron call the push-dispatch edge
-- function, which decides who to tell and sends the push. The function URL
-- and a shared secret live in Vault, never in this file.
--
-- Before applying, create the two Vault secrets (see supabase/README.md):
--   push_dispatch_url     https://<ref>.supabase.co/functions/v1/push-dispatch
--   push_webhook_secret   the same value as the function's PUSH_WEBHOOK_SECRET

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------- table

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  -- The reminder is per device, like the rest of the alert preferences.
  reminder_on boolean not null default true,
  reminder_at time not null default '19:00',
  tz text not null default 'UTC',
  last_reminded_day date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- A user sees and manages only their own devices. The dispatcher reads with
-- the service role, which bypasses RLS.
create policy "own subscriptions: select" on public.push_subscriptions
  for select using (user_id = auth.uid());
create policy "own subscriptions: insert" on public.push_subscriptions
  for insert with check (user_id = auth.uid());
create policy "own subscriptions: update" on public.push_subscriptions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own subscriptions: delete" on public.push_subscriptions
  for delete using (user_id = auth.uid());

-- Keys of pushes already sent, so a burst of writes (three photos landing at
-- once, a reaction toggled on and off) announces once. Service role only:
-- RLS on with no policies.
create table if not exists public.push_sent (
  key text primary key,
  created_at timestamptz not null default now()
);

alter table public.push_sent enable row level security;

-- ------------------------------------------------------------- dispatch

-- Hands the changed row to the edge function. Fire-and-forget through
-- pg_net, so a slow push service never slows the write that caused it.
create or replace function public.push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fn_url text;
  secret text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'push_dispatch_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if fn_url is null or secret is null then
    return new; -- Not configured yet: writes still succeed, nothing is sent.
  end if;
  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret),
    body := jsonb_build_object('type', tg_op, 'table', tg_table_name, 'record', to_jsonb(new))
  );
  return new;
end;
$$;

revoke all on function public.push_dispatch() from public, anon, authenticated;

-- A post is announced on its first photo, not on the check-in row: the row
-- also appears when someone only flips "trained today".
drop trigger if exists push_on_photo on public.checkin_photos;
create trigger push_on_photo after insert on public.checkin_photos
  for each row execute function public.push_dispatch();

drop trigger if exists push_on_reaction on public.reactions;
create trigger push_on_reaction after insert or update of emoji on public.reactions
  for each row execute function public.push_dispatch();

drop trigger if exists push_on_nudge on public.nudges;
create trigger push_on_nudge after insert on public.nudges
  for each row execute function public.push_dispatch();

drop trigger if exists push_on_join_request on public.pod_join_requests;
create trigger push_on_join_request after insert on public.pod_join_requests
  for each row execute function public.push_dispatch();

drop trigger if exists push_on_member on public.pod_members;
create trigger push_on_member after insert on public.pod_members
  for each row execute function public.push_dispatch();

-- -------------------------------------------------------------- reminder

-- Every 15 minutes the dispatcher checks which devices have reached their
-- local reminder time and whose owner has not posted today.
select cron.unschedule('push-reminders') where exists (select 1 from cron.job where jobname = 'push-reminders');
select cron.schedule(
  'push-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret')
    ),
    body := '{"type":"REMINDER"}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'push_dispatch_url');
  $$
);
