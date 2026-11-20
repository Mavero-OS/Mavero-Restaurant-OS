// Domain operations: everything the customer, staff, kitchen, owner and platform screens do.
import { put, patch, get, all, remove, bulkPut, state, toast, applyServer } from './store.js';
import { LIVE, rpc, callFunction } from './backend.js';
import { uid, computeBill, activeLines, sumLines, orderDone, dayStart, pick } from './util.js';
import { PLATFORM_DEFAULT, sampleRestaurants, historyFor, sampleReviews } from './seed.js';

// ---------- reads ----------
export const platform = () => ({ ...PLATFORM_DEFAULT, ...(get('platform', 'settings') || {}) });
export const restaurants = () => all('restaurants').sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
export const restaurant = (rid) => get('restaurants', rid);
export const ordersFor = (rid) => all('orders').filter((o) => o.rid === rid);
export const sessionsFor = (rid) => all('sessions').filter((s) => s.rid === rid);
export const openSessions = (rid) => sessionsFor(rid).filter((s) => s.status !== 'closed');
export const openSession = (rid, tid) =>
  openSessions(rid)
    .filter((s) => s.tableId === tid)
    .sort((a, b) => b.openedAt - a.openedAt)[0];
export const sessionOrders = (sid) => all('orders').filter((o) => o.sessionId === sid).sort((a, b) => a.createdAt - b.createdAt);
export const sessionRequests = (sid) => all('requests').filter((q) => q.sessionId === sid);
export const sessionPayments = (sid) => all('payments').filter((p) => p.sessionId === sid).sort((a, b) => a.createdAt - b.createdAt);
export const requestsFor = (rid) => all('requests').filter((q) => q.rid === rid);
export const paymentsFor = (rid) => all('payments').filter((p) => p.rid === rid);
export const reviewsFor = (rid) => all('reviews').filter((v) => v.rid === rid).sort((a, b) => b.createdAt - a.createdAt);

export function sessionBill(r, s) {
  const lines = activeLines(sessionOrders(s.id));
  const sub = sumLines(lines);
  const bill = computeBill(r, sub, { tipPct: s.tipPct || 0 });
  const pays = sessionPayments(s.id);
  const paid = pays.filter((p) => p.status === 'paid').reduce((a, p) => a + p.amount, 0);
  const pending = pays.filter((p) => p.status === 'pending').reduce((a, p) => a + p.amount, 0);
  return { lines, bill, pays, paid, pending, due: Math.max(0, bill.total - paid - pending) };
}

// ---------- sessions (a table's visit) ----------
export function startSession(rid, tid, guest) {
  const existing = openSession(rid, tid);
  if (existing) {
    if (guest && !(existing.guests || []).includes(guest)) patch('sessions', existing.id, { guests: [...(existing.guests || []), guest] });
    return existing.id;
  }
  const id = uid('s');
  put('sessions', id, {
    id, rid, tableId: tid, status: 'open', openedAt: Date.now(), guests: guest ? [guest] : [], tipPct: 0, billRequested: false, quiz: { score: 0, played: 0 },
  });
  return id;
}

// Guest scans the table QR (live: server finds or opens the visit and remembers this phone)
export async function joinTable(rid, tid, name) {
  if (!LIVE) return startSession(rid, tid, name);
  const d = await rpc('thali_join_table', { p_rid: rid, p_table: tid, p_name: name || '' });
  applyServer('sessions', d);
  return d.id;
}

export function setTip(sid, tipPct) {
  patch('sessions', sid, { tipPct });
}

export function requestBill(sid) {
  const s = get('sessions', sid);
  if (!s) return;
  patch('sessions', sid, { billRequested: true, billAt: Date.now() });
  const open = sessionRequests(sid).find((q) => q.type === 'bill' && q.status !== 'done');
  if (!open) callWaiter(s.rid, sid, s.tableId, 'bill', '');
}

export function clearTable(sid) {
  const s = get('sessions', sid);
  if (!s) return;
  const r = restaurant(s.rid);
  const { bill } = sessionBill(r, s);
  patch('sessions', sid, { status: 'closed', closedAt: Date.now(), bill: s.bill || bill });
  sessionRequests(sid).filter((q) => q.status !== 'done').forEach((q) => patch('requests', q.id, { status: 'done', doneAt: Date.now() }));
}

export function addQuizScore(sid, delta) {
  const s = get('sessions', sid);
  if (!s) return;
  patch('sessions', sid, { quiz: { score: (s.quiz?.score || 0) + delta, played: (s.quiz?.played || 0) + 1 } });
}

// ---------- orders ----------
export function placeOrder(rid, o) {
  const doc = buildOrder(rid, o);
  put('orders', doc.id, doc).catch(() => {});
  return doc.id;
}

