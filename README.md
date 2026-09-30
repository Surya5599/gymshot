# GymShot

A daily body-progress-photo app where you and a small circle of friends see
each other's photos, creating mutual accountability — without being a workout
tracker.

Expo / React Native, TypeScript, cross-platform (iOS + Android), local-first.

---

## Status

The v1 feature set from the spec is implemented and both platforms bundle
cleanly. What is real, and what is honestly not, is listed below.

| v1 must-have | State |
|---|---|
| Daily photo capture, front/side/back, ghost overlay of the last shot at that angle | Done — `app/capture.tsx`, with a UI-thread opacity slider and a thirds/plumb grid |
| Private pods, 3–8 people, invite-only via link or 6-char code | Done — `app/pod/*`, deep link `gymshot://pod/join?code=ABC123` |
| Streak tracking + days-logged-this-month | Done — `src/lib/streak.ts`, animated ring on Today |
| Friend feed, most recent day only | Done — `src/features/PodThread.tsx`, an iMessage-style thread; history is not scrollable by design |
| Lightweight reactions, pod-only | Done — closed set of 5 emoji as iMessage-style tapbacks, one per person per check-in |
| Privacy controls: face blur, local-first storage | Done — global per-user, see below |
| Personal timelapse | Playback + save-frames-to-album done; **mp4 export not done** (needs a native encoder) |
| Lightweight workout log: "I trained today" + note | Done |
| Health read-only (weight, calories) | **Interface done, native read not wired** — runs on a labelled simulated provider |
| Multi-pod membership, one check-in broadcasts to all | Done |

### The two honest gaps

1. **No sync backend.** Everything is local SQLite. Pods, invite codes, and
   the feed all work, but only within one device. `src/state/AppStore.tsx` is
   the single seam where a server would attach. Until then, Settings has a
   **Load demo pod** action that seeds three clearly-labelled demo pod-mates
   with two weeks of history, because a pod of one cannot demonstrate the
   social half of the product.

2. **Health reads are simulated.** Apple HealthKit and Android Health Connect
   need native modules (`react-native-health`,
   `react-native-health-connect`) that do not exist in the managed runtime.
   `src/lib/health.ts` defines the provider interface and ships a
   deterministic simulated provider; `src/lib/nativeHealthModule.ts` is a
   one-file seam with instructions for switching it on in a dev build. The UI
   always says which provider it is showing.

Neither gap is papered over in the UI.

---

## Backend: Convex

Accounts, squads, check-ins, photos, reactions, nudges, the activity inbox,
web push, and Pro entitlement all live in one Convex deployment. The code
is in `web/convex/`; both the web app and the Expo app talk to it. The Expo
app stays local-first and only uses Convex for sign-in and the Pro flag.

| Piece | Where |
|---|---|
| Schema (day keys, one check-in per person per day, 8-person squads) | `web/convex/schema.ts` |
| Access rules - every function checks the caller, there is no RLS | `web/convex/lib/access.ts` |
| Squads, join requests, approvals, free-tier limit | `web/convex/pods.ts` |
| Check-ins, photo upload, the first photo as "the post" | `web/convex/checkins.ts` |
| The live squad thread, reactions, nudges | `web/convex/feed.ts` |
| Inbox + web push, one `announce()` for every event | `web/convex/lib/announce.ts`, `push.ts`, `pushNode.ts` |
| Daily reminder, per device, at its local time | `web/convex/push.ts` + `crons.ts` |
| Private photo links (signed, expire in 12-24h) | `web/convex/lib/photoUrl.ts`, `/photo` in `http.ts` |
| RevenueCat webhook, account deletion | `http.ts`, `billing.ts`, `users.ts` |

Queries are live: a squad-mate posting, reacting, or nudging updates every
open screen by itself, and the server-written inbox becomes toasts, the bell
count, and web pushes.

Tests: `cd web && npm test` runs the backend suite (`web/tests/`) against
convex-test - access control, squad cap and free tier, posting and
announcements, the thread's privacy rules, streaks, reminders, photo-link
forgery and expiry, the billing webhook, and account deletion.

### One-time setup

```bash
cd web
npx convex dev                 # log in, create the project; writes .env.local
npx @convex-dev/auth           # sign-in keys + SITE_URL for the dev deployment
npx convex env set PHOTO_URL_SECRET "$(openssl rand -hex 32)"
```

Production is the same with `--prod`:

```bash
npx @convex-dev/auth --prod
npx convex env set --prod PHOTO_URL_SECRET "$(openssl rand -hex 32)"
```

Then:

- **Netlify**: add `CONVEX_DEPLOY_KEY` (Convex dashboard -> Settings ->
  Deploy keys -> production). `netlify.toml` runs `convex deploy`, which
  pushes the functions and builds the site against them.
- **Expo / EAS**: set `EXPO_PUBLIC_CONVEX_URL` to the production
  `https://<name>.convex.cloud` URL (`.env` locally, see `.env.example`).
