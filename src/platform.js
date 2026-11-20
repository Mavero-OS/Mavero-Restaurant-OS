// Platform (super-admin): every restaurant on the system, onboarding wizard, plans, settings
import { useState } from './hooks.js';
import { Ic, Btn, Modal, Seg, Field, Stat, HBars, QR, Logo, Empty, Toggle } from './ui.js';
import { toast, state, resetLocal } from './store.js';
import { tk, groupIN, slugify, rangeFor, ago, clock, uid } from './util.js';
import * as A from './actions.js';
import { TEMPLATES, newRestaurant, makeTables, DEFAULT_PAYMENTS } from './seed.js';
import { CITIES, ProfileFields, TaxFields, PaymentFields, GuestFields, OnlineFields, tableLink, onlineLink, baseUrl } from './owner.js';
import { floorModel } from './staff.js';
import { Plate } from './menu.js';
import { LIVE, PUBLIC_URL } from './backend.js';

const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const statusTone = (s) => (s === 'active' ? 'ok' : s === 'trial' ? 'warn' : 'alert');

export function PlatformApp({ view = 'home', go }) {
  return (
    <div class="platform">
      {view === 'home' && <Dashboard />}
      {view === 'restaurants' && <RestaurantsList />}
      {view === 'new' && <Wizard go={go} />}
      {view === 'plans' && <Plans />}
      {view === 'settings' && <PlatformSettings />}
    </div>
  );
}

function Dashboard() {
  const p = A.platform();
  const rs = A.restaurants();
  const today = rangeFor('today');
  const sales = A.salesIn(null, today);
  const week = A.salesIn(null, rangeFor('week'));
  const gmv = sales.reduce((a, s) => a + s.bill.total, 0);
  const plans = Object.fromEntries(p.plans.map((x) => [x.id, x]));
  const mrr = rs.filter((r) => r.status === 'active').reduce((a, r) => a + (plans[r.plan]?.price || 0), 0);
  const trials = rs.filter((r) => r.status === 'trial').length;
  const floors = Object.fromEntries(rs.map((r) => [r.id, floorModel(r)]));
  const busy = rs.reduce((a, r) => a + floors[r.id].filter((f) => f.s).length, 0);
  const tables = rs.reduce((a, r) => a + r.tables.length, 0);
  const ordersToday = A.ordersFor ? rs.reduce((a, r) => a + A.ordersFor(r.id).filter((o) => o.createdAt >= today[0] && o.status !== 'cancelled').length, 0) : 0;
  const recent = rs.flatMap((r) => A.ordersFor(r.id).map((o) => ({ o, r }))).sort((a, b) => b.o.createdAt - a.o.createdAt).slice(0, 8);
  return (
    <div class="stack">
      <div class="page-h">
        <div>
          <h1>{p.name} platform</h1>
          <p class="muted">{p.tagline}</p>
        </div>
        <span class="grow" />
        <a class="btn btn-primary" href="#platform-new"><Ic n="plus" s={16} /><span>Add a restaurant</span></a>
      </div>
      <div class="stats">
        <Stat label="Restaurants" value={rs.length} sub={`${rs.filter((r) => r.status === 'active').length} live · ${trials} on trial`} />
        <Stat label="Tables in use" value={`${busy} / ${tables}`} sub="across all restaurants" />
        <Stat label="Orders today" value={ordersToday} />
        <Stat label="Guest spend today" value={tk(gmv)} sub="paid bills, all restaurants" />
        <Stat label="Monthly subscription revenue" value={tk(mrr)} sub={trials ? `+${tk(rs.filter((r) => r.status === 'trial').reduce((a, r) => a + (plans[r.plan]?.price || 0), 0))} if trials convert` : 'from live restaurants'} />
      </div>
      <div class="cards two">
        <div class="card span2">
          <div class="card-h"><h3>Restaurants</h3><span class="grow" /><a class="link small" href="#platform-restaurants">Manage all <Ic n="right" s={12} /></a></div>
          <RestTable rs={rs} floors={floors} compact />
        </div>
        <div class="card">
          <h3>Guest spend, last 7 days</h3>
          <p class="muted small">Paid bills and completed online orders, ৳</p>
          <HBars data={rs.map((r) => ({ l: r.name.en, v: week.filter((s) => s.rid === r.id).reduce((a, s) => a + s.bill.total, 0) }))} empty="No paid bills in the last 7 days" />
        </div>
        <div class="card span2">
          <h3>Live activity</h3>
          <ul class="feed">
            {recent.map(({ o, r }) => (
              <li>
                <Logo r={r} size={22} />
                <span>
                  <b>{r.name.en}</b> · {o.channel === 'dine' ? 'Table ' + (r.tables.find((x) => x.id === o.tableId)?.label || '') : o.channel} · {plural(o.items.reduce((a, l) => a + l.qty, 0), 'item')}
                  <small class="muted"> {o.status === 'kitchen' ? 'cooking' : o.status}</small>
                </span>
                <small class="mono muted">{ago(o.createdAt)}</small>
              </li>
            ))}
            {!recent.length && <li class="muted small">No orders yet.</li>}
          </ul>
        </div>
        <div class="card">
          <h3>Subscriptions</h3>
          <table class="tbl">
            <thead><tr><th>Plan</th><th class="num">Live</th><th class="num">Trial</th><th class="num">Monthly</th></tr></thead>
            <tbody>
              {p.plans.map((x) => {
                const on = rs.filter((r) => r.plan === x.id);
                const live = on.filter((r) => r.status === 'active').length;
                return <tr><td>{x.name}</td><td class="num">{live}</td><td class="num">{on.filter((r) => r.status === 'trial').length}</td><td class="num">{tk(live * x.price)}</td></tr>;
              })}
            </tbody>
          </table>
          {rs.filter((r) => r.status === 'trial').map((r) => (
            <p class="small"><span class="pill tone-warn">Trial</span> {r.name.en} · {Math.max(0, Math.ceil((r.trialEnds - Date.now()) / 864e5))} days left</p>
          ))}
          <a class="link small" href="#platform-plans">Edit plans <Ic n="right" s={12} /></a>
        </div>
      </div>
    </div>
  );
}

