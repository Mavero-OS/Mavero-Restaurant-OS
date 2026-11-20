// Restaurant owner / manager back office
import { useState, useEffect } from './hooks.js';
import { Ic, Btn, Modal, Toggle, Seg, Field, Stat, Columns, HBars, QR, qrSvgString, saveFile, copyText, Empty, Logo, Avatar } from './ui.js';
import { toast, state } from './store.js';
import { L, tk, groupIN, clock, dateStr, rangeFor, dayStart, PAY_METHODS, ALLERGENS, TAGS, TABLE_STATES, csvEscape, uid, ago } from './util.js';
import * as A from './actions.js';
import { Plate } from './menu.js';
import { floorModel } from './staff.js';
import { METHOD_ORDER } from './pay.js';
import { LIVE, PUBLIC_URL } from './backend.js';
import { TeamLogins, GatewaySettings } from './live.js';

export const CITIES = ['Dhaka', 'Chattogram', 'Sylhet', 'Khulna', 'Rajshahi', 'Barishal', 'Rangpur', 'Mymensingh', 'Cumilla', "Cox's Bazar", 'Gazipur', 'Narayanganj', 'Bogura'];
export const ICONS = ['🍛', '🍗', '🍲', '🥘', '🐟', '🍤', '🥩', '🍢', '🥙', '🌯', '🍔', '🍟', '🍕', '🍝', '🍜', '🥣', '🍚', '🥗', '🥚', '🫓', '🥟', '🥞', '🍆', '🫕', '🍮', '🍯', '🍫', '🍰', '🍨', '🥛', '🥤', '🧋', '☕', '🍵', '🍋', '🥭', '💧', '🌶️', '🥦', '🍽️'];

