import { createClient } from '@supabase/supabase-js';

// Same Gymshot project as the mobile app. The publishable key is safe in the
// client; row-level security protects the data.
const SUPABASE_URL = 'https://xhzxqseqbqlfzrjycrug.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_8PZKDg7ZKahOJVCQspAFRw_i8VlMnNl';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
