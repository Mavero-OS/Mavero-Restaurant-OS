# Payments guide

How money moves in Thali, how to test it, and how each restaurant goes live with bKash, Nagad, Rocket and cards.

> The gateway code in `supabase/functions/_shared/gateways.ts` follows SSLCommerz's and bKash's public developer documentation. Before switching any restaurant to live, run the sandbox tests below and compare the endpoints with the latest docs and the merchant onboarding pack you receive.

## The two ways a payment gets confirmed

| | Manual confirmation | Online gateway |
|---|---|---|
| Methods | bKash/Nagad/Rocket Send Money (guest types the TrxID), Bangla QR, bank transfer, cash | Cards, bKash, Nagad, Rocket and internet banking through SSLCommerz; bKash direct checkout |
| Who confirms | A staff member, on the tablet (Payments tab) | The server, after checking with the gateway |
| Paperwork | None | Merchant account per restaurant |
| Best for | Day one | Once the restaurant is approved by the provider |

Both can run side by side. If a gateway is connected, the guest app sends wallet and card payments through it; otherwise wallets fall back to Send Money + TrxID, and cards are hidden.

## What happens when a guest pays online

```
Guest phone                Supabase                          Gateway
───────────                ────────                          ───────
Pay ৳660 (bKash) ─────────▶ payments row (status: pending)
                 ─────────▶ pay-init  ──────────────────────▶ create payment
                 ◀──────── redirect URL ◀────────────────────
Guest pays on bKash / SSLCommerz page ──────────────────────▶
                 ◀──────── pay-return ◀───────── browser redirect (+ IPN for SSLCommerz)
                            verify with gateway API ────────▶ validate / execute
                            thali_mark_paid → bill settled,
                            invoice number issued
App shows "Payment received", receipt shows PAID
```

Security rules:
- A phone can only create a payment as `pending`. Only staff (manual) or the server (gateway, after verification) can mark it `paid`.
- The server checks the gateway's reported amount and transaction ID against the payment before accepting it.
- The bill total is always calculated in the database from the restaurant's own menu prices, VAT and service charge.
- Every callback and validation response is saved in the `payment_events` table for reconciliation and disputes.
- Gateway credentials live in the `payment_credentials` table, which no browser can read.

## Recommended model: each restaurant has its own merchant account

Money goes straight from the guest to the restaurant's bank account. You charge restaurants your monthly subscription separately. This keeps you out of handling customer funds, which can require a Bangladesh Bank licence. Confirm with a lawyer before collecting payments through a single platform account.

## SSLCommerz

One integration covers Visa/Mastercard/Amex, bKash, Nagad, Rocket, Upay and internet banking.

**Testing (sandbox)**
1. Register for a sandbox store on SSLCommerz's developer site. You'll get a sandbox Store ID and Store Password by email.
2. Owner back office → Settings → Online payment gateways → SSLCommerz → enter them, keep **Sandbox** on → Connect.
3. On a guest phone, pay a bill by card. Use the test card numbers SSLCommerz lists in its sandbox documentation.
4. Check that the receipt shows PAID and an invoice number, and that Supabase → Table editor → `payment_events` has `callback` and `validation` rows.

**Going live**
1. The restaurant applies for a live merchant account on sslcommerz.com. Providers typically ask for a trade licence, TIN/BIN, bank account details, the owner's NID and a website with privacy, terms and refund policies. Your app's guest pages already link to a Privacy Policy and Terms (`#privacy`, `#terms`).
2. SSLCommerz may ask for your **IPN URL**. It is `https://<project-ref>.supabase.co/functions/v1/pay-ipn`.
3. When approved, enter the live Store ID and Password with **Sandbox off**.
4. Make one real ৳10–20 payment and refund it from the SSLCommerz merchant panel.

## bKash direct (Tokenized Checkout), optional

Useful if the restaurant already has a bKash merchant account with payment-gateway access and wants bKash payments without going through SSLCommerz.

1. Ask bKash for **Tokenized Checkout** (PGW) API access. You'll receive an app key, app secret, username and password for the sandbox, then for live.
2. Owner back office → Settings → Online payment gateways → bKash → enter them with **Sandbox** on → Connect.
3. Test with the sandbox wallet numbers and PIN/OTP that bKash provides.
4. bKash usually asks you to demonstrate the integration (create → execute → status, refund) before granting live access. The app follows that flow; refunds are done from the bKash merchant panel.
5. Switch to live credentials with **Sandbox off**.

When both are connected, bKash payments go through bKash direct; everything else goes through SSLCommerz.

## Manual payments: what staff do

- **Send Money with TrxID**: the Payments tab on the staff tablet shows the amount and TrxID. Staff open their own bKash/Nagad/Rocket merchant app, find that TrxID with the same amount, then tap **Confirm received**. If it isn't there, tap **Not received**.
- **Cash**: tap **Cash collected** after taking the money.
- **Settle the rest**: in a table's drawer, "Settle ৳…" closes the bill in one method (for example when a guest just hands cash to the waiter).

## Refunds and disputes

Refunds are made from the gateway's merchant panel (SSLCommerz or bKash) or in cash, by the restaurant. To find a payment: Supabase → Table editor → `payments` (search by id or TrxID) and `payment_events` for the raw gateway messages.

## Useful SQL (Supabase → SQL Editor)

Payments still pending after 30 minutes (follow up with staff):
```sql
select rid, id, data->>'method' as method, data->>'amount' as amount, data->>'trx' as trx, to_timestamp(created_ms/1000) as at
from payments where status = 'pending' and created_ms < (extract(epoch from now())*1000 - 1800000)
order by created_ms;
```

Gateway payments per restaurant this month:
```sql
select rid, data->>'gateway' as gateway, count(*), sum((data->>'amount')::numeric) as taka
from payments
where status = 'paid' and data ? 'gateway' and created_ms >= extract(epoch from date_trunc('month', now()))*1000
group by 1, 2 order by 1;
```
