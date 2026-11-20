// App shell and router
import { render } from 'preact';
import './styles.css';
import { useState, useEffect } from './hooks.js';
import { Ic, Toasts, PhoneFrame, Logo, Empty } from './ui.js';
import { state, subscribe, init, bulkPut, toast, connectScope, ensureGuest, signOut, role, notify } from './store.js';
const subscribeKick = () => notify();
import { LIVE } from './backend.js';
import * as A from './actions.js';
import { sampleRestaurants, historyFor, sampleReviews, PLATFORM_DEFAULT } from './seed.js';
import { CustomerApp } from './customer.js';
import { OnlineApp } from './online.js';
import { StaffApp } from './staff.js';
import { KitchenApp } from './kitchen.js';
import { OwnerApp } from './owner.js';
import { PlatformApp, WelcomeEmpty } from './platform.js';
import { DemoView } from './demo.js';
import { Login, SetPassword, NoAccess } from './live.js';
import { LegalPage } from './legal.js';

export function parse(hash) {
  const h = (hash || '').replace(/^#/, '');
  if (h === 'privacy' || h === 'terms') return { area: 'legal', view: h };
  if (!h || h === 'platform') return { area: 'home' };
  const parts = h.split('-');
  if (parts[0] === 'platform') return { area: 'platform', view: parts[1] || 'home' };
  const rid = parts[0];
  const kind = parts[1] || 'demo';
  if (kind === 'table') return { area: 'customer', rid, tid: parts[2] };
  if (kind === 'order') return { area: 'online', rid };
  if (kind === 'owner') return { area: 'owner', rid, view: parts[2] || 'overview' };
  if (kind === 'staff') return { area: 'staff', rid };
  if (kind === 'kitchen') return { area: 'kitchen', rid };
  if (kind === 'guest') return { area: 'guest', rid, tid: parts[2] };
  return { area: 'demo', rid };
}

function useRoute() {
  const [route, setRoute] = useState(parse(location.hash));
  useEffect(() => {
    const f = () => setRoute(parse(location.hash));
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return route;
}

const go = (h) => (location.hash = h);

// What each role may open (live mode). Demo mode: everything.
const ALLOWED = {
  admin: ['platform', 'demo', 'owner', 'staff', 'kitchen', 'guest'],
  owner: ['demo', 'owner', 'staff', 'kitchen', 'guest'],
  manager: ['demo', 'owner', 'staff', 'kitchen', 'guest'],
  staff: ['demo', 'staff', 'kitchen', 'guest'],
  kitchen: ['kitchen'],
};
const landingFor = (m) => '#' + m.rid + '-' + (m.role === 'kitchen' ? 'kitchen' : m.role === 'staff' ? 'staff' : 'owner-overview');

function Sidebar({ route, open, setOpen }) {
  const a = state.auth;
  const isAdmin = !LIVE || a.admin;
  const mine = isAdmin ? A.restaurants() : A.restaurants().filter((x) => a.members.some((m) => m.rid === x.id));
  const p = A.platform();
  const cur = route.rid && A.restaurant(route.rid) ? route.rid : mine[0]?.id;
  const r = cur ? A.restaurant(cur) : null;
  const myRole = cur ? role(cur) : null;
  const can = (area) => !LIVE || (ALLOWED[myRole] || []).includes(area);
  const is = (area, view) => route.area === area && (!view || route.view === view) && (area === 'platform' || route.rid === cur);
  const link = (href, icon, label, on) => (
    <a href={href} class={on ? 'on' : ''} aria-current={on ? 'page' : undefined} onClick={() => setOpen(false)}>
      <Ic n={icon} s={17} />
      <span>{label}</span>
    </a>
  );
  // members only see their own restaurants; the list comes from their memberships
  const pickList = isAdmin ? A.restaurants() : a.members.map((m) => A.restaurant(m.rid) || { id: m.rid, name: { en: m.rid } });
  return (
    <aside class={'side' + (open ? ' open' : '')}>
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="30" height="30"><circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="2.2" /><circle cx="16" cy="16" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".6" /><circle cx="22.5" cy="9.5" r="3.2" fill="#F2B233" /></svg>
        </span>
        <span>
          <b>{p.name}</b>
          <small>Restaurant OS · Bangladesh</small>
        </span>
      </div>
      <nav>
        {isAdmin && (
          <>
            <h6>Platform</h6>
            {link('#platform-home', 'home', 'Dashboard', is('platform', 'home'))}
            {link('#platform-restaurants', 'building', 'Restaurants', is('platform', 'restaurants'))}
            {link('#platform-new', 'plus', 'Add restaurant', is('platform', 'new'))}
            {link('#platform-plans', 'layers', 'Plans', is('platform', 'plans'))}
            {link('#platform-settings', 'sliders', 'Settings', is('platform', 'settings'))}
          </>
        )}
        {(r || pickList.length > 0) && (
          <>
            <h6>Restaurant</h6>
            <label class="rpick">
              <Logo r={r} size={26} />
              <select aria-label="Choose restaurant" value={cur} onChange={(e) => go(e.target.value + '-' + (route.area === 'owner' ? 'owner-' + route.view : ['staff', 'kitchen', 'guest', 'demo'].includes(route.area) ? route.area : 'demo'))}>
                {pickList.map((x) => <option value={x.id}>{x.name?.en || x.id}</option>)}
              </select>
              <Ic n="down" s={14} />
            </label>
            {can('demo') && link('#' + cur + '-demo', 'layout', LIVE ? 'Training view' : 'Live demo', is('demo'))}
            {can('owner') && link('#' + cur + '-owner-overview', 'chart', 'Owner back office', is('owner'))}
            {can('staff') && link('#' + cur + '-staff', 'tablet', 'Staff tablet', is('staff'))}
            {can('kitchen') && link('#' + cur + '-kitchen', 'monitor', 'Kitchen display', is('kitchen'))}
            {can('guest') && link('#' + cur + '-guest', 'mobile', 'Guest phone', is('guest'))}
          </>
        )}
      </nav>
      <div class="side-foot">
        <span class={'sync ' + (state.mode === 'live' ? (state.realtime === 'SUBSCRIBED' ? 'db' : '') : state.mode)}>
          <i />
          {state.mode === 'live' ? (state.realtime === 'SUBSCRIBED' ? 'Live' : 'Connecting…') : state.mode === 'local' ? 'Demo mode · this browser only' : 'Connecting…'}
        </span>
        {LIVE && a.user && !a.anon && (
          <div class="who">
            <small>{a.user.email}</small>
            <button type="button" class="link small" onClick={() => { state.auth.recovery = true; setOpen(false); subscribeKick(); }}>Change password</button>
            <button type="button" class="link small" onClick={() => signOut().then(() => go(''))}>Sign out</button>
          </div>
        )}
      </div>
    </aside>
  );
}

function GuestPreview({ rid, tid }) {
  const r = A.restaurant(rid);
  const [mode, setMode] = useState('table');
  if (!r) return null;
  const t = tid && r.tables.some((x) => x.id === tid) ? tid : r.tables[0]?.id;
  return (
    <div class="guest-prev">
      <div class="toolbar">
        <h1>Guest phone</h1>
        <span class="grow" />
        <div class="seg">
          <button type="button" class={mode === 'table' ? 'on' : ''} onClick={() => setMode('table')}>Table QR</button>
          <button type="button" class={mode === 'online' ? 'on' : ''} onClick={() => setMode('online')}>Takeaway / delivery</button>
        </div>
        {mode === 'table' && (
          <select class="input sm" aria-label="Table" value={t} onChange={(e) => go(rid + '-guest-' + e.target.value)}>
            {r.tables.map((x) => <option value={x.id}>Table {x.label}</option>)}
          </select>
        )}
      </div>
      <p class="muted small">
        {LIVE ? 'This is a real guest view: orders placed here reach the kitchen. Use it to train staff, then cancel the test order.' : 'Exactly what a guest sees after scanning. Open the staff tablet in another tab to watch orders arrive.'}
      </p>
      <PhoneFrame>{mode === 'table' ? <CustomerApp key={rid + t} rid={rid} tid={t} embedded /> : <OnlineApp key={rid + 'o'} rid={rid} embedded />}</PhoneFrame>
    </div>
  );
}

// After returning from bKash / SSLCommerz the URL carries ?result=success|failed
function usePaymentReturn() {
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const res = q.get('result');
    if (!res) return;
    setTimeout(() => toast(res === 'success' ? 'Payment received. Thank you!' : res === 'cancelled' ? 'Payment cancelled. You can try again or pay another way.' : 'The payment did not go through. You can try again or pay another way.', res === 'success' ? 'ok' : 'alert'), 400);
    history.replaceState(null, '', location.pathname + location.hash);
  }, []);
}

function App() {
  const [, setV] = useState(0);
  const route = useRoute();
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [guestErr, setGuestErr] = useState('');
  useEffect(() => {
    const un = subscribe(() => setV(state.version));
    setV(state.version);
    return un;
  }, []);
  usePaymentReturn();
  useEffect(() => window.scrollTo(0, 0), [route.area, route.view, route.rid]);

  const a = state.auth;
  const guestArea = route.area === 'customer' || route.area === 'online';
  const staffUser = LIVE && a.user && !a.anon;

  // live mode: load only what this screen needs, and keep it in sync
  useEffect(() => {
    if (!LIVE || !a.ready) return;
    if (guestArea) {
      ensureGuest()
        .then(() => connectScope({ kind: 'guest', rid: route.rid }))
        .catch((e) => setGuestErr(e.message));
      return;
    }
    if (!staffUser) return;
    if (route.area === 'platform' && a.admin) connectScope({ kind: 'admin' });
    else if (route.rid && (a.admin || a.members.some((m) => m.rid === route.rid))) connectScope({ kind: 'staff', rid: route.rid });
    else if (route.area === 'home' && a.admin) connectScope({ kind: 'admin' });
  }, [route.area, route.rid, a.ready, a.user && a.user.id, a.admin, a.members.length]);

  // home: send people where they work
  useEffect(() => {
    if (route.area !== 'home') return;
    if (!LIVE) return go('platform-home');
    if (!staffUser) return;
    if (a.admin) go('platform-home');
    else if (a.members[0]) location.hash = landingFor(a.members[0]);
  }, [route.area, staffUser, a.admin, a.members.length]);

  if (route.area === 'legal') return (<div class="legal-wrap"><LegalPage kind={route.view} /><Toasts /></div>);

  if (guestArea) {
    return (
      <div class="standalone-wrap">
        {guestErr ? <Empty icon="alert" title="Can't open the menu right now" body={guestErr} /> : route.area === 'customer' ? <CustomerApp rid={route.rid} tid={route.tid} /> : <OnlineApp rid={route.rid} />}
        {!LIVE && <a class="proto-exit" href={'#' + route.rid + '-demo'} title="Back to the dashboard (demo only)"><Ic n="back" s={14} /> Dashboard</a>}
        <Toasts />
      </div>
    );
  }

  if (LIVE) {
    if (!a.ready) return <div class="splash"><span class="spinner" />Loading…</div>;
    if (a.recovery) return <><SetPassword /><Toasts /></>;
    if (!staffUser) return <><Login /><Toasts /></>;
  }

  const loading = state.mode === 'loading' || (LIVE && !state.loaded && route.area !== 'home');
  const empty = !loading && A.restaurants().length === 0;
  const dark = ['staff', 'kitchen'].includes(route.area);
  const myRole = route.rid ? role(route.rid) : a.admin ? 'admin' : null;
  const allowed = !LIVE || (route.area === 'platform' ? a.admin : route.area === 'home' || (ALLOWED[myRole] || []).includes(route.area));

  let body;
  if (!allowed) body = <NoAccess />;
  else if (route.area === 'home') body = LIVE && !a.admin && !a.members.length ? <NoAccess msg="Your login works, but it is not linked to a restaurant yet. Ask the platform admin or the restaurant owner to add you." /> : <div class="splash"><span class="spinner" /></div>;
  else if (loading) body = <div class="splash"><span class="spinner" />{state.error || 'Loading…'}</div>;
  else if (empty && route.area === 'platform' && !['new', 'settings', 'plans'].includes(route.view)) body = <WelcomeEmpty />;
  else if (empty && !LIVE && route.area !== 'platform') body = <WelcomeEmpty />;
  else if (route.area === 'platform') body = <PlatformApp view={route.view} go={go} />;
  else if (route.area === 'owner') body = <OwnerApp rid={route.rid} view={route.view} go={go} />;
  else if (route.area === 'staff') body = <StaffApp rid={route.rid} />;
  else if (route.area === 'kitchen') body = <KitchenApp rid={route.rid} />;
  else if (route.area === 'guest') body = <GuestPreview rid={route.rid} tid={route.tid} />;
  else body = <DemoView key={route.rid} rid={route.rid} />;

  return (
    <div class={'shell' + (full ? ' full' : '') + (dark ? ' shell-dark' : '')}>
      <Sidebar route={route} open={open} setOpen={setOpen} />
      <div class="main">
        <div class="topbar">
          <button type="button" class="icon-btn" aria-label="Menu" onClick={() => setOpen(!open)}><Ic n="menu" s={20} /></button>
          <b>{A.platform().name}</b>
          <span class="grow" />
          {dark && (
            <button type="button" class="icon-btn" aria-label="Full screen" onClick={() => setFull(!full)}><Ic n="expand" s={18} /></button>
          )}
        </div>
        {dark && (
          <button type="button" class="full-toggle" onClick={() => setFull(!full)}>
            <Ic n="expand" s={14} /> {full ? 'Show menu' : 'Device mode'}
          </button>
        )}
        <main class={'content area-' + route.area}>{body}</main>
      </div>
      {open && <div class="scrim" onClick={() => setOpen(false)} />}
      <Toasts />
    </div>
  );
}

function seedLocal() {
  const now = Date.now();
  const entries = [];
  sampleRestaurants(now).forEach((r) => {
    entries.push(['restaurants', r]);
    const h = historyFor(r, 3, 7, now);
    h.sessions.forEach((d) => entries.push(['sessions', d]));
    h.orders.forEach((d) => entries.push(['orders', d]));
    sampleReviews(r, now).forEach((d) => entries.push(['reviews', d]));
  });
  entries.push(['platform', { ...PLATFORM_DEFAULT, id: 'settings' }]);
  bulkPut(entries);
}

render(<App />, document.getElementById('app'));
init(seedLocal);
