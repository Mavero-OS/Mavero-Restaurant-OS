// Shared helpers: ids, money, time, bill math, table status
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

export const uid = (p = '') =>
  p + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6);

export const slugify = (s) =>
  (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18) || 'r' + Math.random().toString(36).slice(2, 7);

export const toBn = (s) => String(s).replace(/[0-9]/g, (d) => BN_DIGITS[d]);

// South-Asian digit grouping (1,00,000) — the way Taka amounts are written in Bangladesh
export const groupIN = (n) => {
  const neg = n < 0;
  const v = Math.round(Math.abs(n));
  const s = String(v);
  if (s.length <= 3) return (neg ? '-' : '') + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (neg ? '-' : '') + rest + ',' + last3;
};

export const tk = (n, lang = 'en') => {
  const s = '৳' + groupIN(n || 0);
  return lang === 'bn' ? toBn(s) : s;
};

export const num = (n, lang = 'en') => (lang === 'bn' ? toBn(n) : String(n));

export const L = (obj, lang = 'en') => {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  return obj[lang] || obj.en || obj.bn || '';
};

export const pad2 = (n) => String(n).padStart(2, '0');

export const mmss = (ms) => {
  const neg = ms < 0;
  const t = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return (neg ? '-' : '') + pad2(m) + ':' + pad2(s);
};

export const ago = (ts, now = Date.now()) => {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ' + (m % 60) + 'm';
  return Math.floor(h / 24) + 'd';
};

export const clock = (ts, lang = 'en') => {
  const d = new Date(ts);
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const s = h + ':' + pad2(d.getMinutes()) + ' ' + ap;
  return lang === 'bn' ? toBn(s) : s;
};

export const dateStr = (ts) => {
  const d = new Date(ts);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return d.getDate() + ' ' + mon + ' ' + d.getFullYear();
};

export const dayStart = (ts = Date.now()) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const rangeFor = (key, now = Date.now()) => {
  const t0 = dayStart(now);
  if (key === 'yesterday') return [t0 - 864e5, t0];
  if (key === 'week') return [t0 - 6 * 864e5, now + 1];
  return [t0, now + 864e5];
};

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const isBdPhone = (p) => /^01[3-9]\d{8}$/.test((p || '').replace(/[\s-]/g, ''));

// ---------- Menu / pricing ----------
export const itemById = (r, id) => (r?.items || []).find((i) => i.id === id);

export const unitPrice = (item, size) => (size === 'half' && item.half ? item.half : item.price);

export const lineTotal = (li) => (li.unit || 0) * (li.qty || 0);

export const activeLines = (orders) =>
  orders.filter((o) => o.status !== 'cancelled').flatMap((o) => (o.items || []).map((li) => ({ ...li, orderId: o.id })));

// Bill math. Bangladesh restaurants usually charge VAT on (food + service charge).
// When prices include VAT, the VAT line is shown as "included".
export function computeBill(r, subtotal, opts = {}) {
  const tax = r?.tax || { vat: 5, sc: 0, inclusive: false };
  const sc = Math.round((subtotal * (tax.sc || 0)) / 100);
  const extras = (opts.packaging || 0) + (opts.delivery || 0);
  let vat;
  let total;
  if (tax.inclusive) {
    vat = Math.round(((subtotal + sc) * tax.vat) / (100 + tax.vat));
    total = subtotal + sc + extras;
  } else {
    vat = Math.round(((subtotal + sc) * (tax.vat || 0)) / 100);
    total = subtotal + sc + vat + extras;
  }
  const tip = Math.round(((subtotal) * (opts.tipPct || 0)) / 100);
  return {
    subtotal,
    sc,
    scPct: tax.sc || 0,
    vat,
    vatPct: tax.vat || 0,
    inclusive: !!tax.inclusive,
    packaging: opts.packaging || 0,
    delivery: opts.delivery || 0,
    tip,
    total: total + tip,
  };
}

export const sumLines = (lines) => lines.reduce((a, li) => a + lineTotal(li), 0);

// ---------- Status logic ----------
export const ORDER_FLOW_DINE = ['new', 'kitchen', 'ready', 'served'];
export const ORDER_FLOW_TAKEAWAY = ['new', 'kitchen', 'ready', 'completed'];
export const ORDER_FLOW_DELIVERY = ['new', 'kitchen', 'ready', 'out', 'completed'];

