// Where bKash and SSLCommerz send the guest's browser after paying.
// URL shape: /functions/v1/pay-return/<gateway>/<paymentId>/<back>/<result?>
// Verifies the payment with the gateway, marks it paid, then sends the guest back to the app.
import { admin, appUrl } from '../_shared/common.ts';
import { confirmBkash, confirmSsl, markFailed } from '../_shared/gateways.ts';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const i = parts.indexOf('pay-return');
  const [gw, pid, back, r] = parts.slice(i + 1);
  const db = admin();
  let result = 'failed';
  try {
    if (gw === 'sslcommerz') {
      let fields: Record<string, string> = {};
      if (req.method === 'POST') {
        const form = await req.formData();
        fields = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
      }
      const valId = fields.val_id || url.searchParams.get('val_id') || '';
      if (r === 'success' && valId && (await confirmSsl(db, pid, valId, fields))) result = 'success';
      else if (r === 'cancel') result = 'cancelled';
    } else if (gw === 'bkash') {
      const status = url.searchParams.get('status');
      const paymentID = url.searchParams.get('paymentID') || '';
      if (status === 'success' && paymentID && (await confirmBkash(db, pid, paymentID))) result = 'success';
      else if (status === 'cancel') result = 'cancelled';
    }
    if (result !== 'success' && pid) await markFailed(db, pid, result);
  } catch (e) {
    console.error('pay-return', e);
  }
  const safeBack = /^[a-z0-9-]{1,80}$/.test(back || '') ? back : '';
  return new Response(null, { status: 303, headers: { Location: `${appUrl()}?result=${result}#${safeBack}` } });
});
