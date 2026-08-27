import { Purchases } from '@revenuecat/purchases-js';

import { getProfile, isPro } from './api';

/**
 * RevenueCat Web Billing (Stripe underneath). Paste the Web Billing public
 * key (rcb_...) from RevenueCat -> Project settings -> API keys to switch the
 * upsell from "coming soon" to a live checkout. Entitlement lands via the
 * revenuecat-webhook edge function writing profiles.pro_until.
 */
// NEVER put a Stripe key here, especially not a secret (sk_...) key - this
// file ships in the public JS bundle. Only the RevenueCat Web Billing public
// key belongs here: rcb_... (or rcb_sb_... for sandbox).
const REVENUECAT_WEB_KEY = 'rcb_sb_mQKBwpAgVNuuEaUoLaKRDsSiL';

export type ProPlan = 'annual' | 'monthly';

export function billingEnabled(): boolean {
  return REVENUECAT_WEB_KEY.length > 0;
}

/** Opens RevenueCat's checkout for the plan. Resolves when payment is done. */
export async function purchasePro(userId: string, plan: ProPlan): Promise<void> {
  const purchases = Purchases.isConfigured()
    ? Purchases.getSharedInstance()
    : Purchases.configure(REVENUECAT_WEB_KEY, userId);
  const offerings = await purchases.getOfferings();
  const pkg = plan === 'annual' ? offerings.current?.annual : offerings.current?.monthly;
  if (!pkg) throw new Error('That plan is not available right now.');
  await purchases.purchase({ rcPackage: pkg });
}

/**
 * The webhook usually lands within a couple of seconds of checkout; poll the
 * profile until Pro shows up so the UI can unlock without a manual refresh.
 */
export async function waitForPro(timeoutMs = 20000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const profile = await getProfile().catch(() => null);
    if (isPro(profile)) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/**
 * Where the subscriber cancels or changes plan: RevenueCat's hosted portal.
 * Null when this user has no store-managed subscription (e.g. Pro granted
 * manually), or when billing is not configured.
 */
export async function getManagementUrl(userId: string): Promise<string | null> {
  if (!billingEnabled()) return null;
  const purchases = Purchases.isConfigured()
    ? Purchases.getSharedInstance()
    : Purchases.configure(REVENUECAT_WEB_KEY, userId);
  const info = await purchases.getCustomerInfo();
  return info.managementURL;
}
