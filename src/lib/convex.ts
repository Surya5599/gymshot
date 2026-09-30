import { ConvexReactClient } from 'convex/react';
import Storage from 'expo-sqlite/kv-store';

/**
 * The GymShot Convex deployment - the same one the web app uses. Expo
 * inlines EXPO_PUBLIC_* variables at build time; set EXPO_PUBLIC_CONVEX_URL
 * in .env (dev) or the EAS build environment.
 */
const url = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!url) throw new Error('EXPO_PUBLIC_CONVEX_URL is not set.');

export const convex = new ConvexReactClient(url, { unsavedChangesWarning: false });

/** Convex Auth keeps its tokens in expo-sqlite's key-value store, which is
 *  already in the app - no extra storage dependency. */
export const tokenStorage = {
  getItem: (key: string) => Storage.getItem(key),
  setItem: (key: string, value: string) => Storage.setItem(key, value),
  removeItem: (key: string) => Storage.removeItem(key),
};
