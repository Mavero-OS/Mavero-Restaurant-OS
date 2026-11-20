# Launch guide: from zip file to real restaurants

This guide takes you from the downloaded project to a live system that real restaurants use, step by step. You don't need to write code. Budget about **2–3 hours** for steps 1–8, then about **1 hour per restaurant** you onboard.

> Menu names on GitHub and Supabase change from time to time. If a button isn't exactly where this guide says, look for the closest match.

---

## What you'll have at the end

- A website like `https://yourname.github.io/thali/` (or your own domain) that hosts every screen: guest menu, staff tablet, kitchen display, owner back office and your platform admin.
- A Supabase project that stores orders, keeps every phone and tablet in sync live, handles staff logins and talks to payment gateways.
- Your own admin login, from which you add restaurants and create each owner's login.

## What it costs (check current prices)

| Item | When | Notes |
|---|---|---|
| GitHub | Free | Free if the repository is **public**. Private repo + GitHub Pages needs a paid GitHub plan. Your code being public is safe: there are no passwords in it. |
| Supabase | Free to start | The free plan is fine for setup and testing. **Upgrade to Pro (about US$25/month) before real restaurants go live**: free projects can be paused when inactive and don't include daily backups. One Pro project can run many restaurants. |
| Domain (optional) | ~ yearly | A `.com` or `.com.bd` address looks more professional on QR codes. |
| Payment gateways | Per transaction | SSLCommerz and bKash charge a percentage per payment, agreed in each merchant contract. |

---

## Step 1 · Decide two things first

1. **Your brand name.** "Thali" is a placeholder. You'll type your own name in Platform → Settings; it appears on every screen.
2. **Your web address.** QR codes printed for tables contain this address, so **don't print any QR codes until it's final**. Either:
   - the free GitHub address: `https://<your-github-username>.github.io/<repository-name>/`, or
   - your own domain (see Step 11), e.g. `https://order.yourbrand.com.bd/`.

## Step 2 · Create your accounts

- **GitHub**: https://github.com/signup
- **Supabase**: https://supabase.com, then "Start your project". Sign in with GitHub to keep things simple.
- **GitHub Desktop** (recommended for uploading files): https://desktop.github.com

Use a work email you will keep long-term; it becomes the owner of everything.

## Step 3 · Put the code on GitHub

Use GitHub Desktop: dragging files into the GitHub website often skips the hidden `.github` folder, which holds the auto-deploy settings.

1. Unzip `thali-restaurant-os.zip` on your computer.
2. Open GitHub Desktop → **File → New repository**.
   - Name: `thali` (or your brand, lowercase, no spaces). This name becomes part of the web address.
   - Local path: anywhere, e.g. Documents.
   - Click **Create repository**.
3. Open the new folder (Repository → Show in Explorer / Show in Finder) and **copy everything from inside the unzipped folder into it**, including the hidden `.github` folder.
   - Windows: in File Explorer, View → Show → Hidden items.
   - Mac: in Finder press `Cmd + Shift + .` to show hidden files.
4. Back in GitHub Desktop, type a summary like `First version` and click **Commit to main**.
5. Click **Publish repository**. Untick "Keep this code private" unless you have a paid GitHub plan (see costs).

## Step 4 · Create the Supabase project

1. In Supabase click **New project**.
2. Name: `thali` · **Database password**: click Generate, then **save it in your password manager**. You need it in Step 5.
3. Region: **Southeast Asia (Singapore)**, the closest to Bangladesh. Mumbai is also fine if offered.
4. Wait about 2 minutes for it to start.
5. Collect three values and keep them in a note:
   - **Project URL** and **anon public key**: Project Settings → API (or "Data API").
   - **Project ref**: the code in your project's address bar, e.g. `supabase.com/dashboard/project/abcdefghijklmnop` → `abcdefghijklmnop`.
6. Create an **access token**: click your avatar → Account → **Access Tokens** → Generate new token → name it `github` → copy it.

## Step 5 · Connect GitHub to Supabase and set everything up

In your GitHub repository: **Settings → Secrets and variables → Actions**.

**Secrets** tab → New repository secret, add each:

| Name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | the access token from Step 4.6 |
| `SUPABASE_DB_PASSWORD` | the database password from Step 4.2 |

**Variables** tab → New repository variable, add each:

| Name | Value |
|---|---|
| `SUPABASE_PROJECT_REF` | the project ref, e.g. `abcdefghijklmnop` |
| `SUPABASE_URL` | the Project URL, e.g. `https://abcdefghijklmnop.supabase.co` |
| `SUPABASE_ANON_KEY` | the anon public key (long text starting `eyJ` or `sb_publishable_`) |
| `PUBLIC_URL` | your web address with a slash at the end, e.g. `https://yourname.github.io/thali/` |
| `RECEIPT_EMAIL` | optional: an email address passed to SSLCommerz with each payment |

Then go to the **Actions** tab → **Deploy Supabase** → **Run workflow**. In about 2 minutes this:
- creates all tables, security rules and server logic in your database,
- uploads the five server functions (payments, team logins, gateway keys),
- tells the functions your website address.

