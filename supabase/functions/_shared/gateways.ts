// SSLCommerz and bKash Tokenized Checkout.
// Endpoints and field names follow the providers' public developer docs; check them
// against the latest docs and your merchant onboarding pack before going live.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { fnUrl, logEvent } from './common.ts';

type Row = { id: string; rid: string; data: Record<string, any>; session_id: string | null; order_id: string | null };

// ---------- SSLCommerz ----------
const sslBase = (sandbox: boolean) => (sandbox ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com');

// Pre-select a wallet on the SSLCommerz page when the guest picked one in the app
const SSL_MULTI_CARD: Record<string, string> = { bkash: 'bkash', nagad: 'nagad', rocket: 'dbblmobilebanking' };

export async function sslInit(opts: {
  cfg: { store_id: string; store_passwd: string };
  sandbox: boolean;
  payment: Row;
  restaurant: Record<string, any>;
  back: string;
  phone?: string;
}) {
  const { cfg, sandbox, payment, restaurant, back } = opts;
  const amount = Number(payment.data.amount);
  const ret = (r: string) => `${fnUrl('pay-return')}/sslcommerz/${payment.id}/${back}/${r}`;
  const form = new URLSearchParams({
    store_id: cfg.store_id,
    store_passwd: cfg.store_passwd,
    total_amount: amount.toFixed(2),
    currency: 'BDT',
    tran_id: payment.id,
    success_url: ret('success'),
    fail_url: ret('fail'),
    cancel_url: ret('cancel'),
    ipn_url: fnUrl('pay-ipn'),
    product_name: `${restaurant.name?.en || 'Restaurant'} bill`,
    product_category: 'Food',
    product_profile: 'general',
    shipping_method: 'NO',
    num_of_item: '1',
    cus_name: String(payment.data.who || 'Guest').slice(0, 50),
    cus_email: Deno.env.get('RECEIPT_EMAIL') || 'guest@example.com',
    cus_phone: opts.phone || restaurant.phone || '01700000000',
    cus_add1: restaurant.address || restaurant.area || 'Dhaka',
    cus_city: restaurant.city || 'Dhaka',
    cus_postcode: '1000',
    cus_country: 'Bangladesh',
    value_a: payment.rid,
  });
  const multi = SSL_MULTI_CARD[payment.data.method];
  if (multi) form.set('multi_card_name', multi);
  const res = await fetch(`${sslBase(sandbox)}/gwprocess/v4/api.php`, { method: 'POST', body: form });
  const j = await res.json().catch(() => ({}));
  if (j.status !== 'SUCCESS' || !j.GatewayPageURL) throw new Error('SSLCommerz could not start the payment: ' + (j.failedreason || res.status));
  return j.GatewayPageURL as string;
}

export async function sslValidate(cfg: { store_id: string; store_passwd: string }, sandbox: boolean, valId: string) {
  const u = new URL(`${sslBase(sandbox)}/validator/api/validationserverAPI.php`);
  u.searchParams.set('val_id', valId);
  u.searchParams.set('store_id', cfg.store_id);
  u.searchParams.set('store_passwd', cfg.store_passwd);
  u.searchParams.set('format', 'json');
  u.searchParams.set('v', '1');
  const res = await fetch(u);
  return await res.json();
}

// ---------- bKash Tokenized Checkout ----------
const bkBase = (sandbox: boolean) => (sandbox ? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta' : 'https://tokenized.pay.bka.sh/v1.2.0-beta');
type BkCfg = { app_key: string; app_secret: string; username: string; password: string };

async function bkToken(cfg: BkCfg, sandbox: boolean) {
  const res = await fetch(`${bkBase(sandbox)}/tokenized/checkout/token/grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', username: cfg.username, password: cfg.password },
    body: JSON.stringify({ app_key: cfg.app_key, app_secret: cfg.app_secret }),
  });
  const j = await res.json().catch(() => ({}));
  if (!j.id_token) throw new Error('bKash sign-in failed: ' + (j.statusMessage || j.msg || res.status));
  return j.id_token as string;
}

async function bkCall(cfg: BkCfg, sandbox: boolean, path: string, body: unknown) {
  const token = await bkToken(cfg, sandbox);
  const res = await fetch(`${bkBase(sandbox)}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: token, 'X-App-Key': cfg.app_key },
    body: JSON.stringify(body),
  });
  return await res.json().catch(() => ({}));
}

