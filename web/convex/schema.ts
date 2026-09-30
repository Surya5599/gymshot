import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const angle = v.union(v.literal('front'), v.literal('side'), v.literal('back'));
export const tab = v.union(v.literal('today'), v.literal('pods'), v.literal('journey'), v.literal('you'));
export const noticeKind = v.union(
  v.literal('post'),
  v.literal('reaction'),
  v.literal('nudge'),
  v.literal('reminder'),
  v.literal('join'),
  v.literal('info')
);

/**
 * GymShot's data. Day keys are local-calendar YYYY-MM-DD strings, as on
 * the clients: a check-in belongs to a day, not an instant.
 *
 * Convex has no unique indexes, so the uniqueness rules (one check-in per
 * person per day, one photo per angle, one reaction per person, one member
 * row per squad) are enforced inside mutations, which are serializable
 * transactions. The indexes below are what those checks read.
 */
export default defineSchema({
  ...authTables,

  // Convex Auth's users table, extended with the profile.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    displayName: v.optional(v.string()),
    /** Share "trained today" and the note. Absent means yes. */
    shareTrained: v.optional(v.boolean()),
    blurFace: v.optional(v.boolean()),
    /** Pro until this instant (ms). Written only by the billing webhook. */
    proUntil: v.optional(v.number()),
  })
    .index('email', ['email'])
    .index('phone', ['phone']),

  pods: defineTable({
    name: v.string(),
    emoji: v.string(),
    inviteCode: v.string(),
    createdBy: v.id('users'),
  }).index('by_code', ['inviteCode']),

  podMembers: defineTable({
    podId: v.id('pods'),
    userId: v.id('users'),
  })
    .index('by_pod', ['podId'])
    .index('by_user', ['userId'])
    .index('by_pod_user', ['podId', 'userId']),

  joinRequests: defineTable({
    podId: v.id('pods'),
    userId: v.id('users'),
  })
    .index('by_pod', ['podId'])
    .index('by_user', ['userId'])
    .index('by_pod_user', ['podId', 'userId']),

  checkins: defineTable({
    userId: v.id('users'),
    day: v.string(),
    trained: v.boolean(),
    note: v.optional(v.string()),
    /** Has at least one photo. A day counts - for streaks, the thread, and
     *  the month grid - only once it is posted, not when "trained" is
     *  flipped first. */
    posted: v.boolean(),
  }).index('by_user_day', ['userId', 'day']),

  photos: defineTable({
    checkinId: v.id('checkins'),
    userId: v.id('users'),
    day: v.string(),
    angle,
    storageId: v.id('_storage'),
    width: v.number(),
    height: v.number(),
  })
    .index('by_checkin', ['checkinId'])
    .index('by_checkin_angle', ['checkinId', 'angle'])
    .index('by_user_angle_day', ['userId', 'angle', 'day']),

  reactions: defineTable({
    checkinId: v.id('checkins'),
    userId: v.id('users'),
    emoji: v.string(),
  })
    .index('by_checkin', ['checkinId'])
    .index('by_checkin_user', ['checkinId', 'userId'])
    .index('by_user', ['userId']),

  nudges: defineTable({
    podId: v.id('pods'),
    fromUser: v.id('users'),
    toUser: v.id('users'),
    day: v.string(),
  })
    .index('by_to_day', ['toUser', 'day'])
    .index('by_from_pod_day', ['fromUser', 'podId', 'day'])
    .index('by_pod', ['podId']),

  /** The activity inbox, written by the server, read on every device. */
  notifications: defineTable({
    userId: v.id('users'),
    kind: noticeKind,
    title: v.string(),
    body: v.optional(v.string()),
    emoji: v.optional(v.string()),
    tab,
    read: v.boolean(),
    /** Collapses duplicates: one notice per key per user. */
    key: v.string(),
  })
    .index('by_user', ['userId'])
    .index('by_user_key', ['userId', 'key']),

  /** One row per browser that opted in to web push. */
  pushSubscriptions: defineTable({
    userId: v.id('users'),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    reminderOn: v.boolean(),
    /** The next reminder moment (ms) and the local day it belongs to,
     *  computed on the device, which knows its own time zone. */
    nextReminderAt: v.optional(v.number()),
    nextReminderDay: v.optional(v.string()),
  })
    .index('by_endpoint', ['endpoint'])
    .index('by_user', ['userId'])
    .index('by_next_reminder', ['nextReminderAt']),
});