A green tick means success. If it fails, open the run and read the red step; most failures are a mistyped secret.

<details>
<summary>No-GitHub-Actions alternative</summary>

- Database: Supabase → **SQL Editor** → New query → paste the whole file `supabase/migrations/20261120000000_thali_init.sql` → Run.
- Functions: install the Supabase CLI (https://supabase.com/docs/guides/cli), then from the project folder run
  `supabase login`, `supabase link --project-ref <ref>`, `supabase functions deploy`, and
  `supabase secrets set APP_URL=https://yourname.github.io/thali/`.
</details>

## Step 6 · Supabase sign-in settings

In Supabase → **Authentication**:

1. **Sign In / Providers** (or Settings): turn on **Allow anonymous sign-ins**. Guests are signed in anonymously when they scan a QR code, so they never create an account. Leave email sign-in on.
2. **URL Configuration**:
   - **Site URL**: your `PUBLIC_URL`, e.g. `https://yourname.github.io/thali/`
   - **Redirect URLs**: add the same address. Password-reset emails use it.
3. Optional hardening once you're live: turn on CAPTCHA protection for sign-ins (Authentication → Attack Protection) to block bots creating anonymous guests.

## Step 7 · Make yourself the platform admin

1. Supabase → **Authentication → Users → Add user → Create new user**. Enter your email and a strong password, and tick **Auto Confirm User**.
2. Supabase → **SQL Editor** → New query → paste (with your email) → Run:

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'you@yourbrand.com';
```

You should see "Success. 1 row".

## Step 8 · Publish the website

1. GitHub repository → **Settings → Pages** → Build and deployment → Source: **GitHub Actions**.
2. **Actions** tab → **Deploy website** → **Run workflow**. This also runs by itself every time you change the code.
3. When it's green, open your `PUBLIC_URL`. You should see the **Staff sign in** page. Sign in with the account from Step 7.
4. Go to **Platform → Settings** and fill in:
   - Platform name (your brand), tagline, support hotline, support email (shown in the privacy policy and terms)
   - **Guest link address**: your `PUBLIC_URL`
5. Optionally, check **Plans** and set your monthly prices in Taka.

You're live. The rest is onboarding restaurants.

---

## Step 9 · Onboard a restaurant

Use `Restaurant onboarding checklist` (in the onboarding document) to collect everything before the visit.

1. **Platform → Add restaurant** and walk through the 7 steps:
   - Basics: names in English and Bangla, area, address, VAT number (BIN), brand colour, plan.
   - Menu: pick the closest template. You'll edit it next.
   - Tables: areas (Ground floor, Rooftop…) and number of tables.
   - Tax & payments: **VAT rate and service charge as the restaurant actually charges them**, whether menu prices include VAT, and which payment methods to accept, with their bKash/Nagad/Rocket merchant numbers.
   - Guest experience: Wi-Fi, quiz, whether orders go straight to the kitchen, takeaway and delivery areas.
   - Team: the **owner's login email and a temporary password**.
   - Launch. **Write down the owner login shown on screen.**
2. **Owner back office → Menu**: replace template dishes with the real menu, prices, Bangla names, allergens and photos (emoji icons for now). Mark sold-out dishes with the switch.
3. **Owner back office → Staff**: create logins:
   - Staff (tablet): waiters/cashier. They see orders, calls and payments.
   - Kitchen display: for the kitchen screen only.
   - Manager: everything except adding owners.
   - Also add waiter and rider names under "Names on the floor".
4. **Owner back office → Tables & QR → Download print sheet**. Print in colour on thick paper or card, fold into table tents or put in acrylic stands. One code per table. **Never swap them between tables.**
5. **Set up the devices:**
   - **Staff tablet** (any Android tablet or phone): open the website → sign in with a Staff login → Staff tablet → tap "Device mode". In Chrome, use ⋮ → Add to Home screen so it opens like an app.
   - **Kitchen screen** (tablet or a TV with a browser): sign in with the Kitchen login → Kitchen display → Device mode. Keep the screen awake (Android: Settings → Display → Screen timeout → longest, or use a "keep awake" app while charging).
6. **Train staff with the Training view** (sidebar): guest phone, staff tablet and kitchen side by side. Place a test order, send it to the kitchen, bump it, serve it, pay it, then clear the table.
7. **Share the takeaway/delivery link** (Tables & QR page) on the restaurant's Facebook page and WhatsApp.

## Step 10 · Test before the first real guest

Do this at the restaurant, on the restaurant's Wi-Fi, with a normal Android phone:

- [ ] Scan a table QR → menu opens in under 5 seconds → switch to বাংলা and back
- [ ] Order 2 dishes (one half portion, one with a deal) → appears on the staff tablet immediately
- [ ] Send to kitchen → appears on the kitchen display in the right station column
- [ ] Bump in the kitchen → guest phone shows "ready"; staff marks served
- [ ] Call waiter → staff sees it with a timer → On my way → Done
- [ ] Pay by bKash Send Money with a real ৳10 test → staff confirms the TrxID → receipt shows PAID with an invoice number
- [ ] Owner back office → Overview shows the sale; Sales & VAT shows the VAT
- [ ] Cancel or clear the test table
- [ ] Place a takeaway order from the shared link → accept → ready → handed over

---

## Step 11 · Your own domain (optional, before printing QR codes)

1. Buy a domain (for `.com.bd`, use a BTCL-accredited registrar; for `.com`, any registrar).
2. GitHub → Settings → Pages → **Custom domain** → enter e.g. `order.yourbrand.com.bd` → Save. Follow GitHub's DNS instructions (a CNAME record pointing to `<your-username>.github.io`). Tick **Enforce HTTPS** once it's available.
3. Update the address everywhere:
   - GitHub variable `PUBLIC_URL` → `https://order.yourbrand.com.bd/`
   - Supabase Authentication → URL Configuration → Site URL and Redirect URLs
   - Run **Deploy Supabase** again (updates the payment return address)
   - Run **Deploy website** again
   - Platform → Settings → Guest link address
4. Re-download and re-print any QR sheets made before the change.

## Step 12 · Payments

Start every restaurant on **manual confirmation**, which needs no paperwork:
- **bKash / Nagad / Rocket Send Money**: the guest sends money to the restaurant's merchant or personal number and types the TrxID; staff check it in their own wallet app and tap Confirm.
- **Cash** and **Bangla QR / bank transfer**: staff confirm on the tablet.

Then add **online gateways** so payments confirm themselves and cards work. Full details are in [PAYMENTS.md](PAYMENTS.md). In short:
1. The restaurant applies for its **own SSLCommerz merchant account** (cards + all wallets on one page) and optionally a **bKash merchant / payment gateway account**. Money then settles straight into the restaurant's bank account, and you never hold guests' money.
2. Test first with **sandbox** credentials: Owner back office → Settings → Online payment gateways → enter them with "Sandbox" on.
3. When the provider approves the live store, enter the live credentials with Sandbox off.

> Collecting payments on behalf of restaurants through a single platform account can require a licence from Bangladesh Bank. Keeping each restaurant on its own merchant account avoids that question. Confirm with a lawyer before changing this model.

## Step 13 · Running it day to day

- **Who is signed in where**: each tablet stays signed in. If staff leave, remove their login in Owner back office → Staff.
- **Suspending a restaurant** that stops paying: Platform → Restaurants → Status → Suspended. Guests see "Ordering is unavailable" and staff can still sign in.
- **Backups**: Supabase Pro takes daily backups. Owners can also export sales any time from Sales & VAT → Export CSV.
- **Records**: orders, payments and invoices stay in the database for VAT records. "Delete records older than 14 days" in Platform → Settings only touches demo restaurants.
- **Monitoring**: Supabase → Edge Functions → Logs shows payment errors; Supabase → Logs shows database errors.
- **Updating the software**: copy new files into your repository folder → GitHub Desktop → Commit → Push. The website redeploys automatically. If the update includes a new file in `supabase/migrations/` or changed functions, run **Deploy Supabase** too.
- **Demo restaurants for sales visits**: Platform → Settings → "Load demo restaurants". They are marked as demo, so the guest simulator works only on them. Delete them from Platform → Restaurants when you no longer need them.

## Troubleshooting

| What you see | Likely cause | Fix |
|---|---|---|
| Website shows sample restaurants and "Demo mode" | `SUPABASE_URL` / `SUPABASE_ANON_KEY` variables missing or misspelled | Check the variables (Step 5), re-run **Deploy website** |
| Guest sees "Could not start… enable anonymous sign-ins" | Anonymous sign-ins off | Step 6.1 |
| "You don't have access to this page" after signing in | Login isn't linked to a restaurant | Platform admin: Step 7. Others: the owner adds them in Staff |
| QR opens a 404 page | QR printed with a different web address | Fix Platform → Settings → Guest link address, re-print |
| "Online payment is not set up for this method" | Gateway not connected or credentials removed | Owner → Settings → Online payment gateways |
| Payment succeeded on bKash/SSLCommerz but the app shows pending | The return page or IPN couldn't verify it | Supabase → Edge Functions → `pay-return` / `pay-ipn` logs; staff can confirm it manually with the TrxID |
| Deploy Supabase fails at "Link project" | Wrong project ref, token or database password | Re-enter the secrets/variables in Step 5 |
| Kitchen screen stops updating overnight | Tablet slept or Wi-Fi dropped | It refreshes itself within a minute of reconnecting; keep it charging with screen timeout off |

## Security checklist before launch

- [ ] Supabase on the Pro plan (backups, no pausing)
- [ ] Strong, unique passwords for your admin login and the Supabase account; turn on two-factor authentication on GitHub and Supabase
- [ ] Only you are in `platform_admins`
- [ ] Each restaurant owner changed their temporary password
- [ ] Gateway credentials entered only through Owner → Settings (never put them in GitHub)
- [ ] Privacy Policy and Terms reviewed by a lawyer and your support email filled in
- [ ] Test order and payment completed at the first restaurant (Step 10)