export async function bkCreate(cfg: BkCfg, sandbox: boolean, payment: Row, back: string) {
  const j = await bkCall(cfg, sandbox, '/tokenized/checkout/create', {
    mode: '0011',
    payerReference: payment.id,
    // payment id and return page travel in the path because bKash appends its own ?paymentID=&status=
    callbackURL: `${fnUrl('pay-return')}/bkash/${payment.id}/${back}`,
    amount: Number(payment.data.amount).toFixed(2),
    currency: 'BDT',
    intent: 'sale',
    merchantInvoiceNumber: payment.id,
  });
  if (!j.bkashURL) throw new Error('bKash could not start the payment: ' + (j.statusMessage || j.errorMessage || 'unknown error'));
  return { url: j.bkashURL as string, paymentID: j.paymentID as string };
}

export const bkExecute = (cfg: BkCfg, sandbox: boolean, paymentID: string) => bkCall(cfg, sandbox, '/tokenized/checkout/execute', { paymentID });
export const bkStatus = (cfg: BkCfg, sandbox: boolean, paymentID: string) => bkCall(cfg, sandbox, '/tokenized/checkout/payment/status', { paymentID });

// ---------- shared ----------
export async function loadPayment(db: SupabaseClient, pid: string) {
  const { data } = await db.from('payments').select('id, rid, data, session_id, order_id, created_by').eq('id', pid).maybeSingle();
  return data as (Row & { created_by: string }) | null;
}

export async function loadGateway(db: SupabaseClient, rid: string, provider: 'sslcommerz' | 'bkash') {
  const [{ data: cred }, { data: rest }] = await Promise.all([
    db.from('payment_credentials').select('config').eq('rid', rid).eq('provider', provider).maybeSingle(),
    db.from('restaurants').select('data').eq('id', rid).maybeSingle(),
  ]);
  const g = rest?.data?.payments?.gateways?.[provider] || {};
  return { cfg: cred?.config ?? null, sandbox: g.sandbox !== false, ready: !!g.ready, restaurant: rest?.data ?? {} };
}

const close = (a: number, b: number) => Math.abs(a - b) < 1;

// Verify an SSLCommerz transaction and mark the payment paid. Safe to call repeatedly.
export async function confirmSsl(db: SupabaseClient, pid: string, valId: string, raw: unknown) {
  const p = await loadPayment(db, pid);
  if (!p) return false;
  await logEvent(db, pid, 'sslcommerz', 'callback', raw);
  if (p.data.status === 'paid') return true;
  const { cfg, sandbox } = await loadGateway(db, p.rid, 'sslcommerz');
  if (!cfg) return false;
  const v = await sslValidate(cfg, sandbox, valId);
  await logEvent(db, pid, 'sslcommerz', 'validation', v);
  const ok = (v.status === 'VALID' || v.status === 'VALIDATED') && v.tran_id === pid && close(Number(v.amount), Number(p.data.amount));
  if (!ok) return false;
  const { error } = await db.rpc('thali_mark_paid', { p_payment_id: pid, p_trx: String(v.bank_tran_id || valId), p_by: 'SSLCommerz' });
  if (error) throw new Error(error.message);
  return true;
}

export async function confirmBkash(db: SupabaseClient, pid: string, paymentID: string) {
  const p = await loadPayment(db, pid);
  if (!p) return false;
  if (p.data.status === 'paid') return true;
  const { cfg, sandbox } = await loadGateway(db, p.rid, 'bkash');
  if (!cfg) return false;
  let j = await bkExecute(cfg, sandbox, paymentID);
  await logEvent(db, pid, 'bkash', 'execute', j);
  if (j.transactionStatus !== 'Completed') {
    j = await bkStatus(cfg, sandbox, paymentID);
    await logEvent(db, pid, 'bkash', 'status', j);
  }
  const ok = j.transactionStatus === 'Completed' && close(Number(j.amount), Number(p.data.amount)) && (!j.merchantInvoiceNumber || j.merchantInvoiceNumber === pid);
  if (!ok) return false;
  const { error } = await db.rpc('thali_mark_paid', { p_payment_id: pid, p_trx: String(j.trxID || paymentID), p_by: 'bKash' });
  if (error) throw new Error(error.message);
  return true;
}

export async function markFailed(db: SupabaseClient, pid: string, why: string) {
  const p = await loadPayment(db, pid);
  if (!p || p.data.status !== 'pending') return;
  await db.rpc('thali_patch', { p_table: 'payments', p_id: pid, p_patch: { status: 'failed', failReason: why } });
}
