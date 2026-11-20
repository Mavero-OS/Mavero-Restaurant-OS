// SSLCommerz Instant Payment Notification: a server-to-server message that arrives even if
// the guest closes the browser before returning. Always re-validates with SSLCommerz.
import { admin } from '../_shared/common.ts';
import { confirmSsl } from '../_shared/gateways.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  try {
    const form = await req.formData();
    const f = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
    if ((f.status === 'VALID' || f.status === 'VALIDATED') && f.tran_id && f.val_id) {
      await confirmSsl(admin(), f.tran_id, f.val_id, f);
    }
  } catch (e) {
    console.error('pay-ipn', e);
  }
  return new Response('ok');
});