function RestTable({ rs, floors, compact }) {
  const p = A.platform();
  const today = rangeFor('today');
  const [del, setDel] = useState(null);
  return (
    <div class="tbl-wrap">
      <table class="tbl">
        <thead>
          <tr><th>Restaurant</th><th>Location</th><th>Plan</th><th>Status</th><th class="num">Tables busy</th><th class="num">Today</th><th>Open</th>{!compact && <th />}</tr>
        </thead>
        <tbody>
          {rs.map((r) => {
            const busy = (floors[r.id] || floorModel(r)).filter((f) => f.s).length;
            const sales = A.salesIn(r.id, today).reduce((a, s) => a + s.bill.total, 0);
            return (
              <tr>
                <td><span class="rcell"><Logo r={r} size={28} /><span><b>{r.name.en}</b><small>{r.name.bn}</small></span></span></td>
                <td>{r.area}, {r.city}</td>
                <td>
                  {compact ? (p.plans.find((x) => x.id === r.plan)?.name || r.plan) : (
                    <select class="input sm" aria-label={'Plan for ' + r.name.en} value={r.plan} onChange={(e) => A.patchRestaurant(r.id, { plan: e.target.value })}>
                      {p.plans.map((x) => <option value={x.id}>{x.name} · {tk(x.price)}/mo</option>)}
                    </select>
                  )}
                </td>
                <td>
                  {compact ? <span class={'pill tone-' + statusTone(r.status)}>{r.status}{r.status === 'trial' && r.trialEnds ? ' · ' + Math.max(0, Math.ceil((r.trialEnds - Date.now()) / 864e5)) + 'd left' : ''}</span> : (
                    <select class="input sm" aria-label={'Status of ' + r.name.en} value={r.status} onChange={(e) => A.patchRestaurant(r.id, { status: e.target.value })}>
                      <option value="active">Active</option><option value="trial">Trial</option><option value="suspended">Suspended</option>
                    </select>
                  )}
                </td>
                <td class="num">{busy} / {r.tables.length}</td>
                <td class="num">{tk(sales)}</td>
                <td>
                  <span class="links">
                    <a href={'#' + r.id + '-demo'} title="Live demo"><Ic n="layout" s={16} /></a>
                    <a href={'#' + r.id + '-owner-overview'} title="Owner back office"><Ic n="chart" s={16} /></a>
                    <a href={'#' + r.id + '-staff'} title="Staff tablet"><Ic n="tablet" s={16} /></a>
                    <a href={'#' + r.id + '-kitchen'} title="Kitchen display"><Ic n="monitor" s={16} /></a>
                  </span>
                </td>
                {!compact && <td class="num"><Btn kind="icon" icon="trash" aria-label={'Remove ' + r.name.en} onClick={() => setDel(r)} /></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {del && (
        <Modal open title={`Remove ${del.name.en}?`} onClose={() => setDel(null)} foot={
          <>
            <Btn kind="ghost" onClick={() => setDel(null)}>Keep it</Btn>
            <Btn kind="danger" icon="trash" onClick={() => (A.deleteRestaurant(del.id), setDel(null), toast('Restaurant removed', 'ok'))}>Remove restaurant</Btn>
          </>
        }>
          <p>Its QR codes will stop working and it disappears from every dashboard. Past orders stay in the database.</p>
        </Modal>
      )}
    </div>
  );
}

function RestaurantsList() {
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const rs = A.restaurants().filter((r) => (!q || (r.name.en + r.name.bn + r.area).toLowerCase().includes(q.toLowerCase())) && (!city || r.city === city));
  const cities = [...new Set(A.restaurants().map((r) => r.city))];
  return (
    <div class="stack">
      <div class="page-h">
        <div><h1>Restaurants</h1><p class="muted">Change plans, pause access or open any restaurant's screens.</p></div>
        <span class="grow" />
        <a class="btn btn-primary" href="#platform-new"><Ic n="plus" s={16} /><span>Add a restaurant</span></a>
      </div>
      <div class="card">
        <div class="toolbar">
          <label class="search light"><Ic n="search" s={16} /><input id="rest-search" type="search" placeholder="Search by name or area" value={q} onInput={(e) => setQ(e.target.value)} /></label>
          <select class="input sm" aria-label="Filter by city" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">All cities</option>
            {cities.map((c) => <option>{c}</option>)}
          </select>
        </div>
        <RestTable rs={rs} floors={{}} />
      </div>
    </div>
  );
}

// ---------- Onboarding wizard ----------
const STEPS = ['Basics', 'Menu', 'Tables', 'Tax & payments', 'Guest experience', 'Team', 'Launch'];
const SWATCHES = ['#8A1C2B', '#0F5C4A', '#C2410C', '#1D4ED8', '#6D28D9', '#0E7490', '#B45309', '#1F2937'];

const draft0 = () => ({
  name: { en: '', bn: '' }, tagline: { en: '', bn: '' }, city: 'Dhaka', area: '', address: '', phone: '', bin: '',
  brand: '#0F5C4A', logoText: '', plan: 'growth', template: 'deshi',
  sections: [{ id: 'main', name: 'Main hall', prefix: 'T', count: 8, seats: 4 }],
  tax: { vat: 5, sc: 0, inclusive: false }, payments: DEFAULT_PAYMENTS(),
  wifi: { ssid: '', password: '' }, features: { autoKitchen: false, games: true, tableOrdering: true, takeaway: true, delivery: false },
  online: { packaging: 20, minOrder: 300, cod: true, zones: [] }, prepTarget: 15,
  staff: [{ id: 's1', name: '', role: 'waiter', section: '' }],
  ownerName: '', ownerEmail: '', ownerPassword: '',
});

function Wizard({ go }) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState(draft0);
  const [made, setMade] = useState(null);
  const set = (p) => setD({ ...d, ...p });
  const p = A.platform();
  const plan = p.plans.find((x) => x.id === d.plan);
  const tableCount = d.sections.reduce((a, s) => a + (+s.count || 0), 0);
  const problems = [
    !d.name.en.trim() && [0, 'Add the restaurant name'],
    !d.area.trim() && [0, 'Add the area'],
    tableCount < 1 && [2, 'Add at least one table'],
    plan && tableCount > plan.tables && [2, `The ${plan.name} plan allows up to ${plan.tables} tables`],
    !Object.values(d.payments).some((x) => x && x.on) && [3, 'Turn on at least one payment method'],
    LIVE && (!/^\S+@\S+\.\S+$/.test(d.ownerEmail.trim()) || d.ownerPassword.length < 8) && [5, "Add the owner's login email and a password of at least 8 characters"],
  ].filter(Boolean);
  const [busy, setBusy] = useState(false);
  const stepOk = (i) => !problems.some(([s]) => s === i);

  const launch = async () => {
    let id = slugify(d.name.en);
    while (A.restaurant(id)) id = id.slice(0, 14) + Math.floor(Math.random() * 90 + 10);
    const r = newRestaurant({
      ...d, id, name: { en: d.name.en.trim(), bn: d.name.bn.trim() || d.name.en.trim() }, logoText: (d.logoText || d.name.en.trim()[0] || 'R').toUpperCase(),
      status: 'trial', staff: d.staff.filter((s) => s.name.trim()).map((s, k) => ({ ...s, id: 's' + (k + 1), name: s.name.trim() })),
      sections: d.sections.map((s, k) => ({ ...s, id: s.id || 'sec' + k, count: +s.count || 0, seats: +s.seats || 4, prefix: (s.prefix || 'T').replace(/[^A-Za-z]/g, '').slice(0, 2) || 'T' })),
      online: { ...d.online, zones: (d.online.zones || []).filter((z) => z.name.trim()) },
    });
    const rest = r;
    const { ownerName, ownerEmail, ownerPassword } = d;
    setBusy(true);
    try {
      await A.saveRestaurant(rest);
      let login = null;
      if (LIVE) {
        await A.team({ action: 'create', rid: id, role: 'owner', name: ownerName.trim() || 'Owner', email: ownerEmail.trim(), password: ownerPassword });
        login = { email: ownerEmail.trim(), password: ownerPassword };
      }
      setMade({ ...rest, login });
      toast(`${rest.name.en} is live on a 14-day trial`, 'ok');
    } catch (e) {
      toast(e.message, 'alert');
    }
    setBusy(false);
  };

  if (made) return <Launched r={made} onAnother={() => (setMade(null), setD(draft0()), setStep(0))} />;

  const tpl = TEMPLATES[d.template];
  return (
    <div class="wizard">
      <div class="page-h">
        <div><h1>Add a restaurant</h1><p class="muted">About five minutes. Everything can be changed later from the restaurant's settings.</p></div>
      </div>
      <ol class="steps">
        {STEPS.map((s, i) => (
          <li class={(i === step ? 'now ' : '') + (i < step ? 'past ' : '') + (!stepOk(i) && i < step ? 'bad' : '')}>
            <button type="button" onClick={() => setStep(i)}><span class="mono">{i + 1}</span>{s}</button>
          </li>
        ))}
      </ol>
      <div class="wiz-body">
        <div class="card wiz-main">
          {step === 0 && (
            <div class="stack">
              <h3>The basics</h3>
              <ProfileFields d={d} set={set} />
              <Field label="Brand colour presets" id="w-sw">
                <div class="swatches">
                  {SWATCHES.map((c) => <button type="button" class={'sw' + (d.brand === c ? ' on' : '')} style={{ background: c }} aria-label={'Use colour ' + c} onClick={() => set({ brand: c })} />)}
                </div>
              </Field>
              <Field label="Plan" id="w-plan">
                <div class="plan-pick">
                  {p.plans.map((x) => (
                    <button type="button" class={'pp' + (d.plan === x.id ? ' on' : '')} onClick={() => set({ plan: x.id })}>
                      <b>{x.name}</b>
                      <span>{tk(x.price)}/month</span>
                      <small>{x.tables >= 999 ? 'Unlimited tables' : 'Up to ' + x.tables + ' tables'}</small>
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          )}
          {step === 1 && (
            <div class="stack">
              <h3>Starting menu</h3>
              <p class="muted">Pick the closest kind of restaurant. Dishes, prices, Bangla names and kitchen stations come pre-filled, and the owner edits them later.</p>
              <div class="tpl-grid">
                {Object.entries(TEMPLATES).map(([k, v]) => (
                  <button type="button" class={'tpl' + (d.template === k ? ' on' : '')} onClick={() => set({ template: k })}>
                    <span class="tpl-icons">{v.items.slice(0, 4).map((i) => i.icon).join(' ') || '＋'}</span>
                    <b>{v.label}</b>
                    <small>{v.items.length ? `${v.items.length} dishes · ${v.stations.map((s) => s.name.en).join(', ')}` : 'Add your own dishes'}</small>
                  </button>
                ))}
              </div>
              {tpl.items.length > 0 && (
                <div class="tpl-preview">
                  {tpl.items.slice(0, 8).map((i) => (
                    <div class="tp-row"><Plate item={i} size={30} /><span>{i.name.en}<small>{i.name.bn}</small></span><b class="mono">{tk(i.price)}</b></div>
                  ))}
                </div>
              )}
            </div>
          )}
          {step === 2 && (
            <div class="stack">
              <h3>Tables</h3>
              <p class="muted">Each table gets its own QR code. Group them by floor or area so waiters can be assigned.</p>
              {d.sections.map((s, k) => (
                <div class="sec-row">
                  <Field label="Area name" id={'ws-n' + k}><input id={'ws-n' + k} class="input" value={s.name} onInput={(e) => set({ sections: d.sections.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })} /></Field>
                  <Field label="Label prefix" id={'ws-p' + k}><input id={'ws-p' + k} class="input" maxLength={2} value={s.prefix} onInput={(e) => set({ sections: d.sections.map((x, j) => (j === k ? { ...x, prefix: e.target.value.toUpperCase() } : x)) })} /></Field>
                  <Field label="Tables" id={'ws-c' + k}><input id={'ws-c' + k} class="input" type="number" min="1" max="60" value={s.count} onInput={(e) => set({ sections: d.sections.map((x, j) => (j === k ? { ...x, count: +e.target.value } : x)) })} /></Field>
                  <Field label="Seats each" id={'ws-s' + k}><input id={'ws-s' + k} class="input" type="number" min="1" max="20" value={s.seats} onInput={(e) => set({ sections: d.sections.map((x, j) => (j === k ? { ...x, seats: +e.target.value } : x)) })} /></Field>
                  <Btn kind="icon" icon="trash" aria-label="Remove area" disabled={d.sections.length < 2} onClick={() => set({ sections: d.sections.filter((_, j) => j !== k) })} />
                </div>
              ))}
              <Btn kind="ghost" size="sm" icon="plus" onClick={() => set({ sections: [...d.sections, { id: 'sec' + uid(), name: 'Rooftop', prefix: 'R', count: 4, seats: 4 }] })}>Add another area</Btn>
              <div class="label-preview">
                {makeTables(d.sections.map((s) => ({ ...s, count: Math.min(60, +s.count || 0), start: 0 }))).map((t) => <span class="chip sm">{t.label}</span>)}
              </div>
              <p class={'small ' + (plan && tableCount > plan.tables ? 'err' : 'muted')}>{tableCount} tables · {plan?.name} plan allows {plan?.tables >= 999 ? 'unlimited' : plan?.tables}</p>
            </div>
          )}
          {step === 3 && (
            <div class="stack">
              <h3>VAT, service charge and payments</h3>
              <TaxFields d={d} set={set} />
              <Field label="VAT registration (BIN)" id="w-bin" hint="Printed on receipts"><input id="w-bin" class="input" value={d.bin} onInput={(e) => set({ bin: e.target.value })} /></Field>
              <PaymentFields d={d} pm={(k, v) => set({ payments: { ...d.payments, [k]: { ...d.payments[k], ...v } } })} />
            </div>
          )}
          {step === 4 && (
            <div class="stack">
              <h3>Guest experience</h3>
              <GuestFields d={d} set={set} />
              <h3>Takeaway & delivery</h3>
              <OnlineFields d={d} set={set} />
              {d.features.delivery && !(d.online.zones || []).length && (
                <Btn kind="ghost" size="sm" icon="pin" onClick={() => set({ online: { ...d.online, zones: [{ id: 'z1', name: d.area || 'Nearby', fee: 40, eta: 30 }, { id: 'z2', name: 'Up to 3 km', fee: 60, eta: 40 }, { id: 'z3', name: 'Up to 5 km', fee: 80, eta: 50 }] } })}>Suggest areas around {d.area || 'the restaurant'}</Btn>
              )}
            </div>
          )}
          {step === 5 && (
            <div class="stack">
              {LIVE && (
                <div class="card inset">
                  <h4>Owner login</h4>
                  <p class="muted small">The owner signs in with this to manage the menu, see sales and add staff logins. Share the password in person.</p>
                  <div class="form-2">
                    <Field label="Owner name" id="w-on"><input id="w-on" class="input" value={d.ownerName} onInput={(e) => set({ ownerName: e.target.value })} /></Field>
                    <Field label="Owner email" id="w-oe"><input id="w-oe" class="input" type="email" value={d.ownerEmail} onInput={(e) => set({ ownerEmail: e.target.value })} /></Field>
                    <Field label="Temporary password" id="w-op" hint="At least 8 characters"><input id="w-op" class="input" value={d.ownerPassword} onInput={(e) => set({ ownerPassword: e.target.value })} /></Field>
                  </div>
                </div>
              )}
              <h3>Team</h3>
              <p class="muted">Waiters pick their name on the staff tablet so guests see who is coming.</p>
              {d.staff.map((s, k) => (
                <div class="row-gap">
                  <input class="input" aria-label="Staff name" placeholder="Name" value={s.name} onInput={(e) => set({ staff: d.staff.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })} />
                  <select class="input" aria-label="Role" value={s.role} onChange={(e) => set({ staff: d.staff.map((x, j) => (j === k ? { ...x, role: e.target.value } : x)) })}>
                    <option value="waiter">Waiter</option><option value="kitchen">Kitchen</option><option value="cashier">Cashier</option><option value="manager">Manager</option><option value="rider">Delivery rider</option>
                  </select>
                  <Btn kind="icon" icon="trash" aria-label="Remove" onClick={() => set({ staff: d.staff.filter((_, j) => j !== k) })} />
                </div>
              ))}
              <Btn kind="ghost" size="sm" icon="plus" onClick={() => set({ staff: [...d.staff, { id: '', name: '', role: 'waiter', section: '' }] })}>Add person</Btn>
            </div>
          )}
          {step === 6 && (
            <div class="stack">
              <h3>Ready to launch</h3>
              {problems.length > 0 ? (
                <ul class="problems">
                  {problems.map(([s, msg]) => <li><Ic n="alert" s={16} /> {msg} <button type="button" class="link" onClick={() => setStep(s)}>Fix in {STEPS[s]}</button></li>)}
                </ul>
              ) : <p class="notice ok">Everything is set. Launching creates the menu, {tableCount} table QR codes, the staff tablet and the kitchen display.</p>}
              <dl class="summary">
                <dt>Restaurant</dt><dd>{d.name.en || '—'} {d.name.bn && `· ${d.name.bn}`}</dd>
                <dt>Location</dt><dd>{[d.area, d.city].filter(Boolean).join(', ')}</dd>
                <dt>Plan</dt><dd>{plan?.name} · {tk(plan?.price || 0)}/month after a 14-day trial</dd>
                <dt>Menu</dt><dd>{tpl.label} · {tpl.items.length} dishes</dd>
                <dt>Tables</dt><dd>{tableCount} in {d.sections.length} area{d.sections.length > 1 ? 's' : ''}</dd>
                <dt>VAT</dt><dd>{d.tax.vat}% {d.tax.inclusive ? 'included' : 'added'}{d.tax.sc ? ` · ${d.tax.sc}% service` : ''}</dd>
                <dt>Payments</dt><dd>{Object.entries(d.payments).filter(([, v]) => v.on).map(([k]) => ({ bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', card: 'Card', banglaqr: 'Bangla QR', bank: 'Bank', cash: 'Cash' })[k]).join(', ')}</dd>
                <dt>Online</dt><dd>{[d.features.takeaway && 'Takeaway', d.features.delivery && 'Delivery'].filter(Boolean).join(' + ') || 'Off'}</dd>
              </dl>
            </div>
          )}
          <div class="wiz-foot">
            <Btn kind="ghost" disabled={step === 0} icon="left" onClick={() => setStep(step - 1)}>Back</Btn>
            <span class="grow" />
            {step < STEPS.length - 1 ? (
              <Btn kind="primary" onClick={() => setStep(step + 1)}>Next: {STEPS[step + 1]}</Btn>
            ) : (
              <Btn kind="primary" icon="zap" disabled={problems.length > 0 || busy} onClick={launch}>{busy ? 'Launching…' : 'Launch restaurant'}</Btn>
            )}
          </div>
        </div>
        <aside class="wiz-preview">
          <small class="opt-l">Guest phone preview</small>
          <div class="phone mini" style={{ '--brand': d.brand }}>
            <div class="phone-notch" />
            <div class="phone-screen">
              <div class="cust embedded welcome">
                <div class="w-hero">
                  <span class="rlogo" style={{ background: d.brand, width: '54px', height: '54px', fontSize: '26px' }}>{(d.logoText || d.name.en[0] || 'R').toUpperCase()}</span>
                  <small>Welcome to</small>
                  <h1>{d.name.en || 'Your restaurant'}</h1>
                  {d.tagline.en && <p>{d.tagline.en}</p>}
                  <span class="w-table">Table {(d.sections[0]?.prefix || 'T') + '1'} · {d.sections[0]?.seats || 4} seats</span>
                </div>
                <div class="mini-menu">
                  {tpl.items.slice(0, 4).map((i) => (
                    <div class="dish compact"><Plate item={i} size={34} /><span class="dish-main"><span class="dish-name">{i.name.en}</span><span class="dish-meta"><b>{tk(i.price)}</b></span></span></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Launched({ r, onAnother }) {
  return (
    <div class="stack launched">
      <div class="card hero-ok">
        <Logo r={r} size={56} />
        <div>
          <h1>{r.name.en} is live</h1>
          <p class="muted">14-day trial started. Print the table QR codes and open the staff tablet and kitchen display on the restaurant's devices.</p>
        </div>
      </div>
      {r.login && (
        <div class="card login-box">
          <h3>Owner login</h3>
          <p>Website: <code class="mono">{(A.platform().baseUrl || PUBLIC_URL || location.href.split('#')[0])}</code></p>
          <p>Email: <b class="mono">{r.login.email}</b> · Temporary password: <b class="mono">{r.login.password}</b></p>
          <p class="muted small">Write these down now; the password is not shown again. The owner can add staff and kitchen logins from Staff.</p>
        </div>
      )}
      <div class="cards three">
        <a class="card device" href={'#' + r.id + '-demo'}><Ic n="layout" s={26} /><b>Try it end to end</b><span class="muted small">Guest phone, staff tablet and kitchen side by side.</span></a>
        <a class="card device" href={'#' + r.id + '-owner-menu'}><Ic n="cutlery" s={26} /><b>Edit the menu</b><span class="muted small">{r.items.length} dishes pre-filled. Change prices and photos.</span></a>
        <a class="card device" href={'#' + r.id + '-owner-tables'}><Ic n="print" s={26} /><b>Print QR codes</b><span class="muted small">One for each of the {r.tables.length} tables.</span></a>
      </div>
      <div class="card">
        <h3>Table QR codes</h3>
        <div class="qr-grid">
          {r.tables.slice(0, 6).map((t) => (
            <div class="tent">
              <div class="tent-top" style={{ background: r.brand }}><b>{r.name.en}</b><small>Scan to order & pay</small></div>
              <QR text={tableLink(r.id, t.id)} size={110} label={'QR for ' + t.label} />
              <b class="tent-t">Table {t.label}</b>
            </div>
          ))}
        </div>
      </div>
      <div class="row-gap">
        <Btn kind="ghost" icon="plus" onClick={onAnother}>Add another restaurant</Btn>
        <a class="btn btn-ghost" href="#platform"><Ic n="home" s={16} /><span>Back to dashboard</span></a>
      </div>
    </div>
  );
}

// ---------- Plans ----------
function Plans() {
  const p = A.platform();
  const [plans, setPlans] = useState(p.plans.map((x) => ({ ...x, features: [...x.features] })));
  const rs = A.restaurants();
  const dirty = JSON.stringify(plans) !== JSON.stringify(p.plans);
  return (
    <div class="stack">
      <div class="page-h">
        <div><h1>Subscription plans</h1><p class="muted">What restaurants pay each month. Prices in Taka.</p></div>
        <span class="grow" />
        <Btn kind="primary" disabled={!dirty} onClick={() => (A.savePlatform({ plans }), toast('Plans saved', 'ok'))}>Save plans</Btn>
      </div>
      <div class="cards three">
        {plans.map((x, k) => {
          const subs = rs.filter((r) => r.plan === x.id);
          const upd = (pp) => setPlans(plans.map((y, j) => (j === k ? { ...y, ...pp } : y)));
          return (
            <div class="card plan">
              <input class="input plan-name" aria-label="Plan name" value={x.name} onInput={(e) => upd({ name: e.target.value })} />
              <div class="row-gap"><span class="mono">৳</span><input class="input" type="number" aria-label="Monthly price" value={x.price} onInput={(e) => upd({ price: +e.target.value })} /><span class="muted small">/month</span></div>
              <div class="row-gap"><span class="muted small">Table limit</span><input class="input sm" type="number" aria-label="Table limit" value={x.tables} onInput={(e) => upd({ tables: +e.target.value })} /></div>
              <textarea class="input" rows="5" aria-label="Plan features, one per line" value={x.features.join('\n')} onInput={(e) => upd({ features: e.target.value.split('\n') })} />
              <p class="muted small">{subs.length} restaurant{subs.length === 1 ? '' : 's'} · {tk(subs.filter((r) => r.status === 'active').length * x.price)}/month live</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Settings ----------
function PlatformSettings() {
  const p = A.platform();
  const [d, setD] = useState({ name: p.name, tagline: p.tagline, baseUrl: p.baseUrl || PUBLIC_URL || '', support: p.support, supportEmail: p.supportEmail || '' });
  const [busy, setBusy] = useState('');
  return (
    <div class="stack">
      <div class="page-h"><div><h1>Platform settings</h1><p class="muted">Your brand as the software provider.</p></div></div>
      <div class="card">
        <div class="form-2">
          <Field label="Platform name" id="ps-name"><input id="ps-name" class="input" value={d.name} onInput={(e) => setD({ ...d, name: e.target.value })} /></Field>
          <Field label="Tagline" id="ps-tag"><input id="ps-tag" class="input" value={d.tagline} onInput={(e) => setD({ ...d, tagline: e.target.value })} /></Field>
          <Field label="Guest link address" id="ps-url" wide hint={`QR codes point here, followed by #restaurant-table-t1. Now: ${baseUrl()}. Print QR codes only after this is your final web address.`}>
            <input id="ps-url" class="input" placeholder="https://order.yourbrand.com.bd/" value={d.baseUrl} onInput={(e) => setD({ ...d, baseUrl: e.target.value })} />
          </Field>
          <Field label="Support hotline" id="ps-sup"><input id="ps-sup" class="input" value={d.support} onInput={(e) => setD({ ...d, support: e.target.value })} /></Field>
          <Field label="Support email" id="ps-mail" hint="Shown in the guest Privacy Policy and Terms"><input id="ps-mail" class="input" type="email" value={d.supportEmail} onInput={(e) => setD({ ...d, supportEmail: e.target.value })} /></Field>
        </div>
        <Btn kind="primary" onClick={() => (A.savePlatform(d), toast('Platform settings saved', 'ok'))}>Save</Btn>
      </div>
      <div class="card">
        <h3>Data</h3>
        <p class="muted small">Storage: {state.mode === 'live' ? 'Supabase live database (all devices see the same orders)' : 'demo mode, this browser only'}.</p>
        <div class="row-gap">
          <Btn kind="ghost" size="sm" icon="trash" disabled={!!busy} onClick={async () => { setBusy('Cleaning…'); const n = await A.purgeOld(14); setBusy(''); toast(`Removed ${n} old records`, 'ok'); }}>{busy || (LIVE ? 'Delete demo-restaurant records older than 14 days' : 'Delete records older than 14 days')}</Btn>
          {!A.restaurant('kacchighor') && <Btn kind="ghost" size="sm" icon="download" onClick={async () => { setBusy('Loading…'); await A.loadSampleData(); setBusy(''); toast('Sample restaurants loaded', 'ok'); }}>{LIVE ? 'Load demo restaurants (for sales demos and training)' : 'Load sample restaurants'}</Btn>}
          {state.mode === 'local' && <Btn kind="ghost" size="sm" icon="refresh" onClick={() => { resetLocal(); location.reload(); }}>Reset this browser's demo</Btn>}
        </div>
      </div>
    </div>
  );
}

export function WelcomeEmpty() {
  const [busy, setBusy] = useState('');
  const p = A.platform();
  return (
    <div class="welcome-empty">
      <h1>{p.name}</h1>
      <p class="muted">{p.tagline}</p>
      <p>{LIVE ? 'No restaurants yet. Add your first restaurant, or load three demo restaurants to use in sales demos and staff training.' : 'No restaurants yet. Load three sample Bangladeshi restaurants to explore every screen, or add your first real one.'}</p>
      <div class="row-gap center">
        <Btn kind="primary" size="lg" icon="download" disabled={!!busy} onClick={async () => { setBusy('Loading…'); await A.loadSampleData((i, n) => setBusy(`Loading ${i}/${n}…`)); setBusy(''); location.hash = 'kacchighor-demo'; }}>{busy || (LIVE ? 'Load demo restaurants' : 'Load sample restaurants')}</Btn>
        <a class="btn btn-ghost btn-lg" href="#platform-new"><Ic n="plus" s={18} /><span>Add a restaurant</span></a>
      </div>
    </div>
  );
}
