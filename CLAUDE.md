# Podshot

Daily body-progress photos shared with a small private pod of friends.
Expo (React Native) app, TypeScript, local-first SQLite. See `README.md` for
the product spec, the decisions taken on its open questions, and build steps.

## Expo SDK 54 — read the versioned docs

Several Expo APIs changed shape recently. Before writing code against
`expo-file-system`, `expo-image-manipulator`, `expo-sqlite`, `expo-camera`, or
`react-native-reanimated`, check <https://docs.expo.dev/versions/v54.0.0/> for
that module. Notably in this project:

- `expo-file-system` uses the `File` / `Directory` / `Paths` classes, not the
  old `FileSystem.*` functions (`expo-file-system/legacy` has those).
- `expo-image-manipulator` uses `ImageManipulator.manipulate(uri)` then
  `renderAsync()` then `saveAsync()`.
- Reanimated is v4, which requires the New Architecture. There is deliberately
  **no `babel.config.js`** — `babel-preset-expo` ships inside `expo` and wires
  the worklets plugin itself. Adding one breaks the bundle.
- **The project is pinned to SDK 54 on purpose**, not because 54 is current.
  SDK 55 raised nothing, but SDK 56 raised the iOS floor from 15.1 to 16.4,
  and the target phone's Expo Go is an SDK 54 build. Do not bump the SDK
  without confirming the device's Expo Go can still load it.
- `expo-image` has no config plugin in SDK 54 — it must not appear in
  `app.json` `plugins` (it does in 57+).

## Layout

```
app/                 expo-router routes (file = screen)
  (tabs)/            today | pods | journey | settings
  capture.tsx        camera + ghost-overlay alignment
  timelapse.tsx      frame playback and album export
  pod/               [id] detail, new, join (deep-link target)
src/theme/           tokens + ThemeProvider; nothing hardcodes a color
src/components/      UI primitives (Text, Squish, Card, Segmented, ...)
src/features/        composed, domain-aware pieces (CheckInCard)
src/db/              schema + migrations + all SQL
src/state/AppStore   the one store; screens never touch SQL directly
src/lib/             date, ids, streak, photo files, health, reminders, demo
```

## Conventions

- **All styling goes through `useTheme()`.** No literal hex outside
  `src/theme/tokens.ts` (the camera and timelapse overlays are the exception —
  they sit on top of a photo, not on a themed surface).
- **Everything tappable uses `Squish`**, so touch feedback is uniform.
- **All SQL lives in `src/db/queries.ts`.** Screens call `useStore()`.
- Migrations in `src/db/schema.ts` are append-only. Never edit a shipped
  version block; add a new `if (version < N)`.
- Day keys are local-calendar `YYYY-MM-DD` strings (`src/lib/date.ts`), never
  raw timestamps — a check-in belongs to a day, not an instant.
- ASCII only in source. Emoji go in as `\u{...}` escapes.

## Product guardrails

These are the point of the app, not preferences. Reject changes that break them:

- No sets, reps, exercise library, or progression charts. The workout log is a
  boolean plus a free-text note.
- No manual calorie or weight entry. Those numbers are read-only from
  Health/Health Connect, or absent.
- No public or discoverable feed, no follower counts. Pods are invite-only and
  capped at 8.
- One check-in per person per day, broadcast to every pod they belong to.
  Privacy settings are therefore **global per user**, never per pod.

## Commands

```
npm start            expo dev server
npm run typecheck    tsc --noEmit
npm run doctor       expo-doctor (must stay at 21/21)
npm run android      prebuild + run on a device/emulator (needs JDK 17 + SDK)
npm run bundle       verify both platforms bundle without a native toolchain
```