// Resolves with the order as saved by the server (prices checked there), or throws.
export async function placeOrderAsync(rid, o) {
  const doc = buildOrder(rid, o);
  return put('orders', doc.id, doc);
}

function buildOrder(rid, o) {
  const r = restaurant(rid);
  const id = uid('o');
  const auto = o.channel === 'dine' && r?.features?.autoKitchen;
  const prev = o.sessionId ? sessionOrders(o.sessionId).length : 0;
  const now = Date.now();
  const doc = {
    id, rid, channel: o.channel || 'dine', tableId: o.tableId || '', sessionId: o.sessionId || '', round: prev + 1,
    no: o.channel === 'dine' ? 100 + (Math.floor(now / 1000) % 900) : 1000 + (Math.floor(now / 1000) % 9000),
    items: o.lines, done: {}, note: o.note || '', status: auto ? 'kitchen' : 'new', createdAt: now, sentAt: auto ? now : null,
    by: o.by || '', customer: o.customer || null, bill: o.bill || null, payment: o.payment || null, zone: o.zone || '',
  };
  return doc;
}

export const sendToKitchen = (oid) => patch('orders', oid, { status: 'kitchen', sentAt: Date.now() });
export const cancelOrder = (oid) => patch('orders', oid, { status: 'cancelled', cancelledAt: Date.now() });

export function bumpLine(oid, key, on = true) {
  const o = get('orders', oid);
  if (!o) return;
  const merged = patch('orders', oid, { done: { [key]: on ? Date.now() : 0 } });
  if (orderDone(merged) && merged.status === 'kitchen') patch('orders', oid, { status: 'ready', readyAt: Date.now() });
  if (!on && merged.status === 'ready') patch('orders', oid, { status: 'kitchen', readyAt: null });
}

export function bumpStation(oid, station) {
  const o = get('orders', oid);
  if (!o) return;
  const t = Date.now();
  const done = {};
  o.items.filter((li) => !station || li.station === station).forEach((li) => (done[li.key] = (o.done && o.done[li.key]) || t));
  const merged = patch('orders', oid, { done });
  if (orderDone(merged) && merged.status === 'kitchen') patch('orders', oid, { status: 'ready', readyAt: t });
}

export function recallOrder(oid) {
  const o = get('orders', oid);
  if (!o) return;
  patch('orders', oid, { status: 'kitchen', readyAt: null, done: Object.fromEntries(o.items.map((li) => [li.key, 0])) });
}

export const markServed = (oid) => patch('orders', oid, { status: 'served', servedAt: Date.now() });

// online orders
export const acceptOrder = (oid) => patch('orders', oid, { status: 'kitchen', sentAt: Date.now(), acceptedAt: Date.now() });
export const rejectOrder = (oid) => patch('orders', oid, { status: 'cancelled', cancelledAt: Date.now(), rejected: true });
export const dispatchOrder = (oid, rider) => patch('orders', oid, { status: 'out', outAt: Date.now(), rider: rider || '' });
export function completeOnline(oid) {
  const o = get('orders', oid);
  if (!o) return;
  const p = { status: 'completed', completedAt: Date.now() };
  if (o.payment && o.payment.status !== 'paid') p.payment = { status: 'paid', paidAt: Date.now() };
  patch('orders', oid, p);
}

// ---------- waiter calls ----------
export function callWaiter(rid, sid, tid, type, note) {
  const id = uid('q');
  put('requests', id, { id, rid, sessionId: sid, tableId: tid, type, note: note || '', status: 'open', createdAt: Date.now() });
  return id;
}
export const ackRequest = (id, by) => patch('requests', id, { status: 'ack', ackAt: Date.now(), ackBy: by || 'Staff' });
export const doneRequest = (id) => patch('requests', id, { status: 'done', doneAt: Date.now() });

// ---------- payments ----------
function paymentDoc(rid, sid, p) {
  const s = sid ? get('sessions', sid) : null;
  return {
    id: uid('p'), rid, sessionId: sid || '', orderId: p.orderId || '', tableId: s?.tableId || '', who: p.who || '', amount: p.amount || 0, method: p.method,
    status: LIVE ? 'pending' : p.status || 'pending', trx: p.trx || '', wallet: p.wallet || '', ref: p.ref || '', createdAt: Date.now(), paidAt: !LIVE && p.status === 'paid' ? Date.now() : null,
  };
}

export function createPayment(rid, sid, p) {
  const doc = paymentDoc(rid, sid, p);
  const w = put('payments', doc.id, doc);
  if (LIVE) w.catch(() => {});
  else if (doc.status === 'paid') settleIfPaid(sid);
  return doc.id;
}

