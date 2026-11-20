-- =====================================================================
-- Thali Restaurant OS — database schema, security rules and server logic
-- Run once on a new Supabase project (Supabase CLI: `supabase db push`,
-- or paste into Dashboard → SQL Editor → Run).
--
-- Who can do what
--   platform admin  : everything (rows in platform_admins)
--   restaurant team : owner / manager / staff / kitchen of one restaurant (rows in memberships)
--   guest           : anyone who scans a QR code; signed in anonymously by the app
--
-- Guests can only: read menus, join a table, place orders, call a waiter,
-- start a payment (always "pending"), leave a review. Prices, bills and
-- "paid" status are always decided here on the server, never by the phone.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.platform (
  id text primary key,
  rid text,
  data jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurants (
  id text primary key check (id ~ '^[a-z0-9]{2,24}$'),
  rid text generated always as (id) stored,
  data jsonb not null,
  status text generated always as (coalesce(data ->> 'status', 'trial')) stored,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memberships (
  rid text not null references public.restaurants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff', 'kitchen')),
  name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  primary key (rid, user_id)
);

create table if not exists public.sessions (
  id text primary key,
  rid text not null references public.restaurants (id) on delete cascade,
  data jsonb not null,
  table_id text generated always as (data ->> 'tableId') stored,
  status text generated always as (coalesce(data ->> 'status', 'open')) stored,
  opened_ms bigint generated always as ((data ->> 'openedAt')::bigint) stored,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

create table if not exists public.session_guests (
  session_id text not null references public.sessions (id) on delete cascade,
  user_id uuid not null,
  name text not null default '',
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table if not exists public.orders (
  id text primary key,
  rid text not null references public.restaurants (id) on delete cascade,
  data jsonb not null,
  session_id text generated always as (nullif(data ->> 'sessionId', '')) stored,
  channel text generated always as (coalesce(data ->> 'channel', 'dine')) stored,
  status text generated always as (data ->> 'status') stored,
  created_ms bigint generated always as ((data ->> 'createdAt')::bigint) stored,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id text primary key,
  rid text not null references public.restaurants (id) on delete cascade,
  data jsonb not null,
  session_id text generated always as (nullif(data ->> 'sessionId', '')) stored,
  order_id text generated always as (nullif(data ->> 'orderId', '')) stored,
  status text generated always as (data ->> 'status') stored,
  created_ms bigint generated always as ((data ->> 'createdAt')::bigint) stored,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

create table if not exists public.requests (
  id text primary key,
  rid text not null references public.restaurants (id) on delete cascade,
  data jsonb not null,
  session_id text generated always as (nullif(data ->> 'sessionId', '')) stored,
  status text generated always as (data ->> 'status') stored,
  created_ms bigint generated always as ((data ->> 'createdAt')::bigint) stored,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id text primary key,
  rid text not null references public.restaurants (id) on delete cascade,
  data jsonb not null,
  created_ms bigint generated always as ((data ->> 'createdAt')::bigint) stored,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

-- Gateway credentials per restaurant. Never readable from the browser.
create table if not exists public.payment_credentials (
  rid text not null references public.restaurants (id) on delete cascade,
  provider text not null check (provider in ('sslcommerz', 'bkash')),
  config jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (rid, provider)
);

-- Raw gateway callbacks, kept for reconciliation and disputes.
create table if not exists public.payment_events (
  id bigserial primary key,
  payment_id text,
  provider text,
  kind text,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- Sequential invoice numbers per restaurant per day (needed for VAT records).
create table if not exists public.invoice_counters (
  rid text not null,
  day date not null,
  n integer not null default 0,
  primary key (rid, day)
);

create index if not exists orders_rid_created on public.orders (rid, created_ms desc);
create index if not exists orders_session on public.orders (session_id);
create index if not exists orders_creator on public.orders (created_by);
create index if not exists sessions_rid_open on public.sessions (rid, table_id) where status <> 'closed';
create index if not exists sessions_rid_opened on public.sessions (rid, opened_ms desc);
create index if not exists payments_session on public.payments (session_id);
create index if not exists payments_order on public.payments (order_id);
create index if not exists payments_rid_created on public.payments (rid, created_ms desc);
create index if not exists requests_rid_created on public.requests (rid, created_ms desc);
create index if not exists reviews_rid_created on public.reviews (rid, created_ms desc);
create index if not exists session_guests_user on public.session_guests (user_id);
create index if not exists memberships_user on public.memberships (user_id);

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.now_ms() returns bigint
language sql stable as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.is_member(p_rid text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
      or exists (select 1 from public.memberships where rid = p_rid and user_id = auth.uid());
$$;

create or replace function public.is_manager(p_rid text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_platform_admin()
      or exists (select 1 from public.memberships where rid = p_rid and user_id = auth.uid() and role in ('owner', 'manager'));
$$;

create or replace function public.in_session(p_sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.session_guests where session_id = p_sid and user_id = auth.uid());
$$;

-- Trusted writers skip the guest guards: server functions (they set thali.trusted),
-- edge functions using the service role, and direct SQL from the dashboard (no JWT role).
create or replace function public.is_trusted() returns boolean
language sql stable as $$
  select coalesce(current_setting('thali.trusted', true), '') = 'on'
      or auth.role() = 'service_role'
      or auth.role() is null;
$$;

-- Deep merge of two JSON objects (nested objects merge, everything else is replaced)
create or replace function public.jsonb_deep_merge(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select case
    when jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then
      coalesce((
        select jsonb_object_agg(k,
          case when a ? k and b ? k then public.jsonb_deep_merge(a -> k, b -> k)
               when b ? k then b -> k
               else a -> k end)
        from (select jsonb_object_keys(a) as k union select jsonb_object_keys(b)) keys
      ), '{}'::jsonb)
    else b
  end;
$$;

-- The same bill maths the app uses (VAT on food + service charge; tip on food only).
create or replace function public.thali_compute_bill(p_rid text, p_subtotal numeric, p_packaging numeric, p_delivery numeric, p_tip_pct numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t jsonb;
  vat_pct numeric; sc_pct numeric; incl boolean;
  sc numeric; vat numeric; total numeric; tip numeric;
begin
  select coalesce(data -> 'tax', '{}'::jsonb) into t from public.restaurants where id = p_rid;
  vat_pct := coalesce((t ->> 'vat')::numeric, 0);
  sc_pct := coalesce((t ->> 'sc')::numeric, 0);
  incl := coalesce((t ->> 'inclusive')::boolean, false);
  sc := round(p_subtotal * sc_pct / 100);
  if incl then
    vat := round((p_subtotal + sc) * vat_pct / (100 + vat_pct));
    total := p_subtotal + sc + coalesce(p_packaging, 0) + coalesce(p_delivery, 0);
  else
    vat := round((p_subtotal + sc) * vat_pct / 100);
    total := p_subtotal + sc + vat + coalesce(p_packaging, 0) + coalesce(p_delivery, 0);
  end if;
  tip := round(p_subtotal * coalesce(p_tip_pct, 0) / 100);
  return jsonb_build_object(
    'subtotal', p_subtotal, 'sc', sc, 'scPct', sc_pct, 'vat', vat, 'vatPct', vat_pct, 'inclusive', incl,
    'packaging', coalesce(p_packaging, 0), 'delivery', coalesce(p_delivery, 0), 'tip', tip, 'total', total + tip);
end $$;

-- ---------------------------------------------------------------------
-- Guards (run on every write; members and server functions pass freely)
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create or replace function public.restaurants_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.data := jsonb_set(new.data, '{id}', to_jsonb(new.id));
  if tg_op = 'UPDATE' and not public.is_platform_admin() and not public.is_trusted() then
    -- owners and managers cannot change their own plan, status or trial
    new.data := (new.data - 'status' - 'plan' - 'trialEnds')
      || jsonb_strip_nulls(jsonb_build_object('status', old.data -> 'status', 'plan', old.data -> 'plan', 'trialEnds', old.data -> 'trialEnds'));
  end if;
  return new;
end $$;

create or replace function public.sessions_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := array['guests', 'tipPct', 'billRequested', 'billAt', 'quiz', 'reviewed'];
begin
  new.updated_at := now();
  if public.is_trusted() or public.is_member(new.rid) then return new; end if;
  if tg_op = 'INSERT' then
    raise exception 'Guests join a table through thali_join_table()' using errcode = '42501';
  end if;
  if old.status = 'closed' then raise exception 'This visit is closed' using errcode = '42501'; end if;
  if (new.data - allowed) is distinct from (old.data - allowed) or new.rid <> old.rid then
    raise exception 'Guests can only change tip, bill request, quiz and review' using errcode = '42501';
  end if;
  if coalesce((new.data ->> 'tipPct')::numeric, 0) not between 0 and 30 then
    new.data := jsonb_set(new.data, '{tipPct}', '0');
  end if;
  return new;
end $$;

-- Re-prices every line from the restaurant's own menu so a phone cannot change prices.
create or replace function public.thali_reprice_lines(p_rid text, p_lines jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb; line jsonb; item jsonb; cat jsonb; parent jsonb; res jsonb := '[]'::jsonb;
  unit numeric; qty int; station text;
begin
  select data into r from public.restaurants where id = p_rid;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Order has no items' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) > 60 then raise exception 'Too many lines' using errcode = '22023'; end if;
  for line in select e.value from jsonb_array_elements(p_lines) as e(value) loop
    item := (select e.value from jsonb_array_elements(r -> 'items') as e(value) where e.value ->> 'id' = line ->> 'itemId' limit 1);
    if item is null then raise exception 'Unknown dish %', line ->> 'itemId' using errcode = '22023'; end if;
    if coalesce((item ->> 'available')::boolean, true) = false then
      raise exception '% is sold out', item -> 'name' ->> 'en' using errcode = '22023';
    end if;
    qty := greatest(1, least(50, coalesce((line ->> 'qty')::int, 1)));
    if coalesce((line ->> 'deal')::boolean, false) then
      parent := (select e.value from jsonb_array_elements(r -> 'items') as e(value)
        where e.value -> 'deal' ->> 'itemId' = item ->> 'id' order by (e.value -> 'deal' ->> 'price')::numeric limit 1);
      if parent is null then raise exception 'No deal for %', item ->> 'id' using errcode = '22023'; end if;
      unit := (parent -> 'deal' ->> 'price')::numeric;
    elsif line ->> 'size' = 'half' and nullif(item ->> 'half', '') is not null then
      unit := (item ->> 'half')::numeric;
    else
      unit := (item ->> 'price')::numeric;
      line := jsonb_set(line, '{size}', '"full"');
    end if;
    cat := (select e.value from jsonb_array_elements(r -> 'categories') as e(value) where e.value ->> 'id' = item ->> 'cat' limit 1);
    station := coalesce(cat ->> 'station', r -> 'stations' -> 0 ->> 'id');
    line := line || jsonb_build_object('unit', unit, 'qty', qty, 'station', station, 'name', item -> 'name', 'icon', item -> 'icon');
    line := jsonb_set(line, '{note}', to_jsonb(left(coalesce(line ->> 'note', ''), 140)));
    res := res || jsonb_build_array(line);
  end loop;
  return res;
end $$;

create or replace function public.orders_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; s record; lines jsonb; sub numeric; zone jsonb; auto boolean;
begin
  new.updated_at := now();
  if public.is_trusted() or public.is_member(new.rid) then return new; end if;
  if tg_op = 'UPDATE' then raise exception 'Only restaurant staff can change orders' using errcode = '42501'; end if;

  select data into r from public.restaurants where id = new.rid;
  if r is null or coalesce(r ->> 'status', '') = 'suspended' then
    raise exception 'This restaurant is not taking orders' using errcode = '42501';
  end if;

  lines := public.thali_reprice_lines(new.rid, new.data -> 'items');
  sub := (select coalesce(sum((l ->> 'unit')::numeric * (l ->> 'qty')::numeric), 0) from jsonb_array_elements(lines) l);
  new.created_by := auth.uid();
  new.data := new.data || jsonb_build_object('items', lines, 'done', '{}'::jsonb, 'createdAt', public.now_ms());

  if coalesce(new.data ->> 'channel', 'dine') = 'dine' then
    if coalesce((r -> 'features' ->> 'tableOrdering')::boolean, true) = false then
      raise exception 'Please order with your waiter' using errcode = '42501';
    end if;
    select * into s from public.sessions where id = new.data ->> 'sessionId';
    if s is null or not public.in_session(s.id) or s.status <> 'open' then
      raise exception 'Scan the table QR code again to order' using errcode = '42501';
    end if;
    auto := coalesce((r -> 'features' ->> 'autoKitchen')::boolean, false);
    new.data := new.data || jsonb_build_object(
      'tableId', s.table_id, 'status', case when auto then 'kitchen' else 'new' end,
      'sentAt', case when auto then to_jsonb(public.now_ms()) else 'null'::jsonb end, 'bill', 'null'::jsonb);
  else
    if new.data ->> 'channel' = 'takeaway' and coalesce((r -> 'features' ->> 'takeaway')::boolean, false) = false then
      raise exception 'Takeaway is not available' using errcode = '42501';
    end if;
    if new.data ->> 'channel' = 'delivery' then
      if coalesce((r -> 'features' ->> 'delivery')::boolean, false) = false then
        raise exception 'Delivery is not available' using errcode = '42501';
      end if;
      zone := (select e.value from jsonb_array_elements(r -> 'online' -> 'zones') as e(value) where e.value ->> 'id' = new.data ->> 'zone' limit 1);
      if zone is null then raise exception 'Choose a delivery area' using errcode = '22023'; end if;
    elsif new.data ->> 'channel' <> 'takeaway' then
      raise exception 'Unknown channel' using errcode = '22023';
    end if;
    if sub < coalesce((r -> 'online' ->> 'minOrder')::numeric, 0) then
      raise exception 'Below the minimum order' using errcode = '22023';
    end if;
    new.data := new.data || jsonb_build_object(
      'status', 'new', 'sentAt', 'null'::jsonb, 'sessionId', '', 'tableId', '',
      'bill', public.thali_compute_bill(new.rid, sub, coalesce((r -> 'online' ->> 'packaging')::numeric, 0), coalesce((zone ->> 'fee')::numeric, 0), 0),
      'payment', jsonb_build_object(
        'method', coalesce(new.data -> 'payment' ->> 'method', 'cash'),
        'status', case when coalesce(new.data -> 'payment' ->> 'method', 'cash') = 'cash' then 'unpaid' else 'pending' end));
  end if;
  return new;
end $$;

create or replace function public.payments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; o record; m text;
begin
  new.updated_at := now();
  if public.is_trusted() or public.is_member(new.rid) then return new; end if;
  if tg_op = 'UPDATE' then raise exception 'Only restaurant staff can change payments' using errcode = '42501'; end if;
  select data into r from public.restaurants where id = new.rid;
  m := new.data ->> 'method';
  if r is null or coalesce((r -> 'payments' -> m ->> 'on')::boolean, false) = false then
    raise exception 'This payment method is not available' using errcode = '22023';
  end if;
  if new.data ->> 'sessionId' is not null and new.data ->> 'sessionId' <> '' then
    if not public.in_session(new.data ->> 'sessionId') then raise exception 'Not your table' using errcode = '42501'; end if;
  elsif new.data ->> 'orderId' is not null and new.data ->> 'orderId' <> '' then
    select * into o from public.orders where id = new.data ->> 'orderId';
    if o is null or o.created_by is distinct from auth.uid() then raise exception 'Not your order' using errcode = '42501'; end if;
    new.data := jsonb_set(new.data, '{amount}', coalesce(o.data -> 'bill' -> 'total', '0'::jsonb));
  else
    raise exception 'Payment must belong to a table or an order' using errcode = '22023';
  end if;
  if coalesce((new.data ->> 'amount')::numeric, 0) <= 0 or (new.data ->> 'amount')::numeric > 1000000 then
    raise exception 'Invalid amount' using errcode = '22023';
  end if;
  new.created_by := auth.uid();
  new.data := new.data || jsonb_build_object('status', 'pending', 'paidAt', 'null'::jsonb, 'createdAt', public.now_ms(), 'trx', coalesce(left(new.data ->> 'trx', 40), ''));
  return new;
end $$;

create or replace function public.requests_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if public.is_trusted() or public.is_member(new.rid) then return new; end if;
  if tg_op = 'UPDATE' then raise exception 'Only restaurant staff can change requests' using errcode = '42501'; end if;
  if not public.in_session(new.data ->> 'sessionId') then raise exception 'Not your table' using errcode = '42501'; end if;
  new.created_by := auth.uid();
  new.data := new.data || jsonb_build_object('status', 'open', 'createdAt', public.now_ms(), 'note', left(coalesce(new.data ->> 'note', ''), 200));
  return new;
end $$;

create or replace function public.reviews_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if public.is_trusted() or public.is_member(new.rid) then return new; end if;
  if tg_op = 'UPDATE' then raise exception 'Reviews cannot be edited' using errcode = '42501'; end if;
  if coalesce((new.data ->> 'stars')::int, 0) not between 1 and 5 then raise exception 'Stars must be 1 to 5' using errcode = '22023'; end if;
  if coalesce(new.data ->> 'sessionId', '') <> '' and not public.in_session(new.data ->> 'sessionId') then
    raise exception 'Not your table' using errcode = '42501';
  end if;
  if coalesce(new.data ->> 'orderId', '') <> '' and not exists (select 1 from public.orders where id = new.data ->> 'orderId' and created_by = auth.uid()) then
    raise exception 'Not your order' using errcode = '42501';
  end if;
  new.created_by := auth.uid();
  new.data := new.data || jsonb_build_object('createdAt', public.now_ms(), 'comment', left(coalesce(new.data ->> 'comment', ''), 1000));
  return new;
end $$;

drop trigger if exists restaurants_guard on public.restaurants;
create trigger restaurants_guard before insert or update on public.restaurants for each row execute function public.restaurants_guard();
drop trigger if exists sessions_guard on public.sessions;
create trigger sessions_guard before insert or update on public.sessions for each row execute function public.sessions_guard();
drop trigger if exists orders_guard on public.orders;
create trigger orders_guard before insert or update on public.orders for each row execute function public.orders_guard();
drop trigger if exists payments_guard on public.payments;
create trigger payments_guard before insert or update on public.payments for each row execute function public.payments_guard();
drop trigger if exists requests_guard on public.requests;
create trigger requests_guard before insert or update on public.requests for each row execute function public.requests_guard();
drop trigger if exists reviews_guard on public.reviews;
create trigger reviews_guard before insert or update on public.reviews for each row execute function public.reviews_guard();
drop trigger if exists platform_touch on public.platform;
create trigger platform_touch before update on public.platform for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table public.platform_admins enable row level security;
alter table public.platform enable row level security;
alter table public.restaurants enable row level security;
alter table public.memberships enable row level security;
alter table public.sessions enable row level security;
alter table public.session_guests enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.requests enable row level security;
alter table public.reviews enable row level security;
alter table public.payment_credentials enable row level security;
alter table public.payment_events enable row level security;
alter table public.invoice_counters enable row level security;

drop policy if exists admins_self on public.platform_admins;
create policy admins_self on public.platform_admins for select using (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists platform_read on public.platform;
create policy platform_read on public.platform for select using (true);
drop policy if exists platform_write on public.platform;
create policy platform_write on public.platform for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists restaurants_read on public.restaurants;
create policy restaurants_read on public.restaurants for select using (true);
drop policy if exists restaurants_insert on public.restaurants;
create policy restaurants_insert on public.restaurants for insert with check (public.is_platform_admin());
drop policy if exists restaurants_update on public.restaurants;
create policy restaurants_update on public.restaurants for update using (public.is_manager(id)) with check (public.is_manager(id));
drop policy if exists restaurants_delete on public.restaurants;
create policy restaurants_delete on public.restaurants for delete using (public.is_platform_admin());

drop policy if exists memberships_read on public.memberships;
create policy memberships_read on public.memberships for select using (user_id = auth.uid() or public.is_manager(rid));
drop policy if exists memberships_admin on public.memberships;
create policy memberships_admin on public.memberships for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists sessions_read on public.sessions;
create policy sessions_read on public.sessions for select using (public.is_member(rid) or public.in_session(id));
drop policy if exists sessions_insert on public.sessions;
create policy sessions_insert on public.sessions for insert with check (public.is_member(rid));
drop policy if exists sessions_update on public.sessions;
create policy sessions_update on public.sessions for update using (public.is_member(rid) or public.in_session(id)) with check (public.is_member(rid) or public.in_session(id));
drop policy if exists sessions_delete on public.sessions;
create policy sessions_delete on public.sessions for delete using (public.is_manager(rid));

drop policy if exists guests_read on public.session_guests;
create policy guests_read on public.session_guests for select using (
  user_id = auth.uid() or exists (select 1 from public.sessions s where s.id = session_id and public.is_member(s.rid)));

drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select using (
  public.is_member(rid) or created_by = auth.uid() or (session_id is not null and public.in_session(session_id)));
drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders for insert with check (auth.uid() is not null);
drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders for update using (public.is_member(rid)) with check (public.is_member(rid));
drop policy if exists orders_delete on public.orders;
create policy orders_delete on public.orders for delete using (public.is_manager(rid));

drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select using (
  public.is_member(rid) or created_by = auth.uid() or (session_id is not null and public.in_session(session_id)));
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert with check (auth.uid() is not null);
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments for update using (public.is_member(rid)) with check (public.is_member(rid));
drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments for delete using (public.is_manager(rid));

drop policy if exists requests_read on public.requests;
create policy requests_read on public.requests for select using (
  public.is_member(rid) or (session_id is not null and public.in_session(session_id)));
drop policy if exists requests_insert on public.requests;
create policy requests_insert on public.requests for insert with check (auth.uid() is not null);
drop policy if exists requests_update on public.requests;
create policy requests_update on public.requests for update using (public.is_member(rid)) with check (public.is_member(rid));
drop policy if exists requests_delete on public.requests;
create policy requests_delete on public.requests for delete using (public.is_manager(rid));

drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select using (public.is_member(rid) or created_by = auth.uid());
drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews for insert with check (auth.uid() is not null);
drop policy if exists reviews_manage on public.reviews;
create policy reviews_manage on public.reviews for delete using (public.is_manager(rid));

-- payment_credentials, payment_events, invoice_counters: no policies = server only.

-- ---------------------------------------------------------------------
-- Server functions (called from the app with supabase.rpc)
-- ---------------------------------------------------------------------

-- Merge a partial update into one document (used for live status changes).
create or replace function public.thali_patch(p_table text, p_id text, p_patch jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare res jsonb;
begin
  if p_table not in ('restaurants', 'sessions', 'orders', 'payments', 'requests', 'reviews', 'platform') then
    raise exception 'Unknown table %', p_table using errcode = '22023';
  end if;
  execute format('update public.%I set data = public.jsonb_deep_merge(data, $1) where id = $2 returning data', p_table)
    using p_patch, p_id into res;
  if res is null then raise exception 'Not found or not allowed' using errcode = 'P0002'; end if;
  return res;
end $$;

-- Guest scans a table QR: join the open visit at that table, or start one.
create or replace function public.thali_join_table(p_rid text, p_table text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; sid text; s_status text; s_paid bigint; nm text := left(trim(coalesce(p_name, '')), 24); d jsonb;
begin
  if auth.uid() is null then raise exception 'Sign-in required' using errcode = '42501'; end if;
  select data into r from public.restaurants where id = p_rid;
  if r is null or coalesce(r ->> 'status', '') = 'suspended' then
    raise exception 'This restaurant is not taking orders' using errcode = '42501';
  end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'tables') t where t ->> 'id' = p_table) then
    raise exception 'Unknown table' using errcode = '22023';
  end if;
  perform set_config('thali.trusted', 'on', true);
  perform pg_advisory_xact_lock(hashtext(p_rid || ':' || p_table));

  select id, status, coalesce((data ->> 'paidAt')::bigint, 0) into sid, s_status, s_paid
    from public.sessions where rid = p_rid and table_id = p_table and status <> 'closed'
    order by opened_ms desc limit 1 for update;
  -- a paid table nobody cleared for 10 minutes is a new party
  if sid is not null and s_status = 'paid' and s_paid < public.now_ms() - 600000 then
    update public.sessions set data = data || jsonb_build_object('status', 'closed', 'closedAt', public.now_ms()) where id = sid;
    sid := null;
  end if;
  if sid is null then
    sid := 's' || encode(gen_random_bytes(6), 'hex');
    insert into public.sessions (id, rid, data) values (sid, p_rid, jsonb_build_object(
      'id', sid, 'rid', p_rid, 'tableId', p_table, 'status', 'open', 'openedAt', public.now_ms(),
      'guests', '[]'::jsonb, 'tipPct', 0, 'billRequested', false, 'quiz', jsonb_build_object('score', 0, 'played', 0)));
  end if;

  insert into public.session_guests (session_id, user_id, name) values (sid, auth.uid(), nm)
    on conflict (session_id, user_id) do update set name = excluded.name;
  if nm <> '' then
    update public.sessions set data = jsonb_set(data, '{guests}', coalesce(data -> 'guests', '[]'::jsonb) || to_jsonb(nm))
      where id = sid and not coalesce(data -> 'guests', '[]'::jsonb) ? nm;
  end if;
  select data into d from public.sessions where id = sid;
  return d;
end $$;

-- Table-vs-table quiz leaderboard without exposing other tables' orders.
create or replace function public.thali_quiz_board(p_rid text)
returns table (session_id text, table_id text, score int)
language sql stable security definer set search_path = public as $$
  select id, table_id, coalesce((data -> 'quiz' ->> 'score')::int, 0)
  from public.sessions where rid = p_rid and status <> 'closed'
  order by 3 desc limit 10;
$$;

-- Server-side bill for a table visit
create or replace function public.thali_session_bill(p_sid text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s record; sub numeric;
begin
  select * into s from public.sessions where id = p_sid;
  if s is null then return null; end if;
  select coalesce(sum((l ->> 'unit')::numeric * (l ->> 'qty')::numeric), 0) into sub
    from public.orders o, jsonb_array_elements(o.data -> 'items') l
    where o.session_id = p_sid and coalesce(o.status, '') <> 'cancelled';
  return public.thali_compute_bill(s.rid, sub, 0, 0, coalesce((s.data ->> 'tipPct')::numeric, 0));
end $$;

-- Close the bill when payments cover it. Safe to call any number of times.
create or replace function public.thali_settle_session(p_sid text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s record; bill jsonb; paid numeric; paid_by jsonb; v_n int; inv text;
begin
  select * into s from public.sessions where id = p_sid for update;
  if s is null then raise exception 'Unknown visit' using errcode = 'P0002'; end if;
  if not (public.is_member(s.rid) or public.in_session(p_sid) or auth.role() = 'service_role' or public.is_trusted()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if s.status in ('paid', 'closed') then return s.data; end if;
  perform set_config('thali.trusted', 'on', true);
  bill := public.thali_session_bill(p_sid);
  select coalesce(sum((data ->> 'amount')::numeric), 0) into paid from public.payments where session_id = p_sid and status = 'paid';
  if (bill ->> 'total')::numeric <= 0 or paid < (bill ->> 'total')::numeric - 1 then return s.data; end if;
  select coalesce(jsonb_object_agg(m, amt), '{}'::jsonb) into paid_by from (
    select data ->> 'method' m, sum((data ->> 'amount')::numeric) amt from public.payments
    where session_id = p_sid and status = 'paid' group by 1) x;
  insert into public.invoice_counters (rid, day, n) values (s.rid, (now() at time zone 'Asia/Dhaka')::date, 1)
    on conflict (rid, day) do update set n = public.invoice_counters.n + 1 returning public.invoice_counters.n into v_n;
  inv := 'INV-' || to_char(now() at time zone 'Asia/Dhaka', 'YYMMDD') || '-' || lpad(v_n::text, 4, '0');
  update public.sessions set data = data || jsonb_build_object(
    'status', 'paid', 'paidAt', public.now_ms(), 'bill', bill, 'paidBy', paid_by, 'billRequested', false, 'invoiceNo', inv)
    where id = p_sid;
  update public.requests set data = data || jsonb_build_object('status', 'done', 'doneAt', public.now_ms())
    where session_id = p_sid and data ->> 'type' = 'bill' and status <> 'done';
  select data into bill from public.sessions where id = p_sid;
  return bill;
end $$;

-- Mark a payment as received (staff for cash / transfers; server for gateways), then settle.
create or replace function public.thali_mark_paid(p_payment_id text, p_trx text, p_by text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if p is null then raise exception 'Unknown payment' using errcode = 'P0002'; end if;
  if not (public.is_member(p.rid) or auth.role() = 'service_role') then
    raise exception 'Only restaurant staff can confirm payments' using errcode = '42501';
  end if;
  perform set_config('thali.trusted', 'on', true);
  if p.status <> 'paid' then
    update public.payments set data = data || jsonb_build_object(
      'status', 'paid', 'paidAt', public.now_ms(), 'confirmedBy', coalesce(p_by, ''),
      'trx', coalesce(nullif(p_trx, ''), data ->> 'trx', '')) where id = p.id;
  end if;
  if p.session_id is not null then
    perform public.thali_settle_session(p.session_id);
  elsif p.order_id is not null then
    update public.orders set data = jsonb_set(data, '{payment}', coalesce(data -> 'payment', '{}'::jsonb) || jsonb_build_object(
      'method', p.data ->> 'method', 'status', 'paid', 'paidAt', public.now_ms(), 'trx', coalesce(nullif(p_trx, ''), ''))) where id = p.order_id;
  end if;
  return (select data from public.payments where id = p.id);
end $$;

-- Staff: collect whatever is left on a table in one method.
create or replace function public.thali_settle_remaining(p_sid text, p_method text, p_by text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s record; bill jsonb; paid numeric; pend record; due numeric; pid text;
begin
  select * into s from public.sessions where id = p_sid;
  if s is null or not public.is_member(s.rid) then raise exception 'Not allowed' using errcode = '42501'; end if;
  perform set_config('thali.trusted', 'on', true);
  for pend in select id from public.payments where session_id = p_sid and status = 'pending' loop
    update public.payments set data = data || jsonb_build_object('status', 'paid', 'paidAt', public.now_ms(), 'confirmedBy', coalesce(p_by, '')) where id = pend.id;
  end loop;
  bill := public.thali_session_bill(p_sid);
  select coalesce(sum((data ->> 'amount')::numeric), 0) into paid from public.payments where session_id = p_sid and status = 'paid';
  due := (bill ->> 'total')::numeric - paid;
  if due > 0 then
    pid := 'p' || encode(gen_random_bytes(6), 'hex');
    insert into public.payments (id, rid, data) values (pid, s.rid, jsonb_build_object(
      'id', pid, 'rid', s.rid, 'sessionId', p_sid, 'tableId', s.table_id, 'who', 'Table', 'amount', due,
      'method', p_method, 'status', 'paid', 'createdAt', public.now_ms(), 'paidAt', public.now_ms(), 'confirmedBy', coalesce(p_by, '')));
  end if;
  return public.thali_settle_session(p_sid);
end $$;

-- Grants for the app's roles (Supabase uses anon / authenticated)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.platform, public.restaurants, public.memberships, public.sessions,
  public.orders, public.payments, public.requests, public.reviews to authenticated;
grant select on public.platform, public.restaurants to anon;
grant select on public.session_guests, public.platform_admins to authenticated;
grant execute on function public.thali_patch(text, text, jsonb), public.thali_join_table(text, text, text),
  public.thali_quiz_board(text), public.thali_settle_session(text), public.thali_mark_paid(text, text, text),
  public.thali_settle_remaining(text, text, text), public.thali_session_bill(text),
  public.is_platform_admin(), public.is_member(text), public.is_manager(text), public.in_session(text)
  to authenticated;

-- Live updates for the app
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.restaurants; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.sessions; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.orders; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.payments; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.requests; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.reviews; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.platform; exception when duplicate_object then null; end;
  end if;
end $$;

-- Default platform settings row
insert into public.platform (id, data) values ('settings', jsonb_build_object(
  'id', 'settings', 'name', 'Thali', 'tagline', 'QR ordering & restaurant OS for Bangladesh', 'baseUrl', '', 'support', '',
  'plans', jsonb_build_array(
    jsonb_build_object('id', 'starter', 'name', 'Starter', 'price', 1500, 'tables', 10, 'features', jsonb_build_array('QR table ordering', 'Kitchen display', 'Bangla + English menu', 'bKash / Nagad / card payments')),
    jsonb_build_object('id', 'growth', 'name', 'Growth', 'price', 3500, 'tables', 30, 'features', jsonb_build_array('Everything in Starter', 'Takeaway & delivery ordering', 'Bill split and tips', 'Sales & VAT reports')),
    jsonb_build_object('id', 'pro', 'name', 'Pro', 'price', 7000, 'tables', 999, 'features', jsonb_build_array('Everything in Growth', 'Unlimited tables', 'Multi-branch overview', 'Priority support')))
)) on conflict (id) do nothing;
