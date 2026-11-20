# Thali — restaurant OS for Bangladesh

Guests scan a QR code on the table, order from a Bangla or English menu, call a waiter, split the bill and pay by bKash, Nagad, Rocket, card or cash. Staff see orders on a tablet, the kitchen sees tickets by station, and owners see sales and VAT. One platform runs any number of restaurants.

**Start here: [docs/LAUNCH_GUIDE.md](docs/LAUNCH_GUIDE.md)**. It walks you through going live in plain language, no coding needed.

## What's inside

| Screen | Who uses it | What it does |
|---|---|---|
| Guest menu (`#<restaurant>-table-<table>`) | Diners, from the table QR | Menu with allergens, spice, half/full, combo deals · live cooking countdown · Wi-Fi · food quiz · call waiter · bill split + tip · pay · receipt · review |
| Takeaway & delivery (`#<restaurant>-order`) | Customers, from Facebook/WhatsApp link | Order ahead, delivery areas and fees, pay online or cash on delivery, live tracking |
| Staff tablet | Waiters, cashier | Live floor map, new orders → kitchen, waiter calls, payment confirmation, delivery dispatch, manual orders |
| Kitchen display | Cooks | Tickets by station with colour timers, tap to bump |
| Owner back office | Owner, manager | Sales, VAT reports + CSV, menu editor, tables + QR print sheet, team logins, payment gateways, reviews, settings |
| Platform admin | You | All restaurants, onboarding wizard, plans in Taka, platform settings |

## How it's built

```
Browser (GitHub Pages, static)            Supabase (your project)
┌──────────────────────────┐   HTTPS   ┌──────────────────────────────────────┐
│ Preact app (src/)         │ ────────▶ │ Postgres + row level security         │
│  guest · staff · kitchen  │ ◀──────── │ Realtime (live order updates)         │
│  owner · platform         │  live     │ Auth (staff logins, anonymous guests) │
└──────────────────────────┘           │ Edge functions: payments, team logins │
                                        └───────────────┬──────────────────────┘
                                                        │
                                       SSLCommerz · bKash Tokenized Checkout
```

- `src/` — the app. Without Supabase settings it runs in **demo mode** with three sample restaurants, data stored in the browser only.
- `supabase/migrations/` — database tables, security rules and server logic (prices, bills, invoice numbers, payment confirmation).
- `supabase/functions/` — `pay-init`, `pay-return`, `pay-ipn` (gateways), `team` (staff logins), `credentials` (gateway keys).
- `.github/workflows/` — `deploy-pages.yml` publishes the website on every push; `deploy-supabase.yml` sets up the database and functions.
- `docs/` — launch guide, payments guide, privacy policy and terms templates.

## Security in one paragraph

Guests never log in, but each phone gets an anonymous identity. The database only lets a guest see their own table's orders, re-prices every order from the restaurant's own menu, works out bills itself, and never lets a phone mark anything as paid. Payments become "paid" only when a staff member confirms cash/transfer, or when a server function has verified the transaction with SSLCommerz or bKash. Gateway credentials are stored in a table the browser can't read.

## Run it on your computer (optional)

```bash
npm install
cp .env.example .env.local   # leave empty for demo mode
npm run dev
```

## Licence

Private project. All rights reserved by the owner of this repository.