export const baseUrl = () => {
  const p = A.platform();
  if (p.baseUrl) return p.baseUrl.replace(/#.*$/, '');
  if (PUBLIC_URL) return PUBLIC_URL.replace(/#.*$/, '');
  try {
    return location.href.split('#')[0];
  } catch (e) {
    return '';
  }
};
export const tableLink = (rid, tid) => baseUrl() + '#' + rid + '-table-' + tid;
export const onlineLink = (rid) => baseUrl() + '#' + rid + '-order';

const VIEWS = [
  ['overview', 'Overview', 'chart'],
  ['menu', 'Menu', 'cutlery'],
  ['tables', 'Tables & QR', 'qr'],
  ['staff', 'Staff', 'users'],
  ['orders', 'Orders', 'receipt'],
  ['reports', 'Sales & VAT', 'layers'],
  ['reviews', 'Reviews', 'star'],
  ['settings', 'Settings', 'sliders'],
];

export function OwnerApp({ rid, view = 'overview', go }) {
  const r = A.restaurant(rid);
  if (!r) return <Empty icon="store" title="Restaurant not found" body="Pick another restaurant from the list." />;
  return (
    <div class="owner">
      <div class="page-h">
        <Logo r={r} size={44} />
        <div>
          <h1>{r.name.en}</h1>
          <p class="muted">{r.name.bn} · {r.area}, {r.city} · <span class={'pill tone-' + (r.status === 'active' ? 'ok' : r.status === 'trial' ? 'warn' : 'alert')}>{r.status}</span></p>
        </div>
      </div>
      <nav class="subnav" aria-label="Restaurant sections">
        {VIEWS.map(([k, l, ic]) => (
          <a href={'#' + rid + '-owner-' + k} class={view === k ? 'on' : ''} aria-current={view === k ? 'page' : undefined}>
            <Ic n={ic} s={15} /> {l}
          </a>
        ))}
      </nav>
      {view === 'overview' && <Overview r={r} />}
      {view === 'menu' && <MenuManager r={r} />}
      {view === 'tables' && <TablesQR r={r} />}
      {view === 'staff' && <StaffMgr r={r} />}
      {view === 'orders' && <OrdersView r={r} />}
      {view === 'reports' && <Reports r={r} />}
      {view === 'reviews' && <Reviews r={r} />}
      {view === 'settings' && <Settings r={r} />}
    </div>
  );
}

// ---------- Overview ----------
export function hourBuckets(sales, range, key) {
  if (key === 'week') {
    const days = [];
    for (let d = 6; d >= 0; d--) {
      const t0 = dayStart() - d * 864e5;
      const v = sales.filter((s) => s.t >= t0 && s.t < t0 + 864e5).reduce((a, s) => a + s.bill.total, 0);
      const dd = new Date(t0);
      days.push({ l: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dd.getDay()] + ' ' + dd.getDate(), v });
    }
    return days;
  }
  const out = [];
  const first = sales.length ? Math.min(...sales.map((s) => new Date(s.t).getHours())) : 10;
  for (let h = Math.min(10, first); h <= 23; h++) {
    const t0 = range[0] + h * 3600e3;
    const ss = sales.filter((s) => s.t >= t0 && s.t < t0 + 3600e3);
    out.push({ l: (h % 12 || 12) + (h < 12 ? 'am' : 'pm'), v: ss.reduce((a, s) => a + s.bill.total, 0), sub: ss.length + ' orders' });
  }
  return out;
}

export function methodSplit(sales) {
  const m = {};
  sales.forEach((s) => Object.entries(s.paidBy || {}).forEach(([k, v]) => (m[k] = (m[k] || 0) + v)));
  const tot = Object.values(m).reduce((a, b) => a + b, 0) || 1;
  return METHOD_ORDER.filter((k) => m[k]).map((k) => ({ l: PAY_METHODS[k].label, v: m[k], pct: Math.round((m[k] / tot) * 100) })).sort((a, b) => b.v - a.v);
}

function Overview({ r }) {
  const [rk, setRk] = useState(() => (A.salesIn(r.id, rangeFor('today')).length ? 'today' : 'week'));
  const [busy, setBusy] = useState('');
  const range = rangeFor(rk);
  const sales = A.salesIn(r.id, range);
  const total = sales.reduce((a, s) => a + s.bill.total, 0);
  const vat = sales.reduce((a, s) => a + s.bill.vat, 0);
  const n = sales.length;
  const floor = floorModel(r);
  const busyT = floor.filter((f) => f.s).length;
  const reviews = A.reviewsFor(r.id);
  const avgStars = reviews.length ? reviews.reduce((a, v) => a + v.stars, 0) / reviews.length : 0;
  const top = A.itemsSoldIn(r.id, range).slice(0, 6);
  const chan = ['dine', 'takeaway', 'delivery'].map((k) => ({ l: { dine: 'Dine-in (QR)', takeaway: 'Takeaway', delivery: 'Delivery' }[k], v: sales.filter((s) => s.kind === k).reduce((a, s) => a + s.bill.total, 0) }));
  const live = A.ordersFor(r.id).filter((o) => o.status === 'kitchen').length;
  const calls = A.requestsFor(r.id).filter((q) => q.status !== 'done').length;
  return (
    <div class="stack">
      <div class="toolbar">
        <Seg value={rk} onChange={setRk} options={[{ v: 'today', l: 'Today' }, { v: 'yesterday', l: 'Yesterday' }, { v: 'week', l: 'Last 7 days' }]} />
        <span class="grow" />
        {(!LIVE || r.demo) && <Btn kind="ghost" size="sm" icon="refresh" disabled={!!busy} onClick={async () => { setBusy('Adding…'); await A.addHistory(r.id); setBusy(''); toast('Added 3 days of sample sales', 'ok'); }}>{busy || 'Add sample sales'}</Btn>}
      </div>
      <div class="stats">
        <Stat label="Sales" value={tk(total)} sub={n ? `${n} paid order${n === 1 ? '' : 's'}` : 'No paid orders yet'} />
        <Stat label="Average bill" value={tk(n ? total / n : 0)} sub="incl. VAT and service" />
        <Stat label="VAT collected" value={tk(vat)} sub={`${r.tax.vat}% ${r.tax.inclusive ? 'included in prices' : 'on top of prices'}`} />
        <Stat label="Tables now" value={`${busyT} / ${r.tables.length}`} sub={`${live} in kitchen · ${calls} calls`} tone={calls ? 'alert' : ''} />
        <Stat label="Rating" value={avgStars ? avgStars.toFixed(1) + ' ★' : '—'} sub={`${reviews.length} reviews`} />
      </div>
      <div class="cards two">
        <div class="card span2">
          <h3>{rk === 'week' ? 'Sales by day' : 'Sales by hour'}</h3>
          <p class="muted small">Paid bills, ৳ incl. VAT · hover a bar for the exact figure</p>
          <Columns data={hourBuckets(sales, range, rk)} label="Sales over time" />
        </div>
        <div class="card">
          <h3>Where orders came from</h3>
          <HBars data={chan} />
        </div>
        <div class="card">
          <h3>How guests paid</h3>
          <HBars data={methodSplit(sales)} />
        </div>
        <div class="card">
          <h3>Top dishes</h3>
          {top.length ? (
            <table class="tbl">
              <thead><tr><th>Dish</th><th class="num">Sold</th><th class="num">Revenue</th></tr></thead>
              <tbody>
                {top.map((d) => (
                  <tr><td><span class="ticon">{d.icon}</span>{d.name.en}</td><td class="num">{d.qty}</td><td class="num">{tk(d.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p class="muted small">No dishes sold in this period.</p>}
        </div>
        <div class="card">
          <h3>Floor right now</h3>
          <div class="mini-floor">
            {floor.map((f) => (
              <span class={'mf tone-' + TABLE_STATES[f.st].tone} title={`${f.tb.label}: ${TABLE_STATES[f.st].label}`}>
                <b>{f.tb.label}</b>
                <small>{TABLE_STATES[f.st].label}</small>
              </span>
            ))}
          </div>
          <a class="link" href={'#' + r.id + '-staff'}>Open staff tablet <Ic n="right" s={14} /></a>
        </div>
        <div class="card span2">
          <h3>Latest reviews</h3>
          {reviews.slice(0, 3).map((v) => <ReviewRow v={v} r={r} />)}
          {!reviews.length && <p class="muted small">No reviews yet. Guests are asked after they pay.</p>}
        </div>
      </div>
    </div>
  );
}

const Stars = ({ n }) => (
  <span class="stars-s" aria-label={n + ' stars'}>
    {[1, 2, 3, 4, 5].map((i) => <Ic n="star" s={14} cls={i <= n ? 'on' : ''} />)}
  </span>
);

function ReviewRow({ v, r }) {
  const tb = r.tables.find((x) => x.id === v.tableId);
  return (
    <div class="rv">
      <Avatar name={v.guest || 'G'} size={30} />
      <div>
        <div class="rv-h"><b>{v.guest || 'Guest'}</b><Stars n={v.stars} /><small class="muted">{tb ? 'Table ' + tb.label : v.orderId ? 'Online order' : ''} · {ago(v.createdAt)} ago</small></div>
        {v.comment && <p>{v.comment}</p>}
        {(v.tags || []).length > 0 && <div class="chips">{v.tags.map((t) => <span class="chip sm">{t}</span>)}</div>}
      </div>
    </div>
  );
}

// ---------- Menu ----------
function MenuManager({ r }) {
  const [cat, setCat] = useState(r.categories[0]?.id);
  const [edit, setEdit] = useState(null);
  const [catEdit, setCatEdit] = useState(null);
  const [stations, setStations] = useState(false);
  const items = r.items.filter((i) => i.cat === cat);
  const saveItems = (list) => A.patchRestaurant(r.id, { items: list });
  const toggleAvail = (i) => saveItems(r.items.map((x) => (x.id === i.id ? { ...x, available: !x.available } : x)));
  return (
    <div class="menu-mgr">
      <aside class="card cat-list">
        <div class="card-h"><h3>Categories</h3><Btn size="sm" kind="ghost" icon="plus" onClick={() => setCatEdit({ id: '', name: { en: '', bn: '' }, station: r.stations[0]?.id })}>Add</Btn></div>
        {r.categories.map((c) => (
          <button type="button" class={'cat-row' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>
            <span><b>{c.name.en}</b><small>{c.name.bn} · {r.stations.find((s) => s.id === c.station)?.name.en || 'No station'}</small></span>
            <span class="count">{r.items.filter((i) => i.cat === c.id).length}</span>
          </button>
        ))}
        <Btn kind="ghost" size="sm" icon="chef" onClick={() => setStations(true)}>Kitchen stations ({r.stations.length})</Btn>
      </aside>
      <section class="card">
        <div class="card-h">
          <h3>{r.categories.find((c) => c.id === cat)?.name.en || 'Dishes'}</h3>
          <span class="grow" />
          {cat && <Btn size="sm" kind="ghost" icon="edit" onClick={() => setCatEdit(r.categories.find((c) => c.id === cat))}>Edit category</Btn>}
          <Btn size="sm" kind="primary" icon="plus" disabled={!cat} onClick={() => setEdit({ id: '', cat, name: { en: '', bn: '' }, desc: { en: '', bn: '' }, price: 0, half: null, icon: '🍛', veg: false, spice: false, allergens: [], tags: [], deal: null, available: true, prep: 12 })}>Add dish</Btn>
        </div>
        {!items.length && <Empty icon="cutlery" title="No dishes in this category" body="Add the first one. Guests will see it on their phones immediately." />}
        <div class="dish-rows">
          {items.map((i) => (
            <div class={'dish-row' + (i.available ? '' : ' off')}>
              <Plate item={i} size={42} dim={!i.available} />
              <span class="dr-name"><b>{i.name.en}</b><small>{i.name.bn}</small></span>
              <span class="dr-price mono">{i.half ? `${tk(i.half)} / ` : ''}{tk(i.price)}</span>
              <span class="dr-tags">
                {i.veg && <span class="chip sm veg">Veg</span>}
                {i.tags.map((t) => <span class="chip sm">{TAGS[t]?.en}</span>)}
                {i.deal && <span class="chip sm">Deal</span>}
              </span>
              <Toggle id={'avail-' + i.id} on={i.available} onChange={() => toggleAvail(i)} label={i.available ? 'On menu' : 'Sold out'} />
              <Btn kind="icon" icon="edit" aria-label={'Edit ' + i.name.en} onClick={() => setEdit(i)} />
            </div>
          ))}
        </div>
      </section>
      {edit && (
        <ItemEditor r={r} item={edit} onClose={() => setEdit(null)}
          onSave={(it) => {
            const exists = r.items.some((x) => x.id === it.id);
            saveItems(exists ? r.items.map((x) => (x.id === it.id ? it : x)) : [...r.items, it]);
            setEdit(null);
            toast('Menu updated. Guests see it now.', 'ok');
          }}
          onDelete={(it) => { saveItems(r.items.filter((x) => x.id !== it.id)); setEdit(null); }} />
      )}
      {catEdit && (
        <CatEditor r={r} c={catEdit} onClose={() => setCatEdit(null)}
          onSave={(c) => {
            const exists = r.categories.some((x) => x.id === c.id);
            A.patchRestaurant(r.id, { categories: exists ? r.categories.map((x) => (x.id === c.id ? c : x)) : [...r.categories, c] });
            setCat(c.id);
            setCatEdit(null);
          }}
          onDelete={(c) => {
            if (r.items.some((i) => i.cat === c.id)) return toast('Move or delete the dishes in this category first.', 'alert');
            A.patchRestaurant(r.id, { categories: r.categories.filter((x) => x.id !== c.id) });
            setCat(r.categories[0]?.id);
            setCatEdit(null);
          }} />
      )}
      {stations && <StationsEditor r={r} onClose={() => setStations(false)} />}
    </div>
  );
}

function CatEditor({ r, c, onClose, onSave, onDelete }) {
  const [d, setD] = useState({ ...c, name: { ...c.name } });
  return (
    <Modal open title={c.id ? 'Edit category' : 'New category'} onClose={onClose} foot={
      <>
        {c.id && <Btn kind="danger" size="sm" icon="trash" onClick={() => onDelete(c)}>Delete</Btn>}
        <span class="grow" />
        <Btn kind="primary" disabled={!d.name.en.trim()} onClick={() => onSave({ ...d, id: d.id || 'c' + uid() })}>Save</Btn>
      </>
    }>
      <div class="form-2">
        <Field label="Name (English)" id="cat-en"><input id="cat-en" class="input" value={d.name.en} onInput={(e) => setD({ ...d, name: { ...d.name, en: e.target.value } })} /></Field>
        <Field label="নাম (বাংলা)" id="cat-bn"><input id="cat-bn" class="input" value={d.name.bn} onInput={(e) => setD({ ...d, name: { ...d.name, bn: e.target.value } })} /></Field>
        <Field label="Kitchen station" id="cat-st" hint="Tickets for these dishes go to this screen">
          <select id="cat-st" class="input" value={d.station} onChange={(e) => setD({ ...d, station: e.target.value })}>
            {r.stations.map((s) => <option value={s.id}>{s.name.en}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function StationsEditor({ r, onClose }) {
  const [list, setList] = useState(r.stations.map((s) => ({ ...s, name: { ...s.name } })));
  return (
    <Modal open title="Kitchen stations" onClose={onClose} foot={
      <>
        <Btn kind="ghost" icon="plus" onClick={() => setList([...list, { id: 'st' + uid(), name: { en: 'New station', bn: '' } }])}>Add station</Btn>
        <span class="grow" />
        <Btn kind="primary" onClick={() => {
          const ids = list.map((s) => s.id);
          const cats = r.categories.map((c) => (ids.includes(c.station) ? c : { ...c, station: ids[0] }));
          A.patchRestaurant(r.id, { stations: list, categories: cats });
          onClose();
        }}>Save stations</Btn>
      </>
    }>
      <p class="muted small">Each station gets its own column on the kitchen display, for example Tandoor, Curry and Drinks.</p>
      {list.map((s, k) => (
        <div class="row-gap">
          <input class="input" aria-label="Station name" value={s.name.en} onInput={(e) => setList(list.map((x, j) => (j === k ? { ...x, name: { ...x.name, en: e.target.value } } : x)))} />
          <input class="input" aria-label="Station name in Bangla" placeholder="বাংলা নাম" value={s.name.bn} onInput={(e) => setList(list.map((x, j) => (j === k ? { ...x, name: { ...x.name, bn: e.target.value } } : x)))} />
          <Btn kind="icon" icon="trash" aria-label="Remove station" disabled={list.length < 2} onClick={() => setList(list.filter((_, j) => j !== k))} />
        </div>
      ))}
    </Modal>
  );
}

function ItemEditor({ r, item, onClose, onSave, onDelete }) {
  const [d, setD] = useState(JSON.parse(JSON.stringify(item)));
  const set = (p) => setD({ ...d, ...p });
  const toggleIn = (key, v) => set({ [key]: d[key].includes(v) ? d[key].filter((x) => x !== v) : [...d[key], v] });
  const valid = d.name.en.trim() && d.price > 0;
  return (
    <Modal open wide title={item.id ? 'Edit dish' : 'New dish'} onClose={onClose} foot={
      <>
        {item.id && <Btn kind="danger" size="sm" icon="trash" onClick={() => onDelete(item)}>Delete dish</Btn>}
        <span class="grow" />
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={!valid} onClick={() => onSave({ ...d, id: d.id || 'i' + uid(), price: +d.price, half: d.half ? +d.half : null, prep: +d.prep || 10 })}>Save dish</Btn>
      </>
    }>
      <div class="form-2">
        <Field label="Dish name (English)" id="it-en"><input id="it-en" class="input" value={d.name.en} onInput={(e) => set({ name: { ...d.name, en: e.target.value } })} /></Field>
        <Field label="খাবারের নাম (বাংলা)" id="it-bn"><input id="it-bn" class="input" value={d.name.bn} onInput={(e) => set({ name: { ...d.name, bn: e.target.value } })} /></Field>
        <Field label="Description (English)" id="it-den"><input id="it-den" class="input" value={d.desc.en} onInput={(e) => set({ desc: { ...d.desc, en: e.target.value } })} /></Field>
        <Field label="বর্ণনা (বাংলা)" id="it-dbn"><input id="it-dbn" class="input" value={d.desc.bn} onInput={(e) => set({ desc: { ...d.desc, bn: e.target.value } })} /></Field>
        <Field label="Category" id="it-cat">
          <select id="it-cat" class="input" value={d.cat} onChange={(e) => set({ cat: e.target.value })}>
            {r.categories.map((c) => <option value={c.id}>{c.name.en}</option>)}
          </select>
        </Field>
        <Field label="Prep time (minutes)" id="it-prep" hint="Drives the guest countdown">
          <input id="it-prep" class="input" type="number" min="1" value={d.prep} onInput={(e) => set({ prep: e.target.value })} />
        </Field>
        <Field label="Full price (৳)" id="it-price"><input id="it-price" class="input" type="number" min="0" value={d.price} onInput={(e) => set({ price: +e.target.value })} /></Field>
        <Field label="Half price (৳, optional)" id="it-half" hint="Leave empty if there is no half portion">
          <input id="it-half" class="input" type="number" min="0" value={d.half || ''} onInput={(e) => set({ half: e.target.value ? +e.target.value : null })} />
        </Field>
      </div>
      <Field label="Picture" id="it-icon">
        <div class="icon-grid">
          {ICONS.map((ic) => <button type="button" class={'ig' + (d.icon === ic ? ' on' : '')} onClick={() => set({ icon: ic })} aria-label={'Use ' + ic}>{ic}</button>)}
        </div>
      </Field>
      <div class="form-2">
        <Toggle id="it-veg" on={d.veg} onChange={(v) => set({ veg: v })} label="Vegetarian" />
        <Toggle id="it-spice" on={d.spice} onChange={(v) => set({ spice: v })} label="Guests choose spice level" />
        <Toggle id="it-avail" on={d.available} onChange={(v) => set({ available: v })} label="Available today" />
      </div>
      <Field label="Allergens" id="it-al">
        <div class="chips">
          {Object.entries(ALLERGENS).map(([k, v]) => (
            <button type="button" class={'chip' + (d.allergens.includes(k) ? ' on' : '')} onClick={() => toggleIn('allergens', k)}>{v.en}</button>
          ))}
        </div>
      </Field>
      <Field label="Badges" id="it-tags">
        <div class="chips">
          {Object.entries(TAGS).map(([k, v]) => (
            <button type="button" class={'chip' + (d.tags.includes(k) ? ' on' : '')} onClick={() => toggleIn('tags', k)}>{v.en}</button>
          ))}
        </div>
      </Field>
      <div class="form-2">
        <Field label="Combo deal: add-on dish" id="it-deal" hint="Offered on the dish page, e.g. Borhani with Kacchi">
          <select id="it-deal" class="input" value={d.deal?.itemId || ''} onChange={(e) => set({ deal: e.target.value ? { itemId: e.target.value, price: d.deal?.price || 0 } : null })}>
            <option value="">No deal</option>
            {r.items.filter((x) => x.id !== d.id).map((x) => <option value={x.id}>{x.name.en} ({tk(x.price)})</option>)}
          </select>
        </Field>
        {d.deal && (
          <Field label="Deal price for the add-on (৳)" id="it-dealp">
            <input id="it-dealp" class="input" type="number" min="0" value={d.deal.price} onInput={(e) => set({ deal: { ...d.deal, price: +e.target.value } })} />
          </Field>
        )}
      </div>
    </Modal>
  );
}

// ---------- Tables & QR ----------
function TablesQR({ r }) {
  const [secName, setSecName] = useState('');
  const save = (p) => A.patchRestaurant(r.id, p);
  const addTable = (sec) => {
    const inSec = r.tables.filter((t) => t.section === sec.id);
    const prefix = (inSec[0]?.label.match(/^[A-Za-z]+/) || ['T'])[0];
    let n = r.tables.length + 1;
    let label = prefix + n;
    while (r.tables.some((t) => t.label === label)) label = prefix + ++n;
    save({ tables: [...r.tables, { id: label.toLowerCase(), label, seats: 4, section: sec.id }] });
  };
  const sheet = () => {
    const cards = r.tables
      .map(
        (t) => `<div class="c"><div class="b" style="background:${r.brand}">${r.name.en}<small>${r.name.bn}</small></div><p>Scan to order &amp; pay<br/><span>স্ক্যান করে অর্ডার ও পেমেন্ট করুন</span></p>${qrSvgString(tableLink(r.id, t.id), 170)}<h2>Table ${t.label}</h2>${r.wifi?.ssid ? `<p class="w">Wi-Fi ${r.wifi.ssid} · ${r.wifi.password}</p>` : ''}</div>`
      )
      .join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${r.name.en} table QR codes</title><style>body{font-family:system-ui,sans-serif;margin:0;padding:12mm}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm}.c{border:1px solid #ccc;border-radius:10px;overflow:hidden;text-align:center;page-break-inside:avoid;padding-bottom:10px}.b{color:#fff;font-weight:700;padding:10px;font-size:18px}.b small{display:block;font-weight:400;font-size:13px}p{margin:8px 0;font-size:13px}p span{color:#555}h2{margin:4px 0;font-size:22px}.w{color:#555;font-size:11px}</style></head><body><div class="g">${cards}</div></body></html>`;
    saveFile(`${r.id}-table-qr-codes.html`, html, 'text/html').then((ok) => toast(ok ? 'QR sheet saved. Open it and print on A4.' : 'Download was blocked by the browser.', ok ? 'ok' : 'alert'));
  };
  return (
    <div class="stack">
      <div class="card">
        <div class="card-h">
          <h3>Floor plan</h3>
          <span class="grow" />
          <input class="input sm" aria-label="New section name" placeholder="New section, e.g. Rooftop" value={secName} onInput={(e) => setSecName(e.target.value)} />
          <Btn size="sm" kind="ghost" icon="plus" disabled={!secName.trim()} onClick={() => (save({ sections: [...r.sections, { id: 'sec' + uid(), name: secName.trim() }] }), setSecName(''))}>Add section</Btn>
        </div>
        {r.sections.map((sec) => (
          <div class="sec-edit">
            <div class="row-gap">
              <h4>{sec.name}</h4>
              <small class="muted">{r.tables.filter((t) => t.section === sec.id).length} tables</small>
              <span class="grow" />
              <Btn size="sm" kind="ghost" icon="plus" onClick={() => addTable(sec)}>Add table</Btn>
              {r.sections.length > 1 && !r.tables.some((t) => t.section === sec.id) && <Btn size="sm" kind="icon" icon="trash" aria-label="Remove section" onClick={() => save({ sections: r.sections.filter((s) => s.id !== sec.id) })} />}
            </div>
            <div class="t-edit">
              {r.tables.filter((t) => t.section === sec.id).map((t) => (
                <div class="te">
                  <b>{t.label}</b>
                  <label class="sr-only" for={'seats-' + t.id}>Seats at {t.label}</label>
                  <select id={'seats-' + t.id} class="input sm" value={t.seats} onChange={(e) => save({ tables: r.tables.map((x) => (x.id === t.id ? { ...x, seats: +e.target.value } : x)) })}>
                    {[2, 4, 6, 8, 10, 12].map((n) => <option value={n}>{n} seats</option>)}
                  </select>
                  <Btn size="sm" kind="icon" icon="trash" aria-label={'Remove ' + t.label} disabled={!!A.openSession(r.id, t.id)} onClick={() => save({ tables: r.tables.filter((x) => x.id !== t.id) })} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div class="card">
        <div class="card-h">
          <h3>Table QR codes</h3>
          <p class="muted small">Print these as table tents. Each code opens the menu for that exact table.</p>
          <span class="grow" />
          <Btn kind="primary" size="sm" icon="download" onClick={sheet}>Download print sheet</Btn>
        </div>
        <div class="qr-grid">
          {r.tables.map((t) => (
            <div class="tent">
              <div class="tent-top" style={{ background: r.brand }}>
                <b>{r.name.en}</b>
                <small>Scan to order & pay · স্ক্যান করুন</small>
              </div>
              <QR text={tableLink(r.id, t.id)} size={120} label={'QR code for table ' + t.label} />
              <b class="tent-t">Table {t.label}</b>
              <a class="link small" href={'#' + r.id + '-table-' + t.id}>Open guest view <Ic n="right" s={12} /></a>
            </div>
          ))}
        </div>
      </div>

      <div class="card online-link">
        <QR text={onlineLink(r.id)} size={120} label="QR code for online ordering" />
        <div>
          <h3>Takeaway & delivery link</h3>
          <p class="muted">Share on your Facebook page, WhatsApp and flyers. Guests order and pay without visiting.</p>
          <code class="mono small">{onlineLink(r.id)}</code>
          <div class="row-gap">
            <Btn size="sm" kind="ghost" icon="copy" onClick={async () => toast((await copyText(onlineLink(r.id))) ? 'Link copied' : 'Copy blocked. Select the link and copy it.', 'ok')}>Copy link</Btn>
            <a class="btn btn-ghost btn-sm" href={'#' + r.id + '-order'}><Ic n="external" s={14} /><span>Open ordering page</span></a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Staff ----------
const ROLES = { waiter: 'Waiter', kitchen: 'Kitchen', cashier: 'Cashier', manager: 'Manager', rider: 'Delivery rider' };
export function StaffMgr({ r }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('waiter');
  const save = (staff) => A.patchRestaurant(r.id, { staff });
  return (
    <div class="stack">
      {LIVE && <TeamLogins r={r} />}
      <div class="card">
        <div class="card-h">
          <h3>{LIVE ? 'Names on the floor' : 'Team'}</h3>
          {LIVE && <p class="muted small">Waiter and rider names shown to guests and on tickets. Logins are managed above.</p>}
          <span class="grow" />
          <input class="input sm" aria-label="Staff name" placeholder="Name" value={name} onInput={(e) => setName(e.target.value)} />
          <select class="input sm" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
            {Object.entries(ROLES).map(([k, v]) => <option value={k}>{v}</option>)}
          </select>
          <Btn size="sm" kind="primary" icon="plus" disabled={!name.trim()} onClick={() => (save([...r.staff, { id: 's' + uid(), name: name.trim(), role, section: '' }]), setName(''))}>Add</Btn>
        </div>
        <table class="tbl">
          <thead><tr><th>Name</th><th>Role</th><th>Section</th><th /></tr></thead>
          <tbody>
            {r.staff.map((s) => (
              <tr>
                <td><Avatar name={s.name} size={24} /> {s.name}</td>
                <td>
                  <select class="input sm" aria-label={'Role of ' + s.name} value={s.role} onChange={(e) => save(r.staff.map((x) => (x.id === s.id ? { ...x, role: e.target.value } : x)))}>
                    {Object.entries(ROLES).map(([k, v]) => <option value={k}>{v}</option>)}
                  </select>
                </td>
                <td>
                  {s.role === 'waiter' ? (
                    <select class="input sm" aria-label={'Section of ' + s.name} value={s.section} onChange={(e) => save(r.staff.map((x) => (x.id === s.id ? { ...x, section: e.target.value } : x)))}>
                      <option value="">Any</option>
                      {r.sections.map((sec) => <option value={sec.id}>{sec.name}</option>)}
                    </select>
                  ) : <span class="muted">—</span>}
                </td>
                <td class="num"><Btn kind="icon" icon="trash" aria-label={'Remove ' + s.name} onClick={() => save(r.staff.filter((x) => x.id !== s.id))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div class="cards two">
        <a class="card device" href={'#' + r.id + '-staff'}><Ic n="tablet" s={28} /><b>Staff tablet</b><span class="muted small">Floor map, new orders, waiter calls, payments. Open it on the floor tablet.</span></a>
        <a class="card device" href={'#' + r.id + '-kitchen'}><Ic n="monitor" s={28} /><b>Kitchen display</b><span class="muted small">Tickets by station with timers. Open it on the kitchen TV or tablet.</span></a>
      </div>
    </div>
  );
}

// ---------- Orders ----------
function OrdersView({ r }) {
  const [ch, setCh] = useState('all');
  const [rk, setRk] = useState(() => (A.ordersFor(r.id).some((o) => o.createdAt >= rangeFor('today')[0]) ? 'today' : 'week'));
  const [open, setOpen] = useState(null);
  const range = rangeFor(rk);
  const list = A.ordersFor(r.id)
    .filter((o) => o.createdAt >= range[0] && o.createdAt < range[1] && (ch === 'all' || o.channel === ch))
    .sort((a, b) => b.createdAt - a.createdAt);
  const tLabel = (o) => (o.channel === 'dine' ? 'Table ' + (r.tables.find((x) => x.id === o.tableId)?.label || o.tableId) : o.customer?.name || '');
  return (
    <div class="card">
      <div class="toolbar">
        <Seg value={ch} onChange={setCh} options={[{ v: 'all', l: 'All' }, { v: 'dine', l: 'Dine-in' }, { v: 'takeaway', l: 'Takeaway' }, { v: 'delivery', l: 'Delivery' }]} />
        <Seg value={rk} onChange={setRk} options={[{ v: 'today', l: 'Today' }, { v: 'yesterday', l: 'Yesterday' }, { v: 'week', l: '7 days' }]} />
        <span class="grow" />
        <span class="muted small">{list.length} orders</span>
      </div>
      <div class="tbl-wrap">
        <table class="tbl hover">
          <thead><tr><th>Time</th><th>#</th><th>Channel</th><th>Table / customer</th><th class="num">Items</th><th class="num">Value</th><th>Status</th></tr></thead>
          <tbody>
            {list.slice(0, 200).map((o) => (
              <tr onClick={() => setOpen(o)} tabindex="0" onKeyDown={(e) => e.key === 'Enter' && setOpen(o)}>
                <td class="mono">{rk === 'week' ? dateStr(o.createdAt).slice(0, 6) + ' ' : ''}{clock(o.createdAt)}</td>
                <td class="mono">{o.no}</td>
                <td>{{ dine: 'Dine-in', takeaway: 'Takeaway', delivery: 'Delivery' }[o.channel]}</td>
                <td>{tLabel(o)}</td>
                <td class="num">{o.items.reduce((a, l) => a + l.qty, 0)}</td>
                <td class="num">{tk(o.items.reduce((a, l) => a + l.qty * l.unit, 0))}</td>
                <td><span class={'spill s-' + o.status}>{o.status === 'kitchen' ? 'cooking' : o.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p class="muted pad">No orders in this period.</p>}
      </div>
      {open && (
        <Modal open title={`Order #${open.no} · ${tLabel(open)}`} onClose={() => setOpen(null)}>
          <ul class="qc-lines light">
            {open.items.map((li) => <li><b>{li.qty}×</b> {li.name.en}{li.size === 'half' ? ' (half)' : ''}<span class="grow" /><span class="mono">{tk(li.qty * li.unit)}</span></li>)}
          </ul>
          <ol class="timeline">
            {[['Placed', open.createdAt], ['Sent to kitchen', open.sentAt], ['Ready', open.readyAt], ['Served', open.servedAt], ['Out for delivery', open.outAt], ['Completed', open.completedAt], ['Cancelled', open.cancelledAt]]
              .filter(([, t]) => t)
              .map(([l, t]) => <li><b>{l}</b><span class="mono">{clock(t)}</span></li>)}
          </ol>
          {open.customer && <p class="muted small">{open.customer.name} · {open.customer.phone}{open.customer.address ? ' · ' + open.customer.address : ''}</p>}
          {open.payment && <p class="muted small">Payment: {PAY_METHODS[open.payment.method]?.label} · {open.payment.status}</p>}
        </Modal>
      )}
    </div>
  );
}

// ---------- Reports ----------
export function Reports({ r }) {
  const [rk, setRk] = useState('week');
  const range = rangeFor(rk);
  const sales = A.salesIn(r.id, range);
  const sum = (f) => sales.reduce((a, s) => a + (s.bill[f] || 0), 0);
  const totals = { subtotal: sum('subtotal'), sc: sum('sc'), vat: sum('vat'), tip: sum('tip'), packaging: sum('packaging'), delivery: sum('delivery'), total: sum('total') };
  const days = [];
  for (let t0 = dayStart(range[0]); t0 < Math.min(range[1], Date.now() + 1); t0 += 864e5) {
    const ss = sales.filter((s) => s.t >= t0 && s.t < t0 + 864e5);
    days.push({ t0, n: ss.length, sub: ss.reduce((a, s) => a + s.bill.subtotal, 0), sc: ss.reduce((a, s) => a + s.bill.sc, 0), vat: ss.reduce((a, s) => a + s.bill.vat, 0), tip: ss.reduce((a, s) => a + (s.bill.tip || 0), 0), total: ss.reduce((a, s) => a + s.bill.total, 0) });
  }
  const exportCsv = () => {
    const rows = [['Date', 'Time', 'Channel', 'Reference', 'Subtotal', 'Service charge', 'VAT', 'VAT inclusive', 'Packaging', 'Delivery', 'Tip', 'Total', 'Paid by']];
    sales.forEach((s) => rows.push([dateStr(s.t), clock(s.t), s.kind, s.ref, s.bill.subtotal, s.bill.sc, s.bill.vat, s.bill.inclusive ? 'yes' : 'no', s.bill.packaging || 0, s.bill.delivery || 0, s.bill.tip || 0, s.bill.total, Object.entries(s.paidBy).map(([k, v]) => `${PAY_METHODS[k]?.label || k} ${v}`).join('; ')]));
    saveFile(`${r.id}-sales-${rk}.csv`, rows.map((row) => row.map(csvEscape).join(',')).join('\n'), 'text/csv').then((ok) => toast(ok ? 'CSV saved' : 'Download was blocked', ok ? 'ok' : 'alert'));
  };
  return (
    <div class="stack">
      <div class="toolbar">
        <Seg value={rk} onChange={setRk} options={[{ v: 'today', l: 'Today' }, { v: 'yesterday', l: 'Yesterday' }, { v: 'week', l: 'Last 7 days' }]} />
        <span class="grow" />
        <Btn kind="primary" size="sm" icon="download" onClick={exportCsv}>Export CSV</Btn>
      </div>
      <div class="stats">
        <Stat label="Total collected" value={tk(totals.total)} sub={`${sales.length} paid orders`} />
        <Stat label="Food & drinks" value={tk(totals.subtotal)} />
        <Stat label="Service charge" value={tk(totals.sc)} sub={`${r.tax.sc}% rate`} />
        <Stat label="VAT" value={tk(totals.vat)} sub={`${r.tax.vat}% · ${r.tax.inclusive ? 'included' : 'added'}`} />
        <Stat label="Tips to staff" value={tk(totals.tip)} />
      </div>
      <div class="cards two">
        <div class="card"><h3>By payment method</h3><HBars data={methodSplit(sales)} /></div>
        <div class="card"><h3>By channel</h3><HBars data={['dine', 'takeaway', 'delivery'].map((k) => ({ l: { dine: 'Dine-in', takeaway: 'Takeaway', delivery: 'Delivery' }[k], v: sales.filter((s) => s.kind === k).reduce((a, s) => a + s.bill.total, 0) }))} /></div>
      </div>
      <div class="card">
        <h3>Daily VAT summary</h3>
        <p class="muted small">Use this for your monthly VAT return. BIN {r.bin || 'not set (add it in Settings)'}.</p>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th>Date</th><th class="num">Orders</th><th class="num">Food & drinks</th><th class="num">Service</th><th class="num">VAT</th><th class="num">Tips</th><th class="num">Total</th></tr></thead>
            <tbody>
              {days.map((d) => (
                <tr><td>{dateStr(d.t0)}</td><td class="num">{d.n}</td><td class="num">{tk(d.sub)}</td><td class="num">{tk(d.sc)}</td><td class="num">{tk(d.vat)}</td><td class="num">{tk(d.tip)}</td><td class="num"><b>{tk(d.total)}</b></td></tr>
              ))}
            </tbody>
            <tfoot><tr><td>Total</td><td class="num">{sales.length}</td><td class="num">{tk(totals.subtotal)}</td><td class="num">{tk(totals.sc)}</td><td class="num">{tk(totals.vat)}</td><td class="num">{tk(totals.tip)}</td><td class="num"><b>{tk(totals.total)}</b></td></tr></tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------- Reviews ----------
function Reviews({ r }) {
  const list = A.reviewsFor(r.id);
  const avg = list.length ? list.reduce((a, v) => a + v.stars, 0) / list.length : 0;
  return (
    <div class="cards two">
      <div class="card">
        <h3>Average rating</h3>
        <div class="big-rating"><b>{avg ? avg.toFixed(1) : '—'}</b><Stars n={Math.round(avg)} /><span class="muted small">{list.length} reviews</span></div>
        <HBars data={[5, 4, 3, 2, 1].map((s) => ({ l: s + ' ★', v: list.filter((v) => v.stars === s).length }))} fmt={(v) => String(v)} />
      </div>
      <div class="card span2">
        <h3>All reviews</h3>
        {list.map((v) => <ReviewRow v={v} r={r} />)}
        {!list.length && <p class="muted">No reviews yet.</p>}
      </div>
    </div>
  );
}

// ---------- Settings ----------
function Settings({ r }) {
  const [d, setD] = useState(() => JSON.parse(JSON.stringify(r)));
  useEffect(() => setD(JSON.parse(JSON.stringify(r))), [r.id]);
  const set = (p) => setD({ ...d, ...p });
  const dirty = JSON.stringify(d) !== JSON.stringify(r);
  const save = () => {
    A.saveRestaurant({ ...r, name: d.name, tagline: d.tagline, address: d.address, phone: d.phone, bin: d.bin, brand: d.brand, logoText: d.logoText, city: d.city, area: d.area, tax: d.tax, payments: d.payments, wifi: d.wifi, features: d.features, online: d.online, prepTarget: +d.prepTarget || 15 });
    toast('Settings saved', 'ok');
  };
  const pm = (k, p) => set({ payments: { ...d.payments, [k]: { ...d.payments[k], ...p } } });
  return (
    <div class="stack settings">
      <div class="save-bar">
        <span class="muted small">{dirty ? 'You have unsaved changes' : 'All changes saved'}</span>
        <Btn kind="ghost" size="sm" disabled={!dirty} onClick={() => setD(JSON.parse(JSON.stringify(r)))}>Discard</Btn>
        <Btn kind="primary" size="sm" disabled={!dirty} onClick={save}>Save settings</Btn>
      </div>
      <div class="card">
        <h3>Restaurant profile</h3>
        <ProfileFields d={d} set={set} />
      </div>
      <div class="card">
        <h3>VAT & service charge</h3>
        <TaxFields d={d} set={set} />
      </div>
      <div class="card">
        <h3>Payments at the table</h3>
        <PaymentFields d={d} pm={pm} />
      </div>
      {LIVE && <GatewaySettings r={r} />}
      <div class="card">
        <h3>Guest experience</h3>
        <GuestFields d={d} set={set} />
      </div>
      <div class="card">
        <h3>Takeaway & delivery</h3>
        <OnlineFields d={d} set={set} />
      </div>
      <div class="card">
        <h3>Demo tools</h3>
        <div class="row-gap">
          <Btn kind="ghost" size="sm" icon="refresh" onClick={() => (A.clearLiveActivity(r.id), toast('Closed all open tables and tickets', 'ok'))}>Close all live tables & tickets</Btn>
        </div>
      </div>
    </div>
  );
}

export function ProfileFields({ d, set }) {
  return (
    <div class="form-2">
      <Field label="Name (English)" id="p-en"><input id="p-en" class="input" value={d.name.en} onInput={(e) => set({ name: { ...d.name, en: e.target.value } })} /></Field>
      <Field label="নাম (বাংলা)" id="p-bn"><input id="p-bn" class="input" value={d.name.bn} onInput={(e) => set({ name: { ...d.name, bn: e.target.value } })} /></Field>
      <Field label="Tagline (English)" id="p-ten"><input id="p-ten" class="input" value={d.tagline?.en || ''} onInput={(e) => set({ tagline: { ...d.tagline, en: e.target.value } })} /></Field>
      <Field label="ট্যাগলাইন (বাংলা)" id="p-tbn"><input id="p-tbn" class="input" value={d.tagline?.bn || ''} onInput={(e) => set({ tagline: { ...d.tagline, bn: e.target.value } })} /></Field>
      <Field label="City" id="p-city">
        <select id="p-city" class="input" value={d.city} onChange={(e) => set({ city: e.target.value })}>{CITIES.map((c) => <option>{c}</option>)}</select>
      </Field>
      <Field label="Area" id="p-area"><input id="p-area" class="input" placeholder="e.g. Dhanmondi" value={d.area} onInput={(e) => set({ area: e.target.value })} /></Field>
      <Field label="Full address" id="p-addr" wide><input id="p-addr" class="input" value={d.address} onInput={(e) => set({ address: e.target.value })} /></Field>
      <Field label="Phone" id="p-phone"><input id="p-phone" class="input" value={d.phone} onInput={(e) => set({ phone: e.target.value })} /></Field>
      <Field label="VAT registration (BIN)" id="p-bin" hint="Printed on every receipt"><input id="p-bin" class="input" value={d.bin} onInput={(e) => set({ bin: e.target.value })} /></Field>
      <Field label="Brand colour" id="p-brand">
        <div class="row-gap"><input id="p-brand" type="color" value={d.brand} onInput={(e) => set({ brand: e.target.value })} /><span class="mono small">{d.brand}</span></div>
      </Field>
      <Field label="Logo letter" id="p-logo"><input id="p-logo" class="input" maxLength={2} value={d.logoText} onInput={(e) => set({ logoText: e.target.value })} /></Field>
    </div>
  );
}

export function TaxFields({ d, set }) {
  const tax = d.tax;
  return (
    <div class="form-2">
      <Field label="VAT rate (%)" id="t-vat" hint="Set the rate that applies to your restaurant">
        <input id="t-vat" class="input" type="number" min="0" max="25" step="0.5" value={tax.vat} onInput={(e) => set({ tax: { ...tax, vat: +e.target.value } })} />
      </Field>
      <Field label="Service charge (%)" id="t-sc" hint="0 if you don't charge one">
        <input id="t-sc" class="input" type="number" min="0" max="20" step="0.5" value={tax.sc} onInput={(e) => set({ tax: { ...tax, sc: +e.target.value } })} />
      </Field>
      <Toggle id="t-incl" on={tax.inclusive} onChange={(v) => set({ tax: { ...tax, inclusive: v } })} label="Menu prices already include VAT" sub="Off: VAT is added on top of the bill" />
    </div>
  );
}

export function PaymentFields({ d, pm }) {
  return (
    <div class="pay-fields">
      {METHOD_ORDER.map((k) => {
        const v = d.payments[k] || { on: false };
        return (
          <div class="pf">
            <Toggle id={'pm-' + k} on={v.on} onChange={(on) => pm(k, { on })} label={PAY_METHODS[k].label} sub={{ bkash: 'Mobile wallet', nagad: 'Mobile wallet', rocket: 'DBBL mobile wallet', card: 'Via a payment gateway', banglaqr: 'Interoperable QR', bank: 'Guest transfers, staff confirms', cash: 'Waiter collects at the table' }[k]} />
            {v.on && ['bkash', 'nagad', 'rocket'].includes(k) && <input class="input sm" aria-label={PAY_METHODS[k].label + ' merchant number'} placeholder="Merchant number" value={v.number || ''} onInput={(e) => pm(k, { number: e.target.value })} />}
            {v.on && k === 'card' && (
              <select class="input sm" aria-label="Card gateway" value={v.gateway || 'SSLCommerz'} onChange={(e) => pm(k, { gateway: e.target.value })}>
                {['SSLCommerz', 'aamarPay', 'ShurjoPay', 'PortWallet'].map((g) => <option>{g}</option>)}
              </select>
            )}
            {v.on && k === 'bank' && (
              <>
                <input class="input sm" aria-label="Bank name" placeholder="Bank" value={v.bank || ''} onInput={(e) => pm(k, { bank: e.target.value })} />
                <input class="input sm" aria-label="Account number" placeholder="Account number" value={v.account || ''} onInput={(e) => pm(k, { account: e.target.value })} />
              </>
            )}
          </div>
        );
      })}
      <p class="muted small">{LIVE ? 'Mobile wallet numbers are shown to guests who pay by Send Money. Connect a gateway below for automatic confirmation.' : 'In demo mode payments are simulated.'}</p>
    </div>
  );
}

export function GuestFields({ d, set }) {
  const f = d.features;
  return (
    <div class="form-2">
      <Field label="Wi-Fi network" id="g-ssid"><input id="g-ssid" class="input" value={d.wifi.ssid} onInput={(e) => set({ wifi: { ...d.wifi, ssid: e.target.value } })} /></Field>
      <Field label="Wi-Fi password" id="g-pass" hint="Shown to seated guests while they wait"><input id="g-pass" class="input" value={d.wifi.password} onInput={(e) => set({ wifi: { ...d.wifi, password: e.target.value } })} /></Field>
      <Field label="Kitchen target time (minutes)" id="g-prep" hint="Tickets turn amber at 60% and red past this">
        <input id="g-prep" class="input" type="number" min="3" max="90" value={d.prepTarget} onInput={(e) => set({ prepTarget: +e.target.value })} />
      </Field>
      <span />
      <Toggle id="g-order" on={f.tableOrdering !== false} onChange={(v) => set({ features: { ...f, tableOrdering: v } })} label="Guests order from their phones" />
      <Toggle id="g-auto" on={f.autoKitchen} onChange={(v) => set({ features: { ...f, autoKitchen: v } })} label="Send orders straight to the kitchen" sub="Off: a waiter taps Send to kitchen first" />
      <Toggle id="g-games" on={f.games !== false} onChange={(v) => set({ features: { ...f, games: v } })} label="Food quiz while waiting" />
    </div>
  );
}

export function OnlineFields({ d, set }) {
  const f = d.features;
  const o = d.online;
  const zones = o.zones || [];
  const setO = (p) => set({ online: { ...o, ...p } });
  return (
    <div class="stack">
      <div class="form-2">
        <Toggle id="o-take" on={f.takeaway} onChange={(v) => set({ features: { ...f, takeaway: v } })} label="Takeaway orders" />
        <Toggle id="o-del" on={f.delivery} onChange={(v) => set({ features: { ...f, delivery: v } })} label="Own delivery" sub="Your riders, your delivery areas" />
        <Field label="Packaging charge (৳)" id="o-pack"><input id="o-pack" class="input" type="number" min="0" value={o.packaging} onInput={(e) => setO({ packaging: +e.target.value })} /></Field>
        <Field label="Minimum order (৳)" id="o-min"><input id="o-min" class="input" type="number" min="0" value={o.minOrder} onInput={(e) => setO({ minOrder: +e.target.value })} /></Field>
        <Toggle id="o-cod" on={o.cod !== false} onChange={(v) => setO({ cod: v })} label="Allow cash on delivery / pay at pickup" />
      </div>
      {f.delivery && (
        <div>
          <h4>Delivery areas</h4>
          <table class="tbl">
            <thead><tr><th>Area</th><th class="num">Fee (৳)</th><th class="num">Ride time (min)</th><th /></tr></thead>
            <tbody>
              {zones.map((z, k) => (
                <tr>
                  <td><input class="input sm" aria-label="Area name" value={z.name} onInput={(e) => setO({ zones: zones.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })} /></td>
                  <td class="num"><input class="input sm num" aria-label="Delivery fee" type="number" value={z.fee} onInput={(e) => setO({ zones: zones.map((x, j) => (j === k ? { ...x, fee: +e.target.value } : x)) })} /></td>
                  <td class="num"><input class="input sm num" aria-label="Ride time" type="number" value={z.eta} onInput={(e) => setO({ zones: zones.map((x, j) => (j === k ? { ...x, eta: +e.target.value } : x)) })} /></td>
                  <td class="num"><Btn kind="icon" icon="trash" aria-label="Remove area" onClick={() => setO({ zones: zones.filter((_, j) => j !== k) })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Btn kind="ghost" size="sm" icon="plus" onClick={() => setO({ zones: [...zones, { id: 'z' + uid(), name: '', fee: 50, eta: 35 }] })}>Add area</Btn>
        </div>
      )}
    </div>
  );
}
