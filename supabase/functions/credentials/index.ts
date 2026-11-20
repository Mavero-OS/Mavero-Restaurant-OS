// Saves a restaurant's payment gateway credentials on the server (never readable from the browser)
// and flags the gateway as ready so the guest app offers online payment.
import { admin, caller, cors, isAdmin, json, memberRole, patchDoc } from '../_shared/common.ts';

const FIELDS: Record<string, string[]> = {
  sslcommerz: ['store_id', 'store_passwd'],
  bkash: ['app_key', 'app_secret', 'username', 'password'],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const me = await caller(req);
    if (!me || me.anon) return json({ error: 'Please sign in again.' }, 401);
    const { action, rid, provider, config, sandbox } = await req.json();
    const db = admin();
    if (!(await isAdmin(db, me.id)) && !['owner', 'manager'].includes((await memberRole(db, rid, me.id)) || '')) {
      return json({ error: 'Only the owner or a manager can change payment settings.' }, 403);
    }
    if (!FIELDS[provider]) return json({ error: 'Unknown gateway.' }, 400);

    if (action === 'remove') {
      await db.from('payment_credentials').delete().eq('rid', rid).eq('provider', provider);
      await patchDoc(db, 'restaurants', rid, { payments: { gateways: { [provider]: { ready: false, sandbox: true } } } });
      return json({ ok: true });
    }

    const clean: Record<string, string> = {};
    for (const f of FIELDS[provider]) {
      const v = String(config?.[f] ?? '').trim();
      if (!v) return json({ error: `Missing ${f.replace('_', ' ')}.` }, 400);
      clean[f] = v;
    }
    const { error } = await db.from('payment_credentials').upsert({ rid, provider, config: clean, updated_at: new Date().toISOString() });
    if (error) return json({ error: error.message }, 500);
    await patchDoc(db, 'restaurants', rid, { payments: { gateways: { [provider]: { ready: true, sandbox: sandbox !== false, updatedAt: Date.now() } } } });
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