// Live mode: save a pending payment, then send the guest to bKash / SSLCommerz.
export async function startGatewayPayment(rid, sid, p) {
  const doc = paymentDoc(rid, sid, p);
  await put('payments', doc.id, doc);
  const res = await callFunction('pay-init', { paymentId: doc.id });
  if (!res || !res.url) throw new Error('The payment page did not open. Try again or pay another way.');
  window.location.assign(res.url);
  return doc.id;
}

// Which gateway handles a method for this restaurant (live mode); null = manual confirmation.
export function gatewayFor(r, method) {
  if (!LIVE) return null;
  const g = r?.payments?.gateways || {};
  if (method === 'bkash' && g.bkash?.ready) return 'bkash';
  if (['bkash', 'nagad', 'rocket', 'card'].includes(method) && g.sslcommerz?.ready) return 'sslcommerz';
  return null;
}

export async function confirmPayment(pid, by) {
  const p = get('payments', pid);
  if (!p) return;
  if (LIVE) {
    try {
      applyServer('payments', await rpc('thali_mark_paid', { p_payment_id: pid, p_trx: '', p_by: by || 'Staff' }));
    } catch (e) {
      toast(e.message, 'alert');
    }
    return;
  }
  patch('payments', pid, { status: 'paid', paidAt: Date.now(), confirmedBy: by || 'Staff' });
  settleIfPaid(p.sessionId);
}

export const rejectPayment = (pid) => patch('payments', pid, { status: 'failed' });

export function settleIfPaid(sid) {
  if (LIVE) {
    rpc('thali_settle_session', { p_sid: sid }).then((d) => applyServer('sessions', d)).catch((e) => toast(e.message, 'alert'));
    return;
  }
  const s = get('sessions', sid);
  if (!s || s.status === 'closed') return;
  const r = restaurant(s.rid);
  const { bill, pays, paid } = sessionBill(r, s);
  if (bill.total > 0 && paid >= bill.total - 1 && s.status !== 'paid') {
    const paidBy = {};
    pays.filter((p) => p.status === 'paid').forEach((p) => (paidBy[p.method] = (paidBy[p.method] || 0) + p.amount));
    const d = new Date();
    patch('sessions', sid, {
      status: 'paid', paidAt: Date.now(), bill, paidBy, billRequested: false,
      invoiceNo: 'INV-' + String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(Math.floor(Math.random() * 900) + 100),
    });
    sessionRequests(sid).filter((q) => q.type === 'bill' && q.status !== 'done').forEach((q) => patch('requests', q.id, { status: 'done', doneAt: Date.now() }));
  }
}

// staff shortcut: settle the whole remaining bill in one method
export function settleRemaining(sid, method, by) {
  if (LIVE) {
    rpc('thali_settle_remaining', { p_sid: sid, p_method: method, p_by: by || 'Staff' }).then((d) => applyServer('sessions', d)).catch((e) => toast(e.message, 'alert'));
    return;
  }
  const s = get('sessions', sid);
  if (!s) return;
  const r = restaurant(s.rid);
  const { due, pays } = sessionBill(r, s);
  pays.filter((p) => p.status === 'pending').forEach((p) => patch('payments', p.id, { status: 'paid', paidAt: Date.now(), confirmedBy: by }));
  if (due > 0) createPayment(s.rid, sid, { amount: due, method, status: 'paid', who: 'Table' });
  else settleIfPaid(sid);
}

// ---------- reviews ----------
export function submitReview(rid, v) {
  const id = uid('v');
  put('reviews', id, { id, rid, ...v, createdAt: Date.now() }).catch(() => {});
  if (v.sessionId) patch('sessions', v.sessionId, { reviewed: true });
  if (v.orderId && !LIVE) patch('orders', v.orderId, { reviewed: true });
}

// ---------- restaurants & platform ----------
export const saveRestaurant = (r) => put('restaurants', r.id, r);
export const patchRestaurant = (rid, p) => patch('restaurants', rid, p);
export const savePlatform = (p) => put('platform', 'settings', { ...platform(), ...p, id: 'settings' });

