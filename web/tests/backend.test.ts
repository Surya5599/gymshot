import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import schema from '../convex/schema';
import { currentEpoch, EPOCH_MS } from '../convex/lib/photoUrl';

const modules = import.meta.glob('../convex/**/*.*s');

const DAY = '2026-09-30';
const FIRE = '\u{1F525}';

beforeEach(() => {
  // Scheduled pushes stay queued (we assert on them) instead of running.
  vi.useFakeTimers();
  process.env.PHOTO_URL_SECRET = 'test-secret';
  process.env.CONVEX_SITE_URL = 'https://site.test';
  process.env.REVENUECAT_WEBHOOK_AUTH = 'rc-secret';
});
afterEach(() => vi.useRealTimers());

function setup() {
  const t = convexTest(schema, modules);
  const as = (id: Id<'users'>) => t.withIdentity({ subject: `${id}|session` });
  const user = (displayName: string, extra: Record<string, unknown> = {}) =>
    t.run((ctx) => ctx.db.insert('users', { displayName, email: `${displayName}@x.test`, ...extra }));
  const epoch = currentEpoch();
  return { t, as, user, epoch };
}

async function squad(s: ReturnType<typeof setup>, owner: Id<'users'>, others: Id<'users'>[]) {
  const podId = await s.as(owner).mutation(api.pods.create, { name: 'Dawn Patrol', emoji: FIRE });
  const pod = await s.t.run((ctx) => ctx.db.get(podId));
  for (const o of others) {
    await s.as(o).mutation(api.pods.requestJoin, { code: pod!.inviteCode });
    await s.as(owner).mutation(api.pods.approve, { podId, userId: o });
  }
  return podId;
}

async function post(s: ReturnType<typeof setup>, who: Id<'users'>, angle: 'front' | 'side' | 'back' = 'front', day = DAY) {
  const storageId = await s.t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })));
  await s.as(who).mutation(api.checkins.savePhoto, { day, angle, storageId, width: 10, height: 13 });
  return storageId;
}

const inbox = (s: ReturnType<typeof setup>, id: Id<'users'>) => s.as(id).query(api.notifications.list, {});
const scheduled = (s: ReturnType<typeof setup>) => s.t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());

