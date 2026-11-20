// Data layer.
//  • live mode  (VITE_SUPABASE_URL set): Supabase database + realtime, scoped to what the
//    signed-in person may see (a guest's own table, one restaurant's team, or the platform admin).
//  • demo mode  (no Supabase settings): memory + localStorage in this browser, synced across tabs.
import { deepMerge } from './util.js';
import { LIVE, sb, friendlyError } from './backend.js';

export const COLS = ['restaurants', 'orders', 'sessions', 'payments', 'requests', 'reviews', 'platform'];
const LS_KEY = 'thali.v1';

export const state = {
  data: Object.fromEntries(COLS.map((c) => [c, {}])),
  mode: 'loading', // 'loading' | 'live' | 'local'
  loaded: false,
  error: null,
  realtime: '',
  version: 0,
  scope: null,
  auth: { ready: !LIVE, user: null, anon: false, admin: false, members: [], recovery: false },
};

const subs = new Set();
let scheduled = false;
export const subscribe = (fn) => {
  subs.add(fn);
  return () => subs.delete(fn);
};
export const notify = () => {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    state.version++;
    subs.forEach((f) => f());
  });
};

const toasts = new Set();
export const onToast = (fn) => (toasts.add(fn), () => toasts.delete(fn));
export const toast = (msg, tone = 'info') => toasts.forEach((f) => f({ msg, tone, id: Math.random() }));

const clean = (o) => JSON.parse(JSON.stringify(o));

function applyLocal(col, id, doc) {
  const next = { ...state.data[col] };
  if (doc == null) delete next[id];
  else next[id] = doc;
  state.data[col] = next;
}
export const applyServer = (col, doc) => {
  if (doc && doc.id) {
    applyLocal(col, doc.id, doc);
    notify();
  }
};

// ---------- demo (local) mode ----------
let bc = null;
let saveTimer = null;
const lsGet = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};
const lsSave = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state.data));
    } catch (e) {}
  }, 250);
};
const broadcast = (msg) => {
  try {
    bc && bc.postMessage(msg);
  } catch (e) {}
};

// ---------- live mode: writes ----------
const chains = {};
function chain(path, fn) {
  const prev = chains[path] || Promise.resolve();
  const next = prev.then(fn, fn);
  chains[path] = next.catch(() => {});
  return next;
}
async function failed(col, id, error) {
  toast(friendlyError(error), 'alert');
  const { data } = await sb.from(col).select('id,data').eq('id', id).maybeSingle();
  applyLocal(col, id, data ? data.data : null);
  notify();
}

// ---------- public write API (returns a promise in live mode) ----------
export function put(col, id, doc) {
  const existed = !!state.data[col]?.[id];
  const data = clean({ ...doc, id });
  applyLocal(col, id, data);
  notify();
  if (state.mode === 'live') {
    return chain(col + '/' + id, async () => {
      const row = { id, data };
      if (col !== 'restaurants' && col !== 'platform') row.rid = data.rid;
      const q = existed ? sb.from(col).upsert(row) : sb.from(col).insert(row);
      const { data: out, error } = await q.select('id,data').maybeSingle();
      if (error) {
        await failed(col, id, error);
        throw new Error(friendlyError(error));
      }
      if (out) applyServer(col, out.data);
      return out ? out.data : data;
    });
  }
  lsSave();
  broadcast({ col, id, doc: data });
  return Promise.resolve(data);
}

export function patch(col, id, partial) {
  const cur = state.data[col]?.[id];
  const p = clean(partial);
  const merged = deepMerge(cur || { id }, p);
  applyLocal(col, id, merged);
  notify();
  if (state.mode === 'live') {
    chain(col + '/' + id, async () => {
      const { data: out, error } = await sb.rpc('thali_patch', { p_table: col, p_id: id, p_patch: p });
      if (error) return failed(col, id, error);
      applyServer(col, out);
    });
    return merged;
  }
  lsSave();
  broadcast({ col, id, doc: merged });
  return merged;
}

export function remove(col, id) {
  applyLocal(col, id, null);
  notify();
  if (state.mode === 'live') {
    return chain(col + '/' + id, async () => {
      const { error } = await sb.from(col).delete().eq('id', id);
      if (error) failed(col, id, error);
    });
  }
  lsSave();
  broadcast({ col, id, doc: null });
  return Promise.resolve();
}

export const get = (col, id) => state.data[col]?.[id];
export const all = (col) => Object.values(state.data[col] || {});

export async function bulkPut(entries, onProgress) {
  let i = 0;
  for (const [col, doc] of entries) {
    const p = put(col, doc.id, doc);
    if (state.mode === 'live') await p.catch(() => {});
    i++;
    onProgress && onProgress(i, entries.length);
  }
}

// ---------- live mode: sign-in ----------
async function applySession(session) {
  const user = session ? session.user : null;
  const a = state.auth;
  a.user = user;
  a.anon = !!(user && user.is_anonymous);
  a.admin = false;
  a.members = [];
  if (user && !user.is_anonymous) {
    const [adm, mem] = await Promise.all([
      sb.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
      sb.from('memberships').select('rid, role, name').eq('user_id', user.id),
    ]);
    a.admin = !!adm.data;
    a.members = mem.data || [];
  }
  a.ready = true;
  notify();
}

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
  await applySession(data.session);
}