// Quiz leaderboard: live mode asks the server (guests cannot see other tables' visits)
export async function quizBoard(rid) {
  const r = restaurant(rid);
  const label = (tid) => r?.tables.find((t) => t.id === tid)?.label || tid;
  if (LIVE) {
    const rows = await rpc('thali_quiz_board', { p_rid: rid });
    return (rows || []).map((x) => ({ id: x.session_id, label: label(x.table_id), score: x.score }));
  }
  return openSessions(rid)
    .map((x) => ({ id: x.id, label: label(x.tableId), score: x.quiz?.score || 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

// Team logins (live mode) — handled by the 'team' edge function
export const team = (body) => callFunction('team', body);
export const saveGatewayCredentials = (body) => callFunction('credentials', body);

// ---------- reporting ----------
// A "sale" is a paid table visit or a completed online order.
export function salesIn(rid, [from, to]) {
  const out = [];
  all('sessions').forEach((s) => {
    if ((rid && s.rid !== rid) || !s.bill || !(s.status === 'paid' || s.status === 'closed')) return;
    const t = s.paidAt || s.closedAt;
    if (t >= from && t < to) out.push({ kind: 'dine', t, rid: s.rid, bill: s.bill, paidBy: s.paidBy || {}, ref: s.id, tableId: s.tableId });
  });
  all('orders').forEach((o) => {
    if ((rid && o.rid !== rid) || o.channel === 'dine' || o.status !== 'completed' || !o.bill) return;
    const t = o.completedAt;
    if (t >= from && t < to) out.push({ kind: o.channel, t, rid: o.rid, bill: o.bill, paidBy: { [o.payment?.method || 'cash']: o.bill.total }, ref: o.id });
  });
  return out.sort((a, b) => a.t - b.t);
}

export function itemsSoldIn(rid, [from, to]) {
  const map = {};
  all('orders').forEach((o) => {
    if ((rid && o.rid !== rid) || o.status === 'cancelled' || o.createdAt < from || o.createdAt >= to) return;
    (o.items || []).forEach((li) => {
      const k = li.itemId;
      map[k] = map[k] || { itemId: k, name: li.name, icon: li.icon, qty: 0, revenue: 0 };
      map[k].qty += li.qty;
      map[k].revenue += li.qty * li.unit;
    });
  });
  return Object.values(map).sort((a, b) => b.revenue - a.revenue);
}

// ---------- demo data ----------
export async function loadSampleData(onProgress) {
  const now = Date.now();
  const entries = [];
  const rs = sampleRestaurants(now);
  rs.forEach((r) => entries.push(['restaurants', r]));
  entries.push(['platform', { ...PLATFORM_DEFAULT, id: 'settings' }]);
  rs.forEach((r) => {
    const h = historyFor(r, 3, 7, now);
    h.sessions.forEach((d) => entries.push(['sessions', d]));
    h.orders.forEach((d) => entries.push(['orders', d]));
    sampleReviews(r, now).forEach((d) => entries.push(['reviews', d]));
  });
  await bulkPut(entries, onProgress);
}

export async function addHistory(rid, onProgress) {
  const r = restaurant(rid);
  if (!r) return;
  const h = historyFor(r, 3, 7);
  const entries = [...h.sessions.map((d) => ['sessions', d]), ...h.orders.map((d) => ['orders', d])];
  await bulkPut(entries, onProgress);
}

export async function clearLiveActivity(rid) {
  // closes all open tables and clears kitchen of the selected restaurant
  openSessions(rid).forEach((s) => patch('sessions', s.id, { status: 'closed', closedAt: Date.now() }));
  ordersFor(rid).filter((o) => ['new', 'kitchen', 'ready', 'out'].includes(o.status)).forEach((o) => patch('orders', o.id, { status: o.channel === 'dine' ? 'served' : 'completed', servedAt: Date.now(), completedAt: Date.now() }));
  requestsFor(rid).filter((q) => q.status !== 'done').forEach((q) => patch('requests', q.id, { status: 'done', doneAt: Date.now() }));
  paymentsFor(rid).filter((p) => p.status === 'pending').forEach((p) => patch('payments', p.id, { status: 'failed' }));
}

export async function purgeOld(days = 14) {
  const cut = dayStart() - days * 864e5;
  // live mode keeps real restaurants' records (VAT); only demo restaurants are cleaned
  const ok = (x) => !LIVE || restaurant(x.rid)?.demo;
  const old = [
    ...all('orders').filter((o) => o.createdAt < cut && ok(o)).map((o) => ['orders', o.id]),
    ...all('sessions').filter((s) => s.status === 'closed' && s.openedAt < cut && ok(s)).map((s) => ['sessions', s.id]),
    ...all('payments').filter((p) => p.createdAt < cut && ok(p)).map((p) => ['payments', p.id]),
    ...all('requests').filter((q) => q.createdAt < cut && ok(q)).map((q) => ['requests', q.id]),
  ];
  for (let i = 0; i < old.length; i++) {
    const w = remove(old[i][0], old[i][1]);
    if (state.mode === 'live') await w;
  }
  return old.length;
}

export function deleteRestaurant(rid) {
  remove('restaurants', rid);
}

export { pick };
