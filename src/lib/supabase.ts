import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import Storage from 'expo-sqlite/kv-store';
import { AppState } from 'react-native';

// The Gymshot Supabase project. The publishable key is safe to ship in the
// client - row-level security is what protects the data, not the key.
const SUPABASE_URL = 'https://xhzxqseqbqlfzrjycrug.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_8PZKDg7ZKahOJVCQspAFRw_i8VlMnNl';

// Session persistence goes through expo-sqlite's key-value store, which is
// already in the app - no extra storage dependency.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: Storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Supabase recommends only refreshing tokens while the app is foregrounded.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** Best-effort push of the local display name to the remote profile. */
export async function pushDisplayName(name: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return;
  await supabase.from('profiles').update({ display_name: name, updated_at: new Date().toISOString() }).eq('id', userId);
}
