/**
 * Seam for the optional native health module.
 *
 * Metro resolves `require('...')` statically even inside try/catch, so a
 * conditional import of an uninstalled package fails the bundle. Instead the
 * whole optional dependency lives behind this one file.
 *
 * To enable real Health reads in a development or production build:
 *   1. npx expo install react-native-health          (iOS / HealthKit)
 *      npx expo install react-native-health-connect  (Android / Health Connect)
 *   2. Replace the null export below with the platform-appropriate import.
 *   3. Implement `readRange` in src/lib/health.ts against that module.
 *
 * Until then the app runs on the simulated provider, which is labelled as such
 * everywhere it appears in the UI.
 */
export const nativeHealthModule: unknown = null;