- **Web push** (optional): `npx web-push generate-vapid-keys`, then set
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`
  (`mailto:you@...`) on the deployment. No client change - the app reads
  the public key from the deployment. Without them, notifications stay
  in-app.
- **RevenueCat** (optional): point the webhook at
  `https://<name>.convex.site/revenuecat`, with Authorization
  `Bearer <REVENUECAT_WEBHOOK_AUTH>`, and set that secret on the deployment.

---

## Decisions taken on the spec's open questions

The spec left six questions open. Building required answers; these are the ones
in the code, and each is cheap to change.

**Streak enforcement** — A streak survives until a day has *fully passed*
unlogged. At 11pm with nothing posted you still see yesterday's number, so the
pressure is "don't lose it" rather than "you already lost it". Once a day is
missed the counter resets to zero and the calendar keeps the gap visible,
because a hidden gap is not accountability. Best-ever streak is kept
separately so a reset does not erase the history.

**What the pod sees** — Today only. `feedForDay` never returns history, and
Journey (your full timeline) has no pod-facing equivalent. This is the
privacy-favouring side of that tradeoff: the accountability signal is
"did you show up today", which needs exactly one day of data.

**Per-metric sharing** — Photo and streak are always shared; that is the deal.
"Trained today" defaults to shared, weight and calories default to private.
Weight is the most sensitive number in the app and should not leak by default.

**Global vs per-pod privacy** — Global, as the spec anticipated. One photo is
broadcast unmodified to every pod, so a per-pod blur setting would be a promise
the app cannot keep. Settings says this out loud rather than offering a control
that would silently not apply.

**Cross-platform from day one** — Expo, so one codebase covers both. The only
platform-specific work is the health bridge, which is behind an interface, and
the tab bar's blur (Android falls back to a solid elevated surface).

**Monetization** — Not built. No paywall, no analytics, no accounts. Worth
deciding after the sync backend exists, since a subscription is much easier to
justify once there is a server to pay for.

---

## Design

Warm porcelain surfaces, a soft coral accent, generous rounding, and large
numerals. Everything comes from `src/theme/tokens.ts` — one palette per scheme,
a 4pt spacing scale, a rounded typeface (Nunito), and exactly three springs.

### The pod reads as a chat

The pod surface is a thread, not a feed of cards. Each person's photo arrives
as a message from them - theirs on the left with an avatar, yours on the right
in coral - so three pod-mates posting reads as *three people*, which a grid of
tiles loses. Multiple angles from one person group as consecutive attachments,
the note is its own caption bubble, and reactions attach as tapbacks on the
bubble corner.

Two details carry the product rule rather than just the look:

- **The composer sits where a keyboard would be.** It is the only action
  available, so the one-photo-a-day limit is stated exactly where you would
  try to break it. Once the day is spent it closes to "That is today. Come
  back tomorrow" - closed, not hidden.
- **Who has not posted appears as a typing indicator**, pulsing dots and
  "waiting on Theo, Priya" at the foot of the thread. The gap is named in the
  thread without anyone having to say it, which is the whole accountability
  mechanic.

Motion is deliberate rather than decorative:

- Every tappable thing squishes on press (`Squish`), so feedback is uniform.
- The streak arc springs in on mount and on change — the one reward moment.
- Segmented controls slide a pill; labels only cross-fade.
- Feed cards stagger in at 70ms intervals.
- Reaction taps pop and lift, then settle on a bouncy spring.
- The tab bar's active item lifts and reveals its label.

Light and dark are both first-class and follow the system setting.

---

## Running it

```bash
npm install
npm start          # then scan the QR code with Expo Go
```

Camera, SQLite, haptics, and blur all work in Expo Go. Reanimated 4 requires
the New Architecture, which is the SDK 54 default.

**The project is pinned to Expo SDK 54 deliberately.** SDK 56 raised the iOS
floor from 15.1 to 16.4, so an SDK 56/57 project will not open in an Expo Go
build older than that. Check the SDK version your Expo Go reports before
bumping — `expo-doctor` cannot catch this mismatch for you.

Verify without a native toolchain:

```bash
npm run typecheck  # tsc --noEmit
npm run doctor     # expo-doctor, currently 18/18
npm run bundle     # Metro bundle for both ios and android
```

### Building a real app binary

The Android and iOS projects are generated (continuous native generation) and
are not committed. A device build needs:

- **Android**: JDK 17 and the Android SDK, then `npm run android`.
- **iOS**: macOS with Xcode, then `npm run ios`.
- **Neither**: `npx eas build -p android --profile preview` builds in the
  cloud and needs only an Expo account.

This repo's machine has JDK 8 and no Android SDK, so an APK was not produced
here. Everything upstream of the native toolchain is verified: typecheck,
expo-doctor, iOS and Android Metro bundles, 19 pure-logic checks, and `expo prebuild` generating a
valid Android project with the right permissions
(`CAMERA`, `READ_MEDIA_IMAGES`, `health.READ_WEIGHT`,
`health.READ_NUTRITION`, `health.READ_TOTAL_CALORIES_BURNED`) and the
`gymshot://` deep-link intent filter.

---

## Out of scope, on purpose

Structured workout logging, manual calorie or macro entry, live wearable data,
and any public or discoverable feed. The rule from the spec, kept: if a feature
would make someone open this app *instead of* their lifting app, it is out.