export const orderDone = (o) => (o.items || []).every((li) => o.done && o.done[li.key]);

export const stationLines = (o, station) => (o.items || []).filter((li) => !station || li.station === station);

export function orderEtaMs(r, o) {
  const prep = Math.max(
    r?.prepTarget || 15,
    ...(o.items || []).map((li) => itemById(r, li.itemId)?.prep || 0)
  );
  return (o.sentAt || o.createdAt) + prep * 60000;
}

// Table status for the floor map — the most urgent thing wins
export const TABLE_STATES = {
  free: { label: 'Free', tone: 'idle' },
  seated: { label: 'Seated', tone: 'info' },
  ordering: { label: 'New order', tone: 'accent' },
  cooking: { label: 'Cooking', tone: 'warn' },
  ready: { label: 'Food ready', tone: 'ok' },
  eating: { label: 'Eating', tone: 'calm' },
  help: { label: 'Needs help', tone: 'alert' },
  bill: { label: 'Bill', tone: 'accent' },
  paying: { label: 'Paying', tone: 'warn' },
  paid: { label: 'Paid', tone: 'ok' },
};

export function tableState(session, orders, requests, payments) {
  if (!session) return 'free';
  if ((requests || []).some((q) => q.status !== 'done' && q.type !== 'bill')) return 'help';
  if ((payments || []).some((p) => p.status === 'pending')) return 'paying';
  if (session.status === 'paid') return 'paid';
  if (session.billRequested || (requests || []).some((q) => q.status !== 'done' && q.type === 'bill')) return 'bill';
  const live = (orders || []).filter((o) => o.status !== 'cancelled');
  if (live.some((o) => o.status === 'new')) return 'ordering';
  if (live.some((o) => o.status === 'ready')) return 'ready';
  if (live.some((o) => o.status === 'kitchen')) return 'cooking';
  if (live.length) return 'eating';
  return 'seated';
}

export const PAY_METHODS = {
  bkash: { label: 'bKash', bn: 'বিকাশ', kind: 'mfs', short: 'bK' },
  nagad: { label: 'Nagad', bn: 'নগদ', kind: 'mfs', short: 'Ng' },
  rocket: { label: 'Rocket', bn: 'রকেট', kind: 'mfs', short: 'Rk' },
  card: { label: 'Card', bn: 'কার্ড', kind: 'gateway', short: 'Cd' },
  banglaqr: { label: 'Bangla QR', bn: 'বাংলা কিউআর', kind: 'qr', short: 'QR' },
  bank: { label: 'Bank transfer', bn: 'ব্যাংক ট্রান্সফার', kind: 'bank', short: 'Bk' },
  cash: { label: 'Cash', bn: 'নগদ টাকা', kind: 'cash', short: '৳' },
};

export const ALLERGENS = {
  dairy: { en: 'Dairy', bn: 'দুগ্ধজাত' },
  nuts: { en: 'Nuts', bn: 'বাদাম' },
  gluten: { en: 'Gluten', bn: 'গ্লুটেন' },
  egg: { en: 'Egg', bn: 'ডিম' },
  fish: { en: 'Fish', bn: 'মাছ' },
  shellfish: { en: 'Shellfish', bn: 'চিংড়ি' },
  soy: { en: 'Soy', bn: 'সয়া' },
  sesame: { en: 'Sesame', bn: 'তিল' },
};

export const SPICE = [
  { en: 'Mild', bn: 'কম ঝাল' },
  { en: 'Medium', bn: 'মাঝারি' },
  { en: 'Hot', bn: 'ঝাল' },
  { en: 'Extra hot', bn: 'খুব ঝাল' },
];

export const TAGS = {
  best: { en: 'Bestseller', bn: 'সেরা বিক্রি' },
  chef: { en: "Chef's special", bn: 'শেফের বিশেষ' },
  new: { en: 'New', bn: 'নতুন' },
  season: { en: 'Winter special', bn: 'শীতের বিশেষ' },
};

export const deepMerge = (a, b) => {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
  const out = { ...(a && typeof a === 'object' && !Array.isArray(a) ? a : {}) };
  for (const k of Object.keys(b)) out[k] = deepMerge(out[k], b[k]);
  return out;
};

export const csvEscape = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
