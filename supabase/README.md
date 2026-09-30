# Supabase: web push

Web push lets squad activity and the daily reminder reach a phone with
GymShot closed. Until the steps below are done, the app still works; it
just falls back to notifications while it is open or in a background tab.

## How it fits together

```
browser --subscribe--> push_subscriptions (one row per device, RLS: own rows)

checkin_photos / reactions / nudges /       pg_net
pod_join_requests / pod_members  --trigger-------->  push-dispatch  --web push--> phone
pg_cron, every 15 min  --------------------------->  (edge function)
```

- `migrations/20260930120000_web_push.sql` - the table, a dedupe table,
  the triggers, and the reminder cron.
- `functions/push-dispatch/` - decides who hears about what, sends, and
  deletes subscriptions the push service reports as gone.
- `web/src/lib/push.ts` and `web/public/sw.js` - subscribing a device and
  showing pushes.

What gets sent:

| Event | Who is told |
|---|---|
| First photo of a check-in | Everyone who shares a squad with the author |
| Reaction to a check-in | The check-in's owner (never for your own) |
| Nudge | The person nudged, unless they already posted |
| Join request | The squad owner |
| Request approved | The new member |
| Reminder time reached, not posted today | That device (time and zone are per device) |

## Turning it on

Run these against the GymShot project (`xhzxqseqbqlfzrjycrug`).

1. **Generate a VAPID key pair** (once, keep the private key secret):

   ```bash
   npx web-push generate-vapid-keys
   ```

2. **Put the public key in the web app**: paste it into `VAPID_PUBLIC_KEY`
   in `web/src/lib/push.ts`. The public key is safe in the bundle.

3. **Set the function's secrets** (make up a long random webhook secret):

   ```bash
   supabase secrets set --project-ref xhzxqseqbqlfzrjycrug \
     VAPID_PUBLIC_KEY=<public> \
     VAPID_PRIVATE_KEY=<private> \
     VAPID_SUBJECT=mailto:<your email> \
     PUSH_WEBHOOK_SECRET=<random, e.g. openssl rand -hex 32>
   ```

4. **Deploy the function** (no JWT: Postgres is the caller, and the
   webhook secret authenticates it):

   ```bash
   supabase functions deploy push-dispatch --no-verify-jwt --project-ref xhzxqseqbqlfzrjycrug
   ```

5. **Store the URL and secret in Vault**, in the dashboard's SQL editor:

   ```sql
   select vault.create_secret('https://xhzxqseqbqlfzrjycrug.supabase.co/functions/v1/push-dispatch', 'push_dispatch_url');
   select vault.create_secret('<the same PUSH_WEBHOOK_SECRET>', 'push_webhook_secret');
   ```

6. **Apply the migration**: paste
   `migrations/20260930120000_web_push.sql` into the SQL editor and run it.
   (The earlier schema was built in the dashboard, so `supabase db push`
   would not find a matching migration history.)

7. **Deploy the web app** with the public key from step 2, then in GymShot:
   You -> System notifications -> on. A row appears in
   `push_subscriptions`, and a squad-mate's next post arrives as a push.

## Notes

- iPhone gets web push only when GymShot is installed to the Home Screen
  (iOS 16.4+). The app says so where it matters.
- Safari drops a subscription whose pushes are not shown, so the service
  worker always shows pushes there. Elsewhere it stays quiet while the app
  is focused, since the in-app toast already announced the event.
- If the Vault secrets are missing, the triggers do nothing and writes
  succeed, so the migration is safe to apply before the function exists.
