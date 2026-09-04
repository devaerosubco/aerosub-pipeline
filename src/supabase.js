// The one Supabase client for the whole web app. Only the public anon key and
// URL ship here (PRD §8.2) — never a service key. Sessions are handled by
// supabase-js defaults: PKCE, persisted to localStorage, auto-refreshed, and
// the confirm / recovery tokens in the URL are picked up automatically.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env ' +
    'and fill in the values from `npx supabase status`.'
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