describe('squads', () => {
  test('join needs the owner, and both sides are told', async () => {
    const s = setup();
    const a = await s.user('Ana');
    const b = await s.user('Ben');
    const podId = await s.as(a).mutation(api.pods.create, { name: 'Dawn Patrol', emoji: FIRE });
    const pod = await s.t.run((ctx) => ctx.db.get(podId));
    expect(pod!.inviteCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    await s.as(b).mutation(api.pods.requestJoin, { code: pod!.inviteCode.toLowerCase() });
    expect(await s.as(b).query(api.pods.list, {})).toHaveLength(0);
    expect((await inbox(s, a))[0].title).toBe('Ben wants to join \u{1F525} Dawn Patrol');
    expect(await s.as(a).query(api.pods.incomingRequests, {})).toHaveLength(1);

    await expect(s.as(b).mutation(api.pods.approve, { podId, userId: b })).rejects.toThrow('Only the squad owner');
    await s.as(a).mutation(api.pods.approve, { podId, userId: b });
    expect((await s.as(b).query(api.pods.list, {}))[0].memberCount).toBe(2);
    expect((await inbox(s, b))[0].title).toContain("You're in");
  });

  test('free accounts get one squad; Pro gets more', async () => {
    const s = setup();
    const free = await s.user('Free');
    const pro = await s.user('Pro', { proUntil: Date.now() + 86400e3 });
    await s.as(free).mutation(api.pods.create, { name: 'One', emoji: FIRE });
    await expect(s.as(free).mutation(api.pods.create, { name: 'Two', emoji: FIRE })).rejects.toThrow('Free accounts get one squad');
    await s.as(pro).mutation(api.pods.create, { name: 'One', emoji: FIRE });
    await s.as(pro).mutation(api.pods.create, { name: 'Two', emoji: FIRE });
    expect(await s.as(pro).query(api.pods.list, {})).toHaveLength(2);
  });

  test('squads cap at 8', async () => {
    const s = setup();
    const owner = await s.user('Owner');
    const seven = await Promise.all([1, 2, 3, 4, 5, 6, 7].map((i) => s.user(`M${i}`)));
    const podId = await squad(s, owner, seven);
    const pod = await s.t.run((ctx) => ctx.db.get(podId));
    const ninth = await s.user('Ninth');
    await expect(s.as(ninth).mutation(api.pods.requestJoin, { code: pod!.inviteCode })).rejects.toThrow('is full');
  });

  test('owner leaving hands the squad on; last one out closes it', async () => {
    const s = setup();
    const a = await s.user('Ana');
    const b = await s.user('Ben');
    const podId = await squad(s, a, [b]);
    await s.as(a).mutation(api.pods.leave, { podId });
    expect((await s.t.run((ctx) => ctx.db.get(podId)))!.createdBy).toBe(b);
    await s.as(b).mutation(api.pods.leave, { podId });
    expect(await s.t.run((ctx) => ctx.db.get(podId))).toBeNull();
  });
});

describe('access', () => {
  test('outsiders see nothing and can touch nothing', async () => {
    const s = setup();
    const a = await s.user('Ana');
    const b = await s.user('Ben');
    const x = await s.user('Xena');
    const podId = await squad(s, a, [b]);
    await post(s, a);
    const checkin = await s.t.run((ctx) => ctx.db.query('checkins').first());

    await expect(s.as(x).query(api.feed.thread, { podId, day: DAY, epoch: s.epoch })).rejects.toThrow('not in that squad');
    await expect(s.as(x).mutation(api.feed.toggleReaction, { checkinId: checkin!._id, emoji: FIRE })).rejects.toThrow();
    await expect(s.as(x).mutation(api.feed.nudge, { podId, toUser: b, day: DAY })).rejects.toThrow();
    // Signed out: reads come back empty (a screen may still be subscribed),
    // writes are refused.
    expect(await s.t.query(api.pods.list, {})).toEqual([]);
    expect(await s.t.query(api.feed.thread, { podId, day: DAY, epoch: s.epoch })).toBeNull();
    await expect(s.t.mutation(api.pods.create, { name: 'Nope', emoji: FIRE })).rejects.toThrow('Not signed in');
    expect(await inbox(s, x)).toHaveLength(0);
  });

  test('photo links refuse far-off epochs', async () => {
    const s = setup();
    const a = await s.user('Ana');
    await expect(s.as(a).query(api.checkins.mine, { day: DAY, epoch: s.epoch + 5 })).rejects.toThrow('Stale clock');
  });
});

describe('posting', () => {
  test('first photo is the post: squad told once, day counts', async () => {
    const s = setup();
    const a = await s.user('Ana');
    const b = await s.user('Ben');
    const c = await s.user('Cam');
    const outsider = await s.user('Xena');
    await squad(s, a, [b, c]);
    await s.as(a).mutation(api.checkins.setTrained, { day: DAY, trained: true });
    expect(await s.as(a).query(api.checkins.loggedDays, {})).toEqual([]);

    await post(s, a, 'front');
    await post(s, a, 'side');
    for (const who of [b, c]) {
      const notes = (await inbox(s, who)).filter((n) => n.kind === 'post');
      expect(notes).toHaveLength(1);
      expect(notes[0].title).toBe('Ana just checked in');
    }
    expect((await inbox(s, a)).filter((n) => n.kind === 'post')).toHaveLength(0);
    expect(await inbox(s, outsider)).toHaveLength(0);
    expect(await s.as(a).query(api.checkins.loggedDays, {})).toEqual([DAY]);

    const pushes = (await scheduled(s)).filter((f) => f.name.includes('pushNode'));
    expect(pushes.some((f) => JSON.stringify(f.args).includes('Ana just checked in'))).toBe(true);
  });

  test('a retake replaces the file', async () => {
    const s = setup();
    const a = await s.user('Ana');
    const first = await post(s, a, 'front');
    await post(s, a, 'front');
    expect(await s.t.run((ctx) => ctx.storage.get(first))).toBeNull();
    const mine = await s.as(a).query(api.checkins.mine, { day: DAY, epoch: s.epoch });
    expect(mine!.photos).toHaveLength(1);
  });

  test('thread: entries, waiting row, and privacy of "trained"', async () => {
    const s = setup();
    const a = await s.user('Ana', { shareTrained: false });
    const b = await s.user('Ben');
    const podId = await squad(s, a, [b]);
    await s.as(a).mutation(api.checkins.setTrained, { day: DAY, trained: true });
    await s.as(a).mutation(api.checkins.setNote, { day: DAY, note: 'private' });
    await post(s, a, 'side');
    await post(s, a, 'front');

    const th = (await s.as(b).query(api.feed.thread, { podId, day: DAY, epoch: s.epoch }))!;
    expect(th.entries).toHaveLength(1);
    expect(th.entries[0].photos.map((p) => p.angle)).toEqual(['front', 'side']);
    expect(th.entries[0].trained).toBe(false);
    expect(th.entries[0].note).toBeNull();
    expect(th.waiting.map((w) => w.displayName)).toEqual(['Ben']);
    expect(th.entries[0].photos[0].url).toMatch(/^https:\/\/site\.test\/photo\?id=/);
  });

  test('streaks survive until a day has fully passed', async () => {
    const s = setup();
    const a = await s.user('Ana');
    const b = await s.user('Ben');
    const podId = await squad(s, a, [b]);
    for (const d of ['2026-09-27', '2026-09-28', '2026-09-29']) await post(s, a, 'front', d);
    const streakOf = async (day: string) =>
      (await s.as(b).query(api.feed.thread, { podId, day, epoch: s.epoch }))!.members.find((m) => m.id === a)!.streak;
    expect(await streakOf('2026-09-30')).toBe(3); // today not posted yet: still alive
    await post(s, a, 'front', '2026-09-30');
    expect(await streakOf('2026-09-30')).toBe(4);
    expect(await streakOf('2026-10-02')).toBe(0); // Oct 1 passed unposted
  });
});

describe('reactions and nudges', () => {
  test('reactions notify the owner; same emoji removes; no self-reactions', async () => {
    const s = setup();
    const a = await s.user('Ana');
    const b = await s.user('Ben');
    await squad(s, a, [b]);
    await post(s, a);
    const checkinId = (await s.t.run((ctx) => ctx.db.query('checkins').first()))!._id;

    await s.as(b).mutation(api.feed.toggleReaction, { checkinId, emoji: FIRE });
    const note = (await inbox(s, a)).find((n) => n.kind === 'reaction');
    expect(note?.emoji).toBe(FIRE);
    expect(note?.title).toBe('Ben reacted to your check-in');

    await s.as(b).mutation(api.feed.toggleReaction, { checkinId, emoji: FIRE });
    expect(await s.t.run((ctx) => ctx.db.query('reactions').collect())).toHaveLength(0);
    await s.as(b).mutation(api.feed.toggleReaction, { checkinId, emoji: FIRE });
    expect((await inbox(s, a)).filter((n) => n.kind === 'reaction')).toHaveLength(1); // deduped
    await expect(s.as(a).mutation(api.feed.toggleReaction, { checkinId, emoji: FIRE })).rejects.toThrow();
    await expect(s.as(b).mutation(api.feed.toggleReaction, { checkinId, emoji: 'x' })).rejects.toThrow('Not a reaction');
  });

  test('a nudge lands once, and not on someone who already posted', async () => {
    const s = setup();
    const a = await s.user('Ana');
    const b = await s.user('Ben');
    const c = await s.user('Cam');
    const podId = await squad(s, a, [b, c]);
    await s.as(a).mutation(api.feed.nudge, { podId, toUser: b, day: DAY });
    await s.as(a).mutation(api.feed.nudge, { podId, toUser: b, day: DAY });
    expect((await inbox(s, b)).filter((n) => n.kind === 'nudge')).toHaveLength(1);
    expect(await s.as(b).query(api.feed.nudgesForMe, { day: DAY })).toEqual(['Ana']);

    await post(s, c);
    await s.as(a).mutation(api.feed.nudge, { podId, toUser: c, day: DAY });
    expect((await inbox(s, c)).filter((n) => n.kind === 'nudge')).toHaveLength(0);
    await expect(s.as(a).mutation(api.feed.nudge, { podId, toUser: a, day: DAY })).rejects.toThrow();
  });
});

describe('reminders', () => {
  test('due device is reminded if not posted, then moves to tomorrow', async () => {
    const s = setup();
    const a = await s.user('Ana');
    const b = await s.user('Ben');
    for (const d of ['2026-09-28', '2026-09-29']) await post(s, a, 'front', d);
    const now = Date.now();
    await s.as(a).mutation(api.push.subscribe, {
      endpoint: 'https://push.test/a', p256dh: 'k', auth: 'x', reminderOn: true,
      nextReminderAt: now - 5 * 60e3, nextReminderDay: DAY,
    });
    await s.as(b).mutation(api.push.subscribe, {
      endpoint: 'https://push.test/b', p256dh: 'k', auth: 'x', reminderOn: true,
      nextReminderAt: now - 5 * 60e3, nextReminderDay: DAY,
    });
    await post(s, b, 'front', DAY); // Ben already posted today

    expect(await s.t.mutation(internal.push.runReminders, {})).toBe(1);
    const n = (await inbox(s, a)).find((x) => x.kind === 'reminder');
    expect(n?.title).toBe('Your 2-day streak is on the line');
    expect((await inbox(s, b)).find((x) => x.kind === 'reminder')).toBeUndefined();

    const sub = await s.t.run((ctx) => ctx.db.query('pushSubscriptions').withIndex('by_endpoint', (q) => q.eq('endpoint', 'https://push.test/a')).unique());
    expect(sub!.nextReminderDay).toBe('2026-10-01');
    expect(sub!.nextReminderAt).toBeGreaterThan(now);
    expect(await s.t.mutation(internal.push.runReminders, {})).toBe(0); // once per day
  });

  test('a stale reminder (device was off) is skipped, not sent late', async () => {
    const s = setup();
    const a = await s.user('Ana');
    await s.as(a).mutation(api.push.subscribe, {
      endpoint: 'https://push.test/a', p256dh: 'k', auth: 'x', reminderOn: true,
      nextReminderAt: Date.now() - 3 * 86400e3 + 60e3, nextReminderDay: '2026-09-27',
    });
    expect(await s.t.mutation(internal.push.runReminders, {})).toBe(0);
    const sub = await s.t.run((ctx) => ctx.db.query('pushSubscriptions').first());
    expect(sub!.nextReminderAt).toBeGreaterThan(Date.now());
    expect(sub!.nextReminderDay).toBe('2026-09-30');
  });

  test('a browser belongs to whoever signed in last', async () => {
    const s = setup();
    const a = await s.user('Ana');
    const b = await s.user('Ben');
    const args = { endpoint: 'https://push.test/shared', p256dh: 'k', auth: 'x', reminderOn: false };
    await s.as(a).mutation(api.push.subscribe, args);
    await s.as(b).mutation(api.push.subscribe, args);
    const rows = await s.t.run((ctx) => ctx.db.query('pushSubscriptions').collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(b);
  });
});

describe('http', () => {
  test('photo links work, expire, and cannot be forged', async () => {
    const s = setup();
    const a = await s.user('Ana');
    await post(s, a);
    const url = (await s.as(a).query(api.checkins.mine, { day: DAY, epoch: s.epoch }))!.photos[0].url;
    const path = url.replace('https://site.test', '');

    const ok = await s.t.fetch(path);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toBe('image/jpeg');
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));

    expect((await s.t.fetch(path.replace(/s=[^&]+/, 's=forged'))).status).toBe(403);
    const exp = Number(new URL(url).searchParams.get('e'));
    expect((await s.t.fetch(path.replace(`e=${exp}`, `e=${exp + EPOCH_MS}`))).status).toBe(403);

    vi.setSystemTime(exp + 1000);
    expect((await s.t.fetch(path)).status).toBe(403);
  });

  test('RevenueCat webhook sets Pro, only with the secret', async () => {
    const s = setup();
    const a = await s.user('Ana');
    const until = Date.now() + 30 * 86400e3;
    const send = (auth: string, type: string) =>
      s.t.fetch('/revenuecat', {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: { type, app_user_id: a, expiration_at_ms: until } }),
      });
    expect((await send('Bearer wrong', 'INITIAL_PURCHASE')).status).toBe(403);
    expect((await send('Bearer rc-secret', 'INITIAL_PURCHASE')).status).toBe(200);
    expect((await s.as(a).query(api.users.me, {}))!.proUntil).toBe(until);
    await send('Bearer rc-secret', 'EXPIRATION');
    expect((await s.as(a).query(api.users.me, {}))!.proUntil).toBeLessThanOrEqual(Date.now());
  });
});

