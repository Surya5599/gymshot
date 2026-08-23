import { Platform } from 'react-native';

/**
 * Seam for the optional native health module.
 *
 * iOS uses @kingstinct/react-native-healthkit (Nitro-based, New Architecture).
 * It only functions in a development or production build; in Expo Go the
 * require below throws because the Nitro native module is absent, and the app
 * falls back to the simulated provider.
 *
 * Android (Health Connect via react-native-health-connect) is not wired yet;
 * this export stays null there so Android keeps the simulated provider.
 */

/** The slice of the healthkit API the app uses. Kept manual so the rest of
 *  the app never imports the package's types directly. */
export type HealthKitModule = {
  isHealthDataAvailable(): boolean;
  requestAuthorization(toRequest: { toRead?: readonly string[] }): Promise<boolean>;
  queryQuantitySamples(
    identifier: string,
    options: {
      filter?: { date?: { startDate?: Date; endDate?: Date } };
      /** Non-positive fetches all samples in range. */
      limit?: number;
      ascending?: boolean;
      unit?: string;
    }
  ): Promise<readonly { quantity: number; unit: string; startDate: Date; endDate: Date }[]>;
};

declare const require: (moduleId: string) => unknown;

function load(): HealthKitModule | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return require('@kingstinct/react-native-healthkit') as HealthKitModule;
  } catch {
    return null; // Expo Go, or a binary built without the module.
  }
}

export const nativeHealthModule: HealthKitModule | null = load();
