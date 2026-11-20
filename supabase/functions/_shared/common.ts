// Shared helpers for Thali edge functions (Deno runtime on Supabase).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Service-role client: bypasses row level security. Only ever used on the server.
export const admin = (): SupabaseClient =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export type Caller = { id: string; email: string | null; anon: boolean };

export async function caller(req: Request): Promise<Caller | null> {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data, error } = await admin().auth.getUser(jwt);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null, anon: !!(data.user as { is_anonymous?: boolean }).is_anonymous };
}

export async function isAdmin(db: SupabaseClient, uid: string) {
  const { data } = await db.from('platform_admins').select('user_id').eq('user_id', uid).maybeSingle();
  return !!data;
}

export async function memberRole(db: SupabaseClient, rid: string, uid: string): Promise<string | null> {
  const { data } = await db.from('memberships').select('role').eq('rid', rid).eq('user_id', uid).maybeSingle();
  return data?.role ?? null;
}

// The public website, e.g. https://yourname.github.io/thali/
export const appUrl = () => (Deno.env.get('APP_URL') || '').replace(/[#?].*$/, '');

export const fnUrl = (name: string) => `${Deno.env.get('SUPABASE_URL')}/functions/v1/${name}`;

export async function logEvent(db: SupabaseClient, payment_id: string, provider: string, kind: string, payload: unknown) {
  await db.from('payment_events').insert({ payment_id, provider, kind, payload });
}

// Merge a partial update into a document (server side, trusted)
export async function patchDoc(db: SupabaseClient, table: string, id: string, patch: Record<string, unknown>) {
  const { data, error } = await db.rpc('thali_patch', { p_table: table, p_id: id, p_patch: patch });
  if (error) throw new Error(error.message);
  return data;
}
