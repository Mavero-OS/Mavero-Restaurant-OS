// Connection to Supabase (live mode). Without these two settings the app runs in
// demo mode: everything works in this browser only, with sample restaurants.
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
export const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL || '').trim();
export const LIVE = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export const sb = LIVE
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'thali-auth' },
      realtime: { params: { eventsPerSecond: 20 } },
    })
  : null;

const FRIENDLY = {
  42501: 'You are not allowed to do that.',
  P0002: 'That item no longer exists. Refresh and try again.',
};

export function friendlyError(e) {
  if (!e) return 'Something went wrong.';
  const msg = e.message || String(e);
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'No internet connection. Check the Wi-Fi and try again.';
  if (e.code && FRIENDLY[e.code] && !/^[A-Z]/.test(msg)) return FRIENDLY[e.code];
  return msg.replace(/^ERROR:\s*/, '');
}

export async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(friendlyError(error));
  return data;
}

// Calls one of the Supabase Edge Functions in supabase/functions/
export async function callFunction(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try {
      const j = await error.context.json();
      if (j && j.error) msg = j.error;
    } catch (e) {}
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}
