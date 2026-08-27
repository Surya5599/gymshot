import { Platform } from 'react-native';

/**
 * Seam for RevenueCat (react-native-purchases), which only exists in a
 * development/production build - in Expo Go the require throws and every
 * export degrades gracefully.
 *
 * To go live: paste the platform public API keys from RevenueCat ->
 * Project settings -> API keys. Purchases write profiles.pro_until through
 * the revenuecat-webhook edge function; the app never grants Pro itself.
 */
const RC_IOS_KEY = ''; // appl_...
const RC_ANDROID_KEY = ''; // goog_...

export type ProPackage = {
  identifier: string;
  packageType: string;
  product: { priceString: string };
};

type PurchasesModule = {
  configure(config: { apiKey: string; appUserID?: string | null }): void;
  getOfferings(): Promise<{
    current: { availablePackages: ProPackage[]; annual: ProPackage | null; monthly: ProPackage | null } | null;
  }>;
  purchasePackage(pkg: ProPackage): Promise<unknown>;
  restorePurchases(): Promise<unknown>;
  showManageSubscriptions(): Promise<void>;
};

declare const require: (moduleId: string) => unknown;

function load(): PurchasesModule | null {
  try {
    const mod = require('react-native-purchases') as { default: PurchasesModule };
    return mod.default ?? (mod as unknown as PurchasesModule);
  } catch {
    return null; // Expo Go, or a binary built without the module.
  }
}

const purchases = load();

function apiKey(): string {
  return Platform.OS === 'ios' ? RC_IOS_KEY : RC_ANDROID_KEY;
}

/** True when the native module exists and a key is configured. */
export function billingAvailable(): boolean {
  return purchases !== null && apiKey().length > 0;
}

let configuredFor: string | null = null;

/** Safe to call repeatedly; reconfigures when the signed-in user changes. */
export function configureBilling(userId: string): void {
  if (!purchases || !billingAvailable() || configuredFor === userId) return;
  purchases.configure({ apiKey: apiKey(), appUserID: userId });
  configuredFor = userId;
}

export async function proPackages(): Promise<{ annual: ProPackage | null; monthly: ProPackage | null }> {
  if (!purchases) return { annual: null, monthly: null };
  const offerings = await purchases.getOfferings();
  return {
    annual: offerings.current?.annual ?? null,
    monthly: offerings.current?.monthly ?? null,
  };
}

export async function buyPackage(pkg: ProPackage): Promise<void> {
  if (!purchases) throw new Error('Billing is not available in this build.');
  await purchases.purchasePackage(pkg);
}

export async function restorePurchases(): Promise<void> {
  if (!purchases) throw new Error('Billing is not available in this build.');
  await purchases.restorePurchases();
}

/** Opens the platform's own subscription management sheet (cancel lives there). */
export async function manageSubscription(): Promise<void> {
  if (!purchases) throw new Error('Billing is not available in this build.');
  await purchases.showManageSubscriptions();
}
