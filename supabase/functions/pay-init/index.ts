// Starts an online payment: the app creates a pending payment, then calls this to get the
// bKash or SSLCommerz page to send the guest to.
import { admin, caller, cors, isAdmin, json, memberRole } from '../_shared/common.ts';
import { bkCreate, loadGateway, loadPayment, sslInit } from '../_shared/gateways.ts';
import { logEvent } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const user = await caller(req);
    if (!user) return json({ error: 'Please reopen the menu and try again.' }, 401);
    const { paymentId } = await req.json();
    const db = admin();
    const p = await loadPayment(db, String(paymentId || ''));
    if (!p) return json({ error: 'Payment not found.' }, 404);
    if (p.created_by !== user.id && !(await memberRole(db, p.rid, user.id)) && !(await isAdmin(db, user.id))) {
      return json({ error: 'This payment belongs to someone else.' }, 403);
    }
    if (p.data.status !== 'pending') return json({ error: `This payment is already ${p.data.status}.` }, 409);

    const method = p.data.method;
    const bk = await loadGateway(db, p.rid, 'bkash');
    const ssl = await loadGateway(db, p.rid, 'sslcommerz');
    const back = p.session_id ? `${p.rid}-table-${p.data.tableId}` : `${p.rid}-order`;

    let url: string;
    if (method === 'bkash' && bk.cfg && bk.ready) {
      const r = await bkCreate(bk.cfg, bk.sandbox, p, back);
      await logEvent(db, p.id, 'bkash', 'create', { paymentID: r.paymentID });
      await db.rpc('thali_patch', { p_table: 'payments', p_id: p.id, p_patch: { gateway: 'bkash', gatewayRef: r.paymentID } });
      url = r.url;
    } else if (['bkash', 'nagad', 'rocket', 'card'].includes(method) && ssl.cfg && ssl.ready) {
      let phone: string | undefined;
      if (p.order_id) {
        const { data: o } = await db.from('orders').select('data').eq('id', p.order_id).maybeSingle();
        phone = o?.data?.customer?.phone;
      }
      url = await sslInit({ cfg: ssl.cfg, sandbox: ssl.sandbox, payment: p, restaurant: ssl.restaurant, back, phone });
      await db.rpc('thali_patch', { p_table: 'payments', p_id: p.id, p_patch: { gateway: 'sslcommerz' } });
    } else {
      return json({ error: 'Online payment is not set up for this method yet. Please choose another way to pay.' }, 400);
    }
    return json({ url });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || 'Payment could not start.' }, 500);
  }
});
