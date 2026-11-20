// Restaurant logins: owners and managers add, remove and reset passwords for their team.
// Platform admins can do this for any restaurant, including creating the first owner.
import { admin, caller, cors, isAdmin, json, memberRole } from '../_shared/common.ts';

const ROLES = ['owner', 'manager', 'staff', 'kitchen'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const me = await caller(req);
    if (!me || me.anon) return json({ error: 'Please sign in again.' }, 401);
    const body = await req.json();
    const { action, rid } = body;
    const db = admin();
    const adminMe = await isAdmin(db, me.id);
    const myRole = await memberRole(db, rid, me.id);
    if (!adminMe && !['owner', 'manager'].includes(myRole || '')) return json({ error: 'Only the owner or a manager can manage logins.' }, 403);

    if (action === 'create') {
      const email = String(body.email || '').trim().toLowerCase();
      const role = String(body.role || 'staff');
      const name = String(body.name || '').trim().slice(0, 60);
      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
      if (!ROLES.includes(role)) return json({ error: 'Unknown access level.' }, 400);
      if (role === 'owner' && !adminMe && myRole !== 'owner') return json({ error: 'Only an owner can add another owner.' }, 403);
      const { data: rest } = await db.from('restaurants').select('id').eq('id', rid).maybeSingle();
      if (!rest) return json({ error: 'Restaurant not found.' }, 404);

      let userId: string | null = null;
      const created = await db.auth.admin.createUser({ email, password: String(body.password || ''), email_confirm: true, user_metadata: { name } });
      if (created.data?.user) userId = created.data.user.id;
      else if (/already|registered|exists/i.test(created.error?.message || '')) {
        // existing account: link it to this restaurant without changing its password
        for (let page = 1; page < 50 && !userId; page++) {
          const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 });
          const u = data?.users?.find((x) => (x.email || '').toLowerCase() === email);
          if (u) userId = u.id;
          if (!data?.users?.length) break;
        }
      } else if (created.error) {
        return json({ error: /password/i.test(created.error.message) ? 'Password must be at least 8 characters.' : created.error.message }, 400);
      }
      if (!userId) return json({ error: 'Could not create the login.' }, 500);
      const { error } = await db.from('memberships').upsert({ rid, user_id: userId, role, name, email });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, userId, existing: !created.data?.user });
    }

    const userId = String(body.userId || '');
    const { data: target } = await db.from('memberships').select('role').eq('rid', rid).eq('user_id', userId).maybeSingle();
    if (!target) return json({ error: 'That login is not part of this restaurant.' }, 404);
    if (target.role === 'owner' && !adminMe && myRole !== 'owner') return json({ error: "Only an owner can change another owner's login." }, 403);

    if (action === 'remove') {
      if (userId === me.id) return json({ error: "You can't remove your own login." }, 400);
      await db.from('memberships').delete().eq('rid', rid).eq('user_id', userId);
      return json({ ok: true });
    }
    if (action === 'password') {
      const pw = String(body.password || '');
      if (pw.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400);
      const { error } = await db.auth.admin.updateUserById(userId, { password: pw });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }
    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