export async function signOut() {
  await sb.auth.signOut();
  scopeKey = null;
  if (channel) sb.removeChannel(channel);
  channel = null;
  COLS.forEach((c) => (state.data[c] = {}));
  await applySession(null);
}

export async function sendPasswordReset(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.href.split('#')[0].split('?')[0] });
  if (error) throw new Error(error.message);
}

export async function setNewPassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(error.message);
  state.auth.recovery = false;
  notify();
}

// Guests are signed in anonymously so the database can tell their phone apart from others.
export async function ensureGuest() {
  if (state.auth.user) return;
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw new Error('Could not start: ' + error.message + '. (Admin: enable anonymous sign-ins in Supabase.)');
  await applySession(data.session);
}

export const role = (rid) => {
  const a = state.auth;
  if (!LIVE || a.admin) return 'admin';
  return (a.members.find((m) => m.rid === rid) || {}).role || null;
};

// ---------- live mode: what this screen needs ----------
let channel = null;
let scopeKey = null;
let refreshTimer = null;

export async function connectScope(scope) {
  if (state.mode !== 'live') return;
  const key = JSON.stringify(scope);
  if (key === scopeKey) return;
  scopeKey = key;
  state.scope = scope;
  if (channel) sb.removeChannel(channel);
  channel = null;
  clearInterval(refreshTimer);
  COLS.forEach((c) => (state.data[c] = {}));
  state.loaded = false;
  notify();
  await loadScope(scope);
  if (scopeKey !== key) return;
  channel = sb.channel('thali-' + (scope.rid || 'all') + '-' + Math.random().toString(36).slice(2, 8));
  for (const t of COLS) {
    if (t === 'platform' && scope.kind === 'guest') continue;
    const opts = { event: '*', schema: 'public', table: t };
    if (scope.rid && t !== 'platform') opts.filter = (t === 'restaurants' ? 'id' : 'rid') + '=eq.' + scope.rid;
    channel.on('postgres_changes', opts, (p) => {
      if (p.eventType === 'DELETE') applyLocal(t, p.old && p.old.id, null);
      else if (p.new && p.new.data) applyLocal(t, p.new.id, p.new.data);
      notify();
    });
  }
  channel.subscribe((status) => {
    state.realtime = status;
    notify();
  });
  // safety net for dropped connections (phones going to sleep, flaky Wi-Fi)
  refreshTimer = setInterval(() => loadScope(scope), 45000);
}

async function loadScope(scope) {
  const guest = scope.kind === 'guest';
  const since = Date.now() - (guest ? 2 : 35) * 864e5;
  const q = (t) => {
    let x = sb.from(t).select('id,data');
    if (scope.rid && t !== 'platform') x = x.eq(t === 'restaurants' ? 'id' : 'rid', scope.rid);
    return x;
  };
  const jobs = {
    platform: q('platform'),
    restaurants: q('restaurants'),
    orders: q('orders').gte('created_ms', since).order('created_ms', { ascending: false }).limit(3000),
    sessions: q('sessions').or(`status.neq.closed,opened_ms.gte.${since}`).order('opened_ms', { ascending: false }).limit(2000),
    payments: q('payments').gte('created_ms', since).order('created_ms', { ascending: false }).limit(3000),
    requests: q('requests').gte('created_ms', Date.now() - 2 * 864e5).order('created_ms', { ascending: false }).limit(1000),
    reviews: q('reviews').order('created_ms', { ascending: false }).limit(300),
  };
  const keys = Object.keys(jobs);
  try {
    const res = await Promise.all(keys.map((k) => jobs[k]));
    let err = null;
    res.forEach((r, i) => {
      if (r.error) err = r.error;
      else state.data[keys[i]] = Object.fromEntries(r.data.map((row) => [row.id, row.data]));
    });
    state.error = err ? friendlyError(err) : null;
  } catch (e) {
    state.error = friendlyError(e);
  }
  state.loaded = true;
  notify();
}

export const refreshScope = () => state.scope && loadScope(state.scope);

// ---------- init ----------
export async function init(seedLocal) {
  if (LIVE) {
    state.mode = 'live';
    const { data } = await sb.auth.getSession();
    await applySession(data.session);
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') state.auth.recovery = true;
      // run outside the auth callback (Supabase advises not to await inside it)
      setTimeout(() => applySession(session), 0);
    });
    window.addEventListener('focus', () => refreshScope());
    notify();
    return;
  }
  state.mode = 'local';
  const saved = lsGet();
  if (saved && saved.restaurants && Object.keys(saved.restaurants).length) {
    COLS.forEach((c) => (state.data[c] = saved[c] || {}));
  } else if (seedLocal) {
    seedLocal();
  }
  try {
    bc = new BroadcastChannel('thali');
    bc.onmessage = (ev) => {
      const { col, id, doc } = ev.data || {};
      if (!col || !COLS.includes(col)) return;
      applyLocal(col, id, doc);
      notify();
    };
  } catch (e) {
    bc = null;
  }
  window.addEventListener('storage', (e) => {
    if (e.key !== LS_KEY || !e.newValue) return;
    try {
      const d = JSON.parse(e.newValue);
      COLS.forEach((c) => (state.data[c] = d[c] || {}));
      notify();
    } catch (er) {}
  });
  state.loaded = true;
  notify();
}

export function resetLocal() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch (e) {}
}