describe('account deletion', () => {
  test('removes everything the user owns and leaves squad-mates intact', async () => {
    const s = setup();
    const a = await s.user('Ana');
    const b = await s.user('Ben');
    const podOwnedByA = await squad(s, a, [b]);
    await post(s, a);
    await post(s, b);
    const bCheckin = (await s.t.run((ctx) => ctx.db.query('checkins').collect())).find((c) => c.userId === b)!;
    await s.as(a).mutation(api.feed.toggleReaction, { checkinId: bCheckin._id, emoji: FIRE });
    await s.as(a).mutation(api.push.subscribe, { endpoint: 'https://push.test/a', p256dh: 'k', auth: 'x', reminderOn: true });

    await s.as(a).mutation(api.users.deleteAccount, {});

    const left = await s.t.run(async (ctx) => ({
      user: await ctx.db.get(a),
      pod: await ctx.db.get(podOwnedByA),
      checkins: await ctx.db.query('checkins').collect(),
      photos: await ctx.db.query('photos').collect(),
      reactions: await ctx.db.query('reactions').collect(),
      members: await ctx.db.query('podMembers').collect(),
      subs: await ctx.db.query('pushSubscriptions').collect(),
      files: await ctx.db.system.query('_storage').collect(),
    }));
    expect(left.user).toBeNull();
    expect(left.pod).toBeNull();
    expect(left.checkins.map((c) => c.userId)).toEqual([b]);
    expect(left.photos.map((p) => p.userId)).toEqual([b]);
    expect(left.reactions).toHaveLength(0);
    expect(left.members).toHaveLength(0);
    expect(left.subs).toHaveLength(0);
    expect(left.files).toHaveLength(1);
  });
});
