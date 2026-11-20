// Menu templates, sample Bangladeshi restaurants, quiz bank and a demo-history generator.
import { uid, pick, computeBill, dayStart, unitPrice } from './util.js';

const I = (id, cat, en, bn, price, o = {}) => ({
  id,
  cat,
  name: { en, bn },
  desc: { en: o.d || '', bn: o.db || '' },
  price,
  half: o.half || null,
  icon: o.icon || '🍽️',
  veg: !!o.veg,
  spice: !!o.spice,
  allergens: o.al || [],
  tags: o.tags || [],
  deal: o.deal || null,
  available: o.available !== false,
  prep: o.prep || 12,
});

const C = (id, en, bn, station) => ({ id, name: { en, bn }, station });
const S = (id, en, bn) => ({ id, name: { en, bn } });

// ---------- Menu templates (used by the new-restaurant wizard) ----------
export const TEMPLATES = {
  biryani: {
    label: 'Biryani & Mughlai house',
    stations: [S('handi', 'Handi', 'হাঁড়ি'), S('grill', 'Grill & Kabab', 'গ্রিল ও কাবাব'), S('bar', 'Drinks & Dessert', 'পানীয় ও মিষ্টি')],
    categories: [
      C('biryani', 'Biryani & Polao', 'বিরিয়ানি ও পোলাও', 'handi'),
      C('kabab', 'Kabab & Roast', 'কাবাব ও রোস্ট', 'grill'),
      C('sides', 'Sides', 'সাইড', 'handi'),
      C('drinks', 'Drinks', 'পানীয়', 'bar'),
      C('dessert', 'Dessert', 'মিষ্টি', 'bar'),
    ],
    items: [
      I('kacchi', 'biryani', 'Mutton Kacchi Biryani', 'মাটন কাচ্চি বিরিয়ানি', 520, { half: 320, icon: '🍛', spice: true, al: ['dairy', 'nuts'], tags: ['best'], d: 'Old Dhaka style, slow-cooked with aloo and borhani on the side', db: 'পুরান ঢাকার স্টাইলে দমে রান্না, সাথে আলু', deal: { itemId: 'borhani', price: 60 }, prep: 8 }),
      I('tehari', 'biryani', 'Beef Tehari', 'গরুর তেহারি', 280, { half: 180, icon: '🍛', spice: true, al: ['dairy'], d: 'Mustard-oil tehari with tender beef cubes', db: 'সরিষার তেলে রান্না নরম গরুর মাংসের তেহারি', deal: { itemId: 'borhani', price: 60 }, prep: 8 }),
      I('polao', 'biryani', 'Morog Polao', 'মোরগ পোলাও', 350, { half: 220, icon: '🍗', al: ['dairy', 'nuts'], tags: ['chef'], d: 'Fragrant chinigura rice with a whole chicken leg', db: 'চিনিগুঁড়া চালের পোলাও, সাথে মুরগির রান', prep: 10 }),
      I('roast', 'kabab', 'Chicken Roast', 'চিকেন রোস্ট', 220, { icon: '🍗', al: ['dairy', 'nuts'], d: 'Wedding-style sweet and rich roast', db: 'বিয়েবাড়ির স্টাইলে রোস্ট', prep: 12 }),
      I('jali', 'kabab', 'Jali Kabab', 'জালি কাবাব', 90, { icon: '🥙', al: ['egg'], d: 'Minced beef patty in a lace of egg', db: 'ডিমের জালিতে মোড়া কিমার কাবাব', prep: 10 }),
      I('tikka', 'kabab', 'Chicken Tikka Kabab', 'চিকেন টিক্কা কাবাব', 260, { icon: '🍢', spice: true, al: ['dairy'], d: 'Charcoal-grilled, yogurt marinated', db: 'কয়লার আগুনে গ্রিল করা', prep: 15 }),
      I('salad', 'sides', 'Green Salad', 'সালাদ', 60, { icon: '🥗', veg: true, prep: 3 }),
      I('egg', 'sides', 'Egg Korma', 'ডিমের কোরমা', 70, { icon: '🥚', al: ['egg', 'dairy'], prep: 5 }),
      I('borhani', 'drinks', 'Borhani', 'বোরহানি', 80, { icon: '🥛', veg: true, al: ['dairy'], tags: ['best'], d: 'Spiced yogurt drink with mint', db: 'পুদিনা দেওয়া মসলাদার দইয়ের পানীয়', prep: 2 }),
      I('lassi', 'drinks', 'Sweet Lassi', 'মিষ্টি লাচ্ছি', 120, { icon: '🥤', veg: true, al: ['dairy'], prep: 3 }),
      I('water', 'drinks', 'Mineral Water 500ml', 'মিনারেল ওয়াটার ৫০০মিলি', 30, { icon: '💧', veg: true, prep: 1 }),
      I('firni', 'dessert', 'Firni', 'ফিরনি', 70, { icon: '🍮', veg: true, al: ['dairy', 'nuts'], prep: 2 }),
      I('shahi', 'dessert', 'Shahi Tukra', 'শাহী টুকরা', 140, { icon: '🍞', veg: true, al: ['dairy', 'nuts', 'gluten'], tags: ['chef'], prep: 4 }),
      I('jorda', 'dessert', 'Jorda', 'জর্দা', 90, { icon: '🍚', veg: true, al: ['nuts'], prep: 2 }),
    ],
  },
  deshi: {
    label: 'Bangladeshi home-style',
    stations: [S('curry', 'Curry', 'তরকারি'), S('bhorta', 'Bhorta & Bhaji', 'ভর্তা ও ভাজি'), S('bar', 'Drinks & Sweets', 'পানীয় ও মিষ্টি')],
    categories: [
      C('rice', 'Rice & Khichuri', 'ভাত ও খিচুড়ি', 'curry'),
      C('fish', 'Fish & Meat', 'মাছ ও মাংস', 'curry'),
      C('bhorta', 'Bhorta & Bhaji', 'ভর্তা ও ভাজি', 'bhorta'),
      C('snacks', 'Snacks', 'নাস্তা', 'bhorta'),
      C('drinks', 'Drinks & Sweets', 'পানীয় ও মিষ্টি', 'bar'),
    ],
    items: [
      I('khichuri', 'rice', 'Bhuna Khichuri', 'ভুনা খিচুড়ি', 260, { half: 160, icon: '🍲', spice: true, tags: ['best'], d: 'Rainy-day khichuri with beef bhuna', db: 'গরুর মাংস ভুনা দিয়ে খিচুড়ি', deal: { itemId: 'begun', price: 50 }, prep: 10 }),
      I('rice', 'rice', 'Plain Rice', 'সাদা ভাত', 40, { icon: '🍚', veg: true, prep: 2 }),
      I('ilish', 'fish', 'Shorshe Ilish', 'সর্ষে ইলিশ', 650, { icon: '🐟', spice: true, al: ['fish'], tags: ['chef'], d: 'Hilsa steamed in mustard paste', db: 'সরিষা বাটায় ভাপানো পদ্মার ইলিশ', deal: { itemId: 'rice', price: 30 }, prep: 18 }),
      I('kalabhuna', 'fish', 'Beef Kala Bhuna', 'গরুর কালা ভুনা', 380, { icon: '🥘', spice: true, tags: ['best'], d: 'Chattogram-style dark, slow-fried beef', db: 'চট্টগ্রামের স্টাইলে কালা ভুনা', deal: { itemId: 'paratha', price: 20 }, prep: 12 }),
      I('jhol', 'fish', 'Chicken Jhol', 'মুরগির ঝোল', 280, { icon: '🍛', spice: true, d: 'Light home-style curry with potato', db: 'আলু দিয়ে হালকা ঝোল', prep: 12 }),
      I('dal', 'bhorta', 'Dal', 'ডাল', 80, { icon: '🥣', veg: true, prep: 3 }),
      I('bhorta', 'bhorta', 'Bhorta Platter (5 kinds)', 'ভর্তা প্লাটার (৫ পদ)', 220, { icon: '🫕', veg: true, spice: true, al: ['fish'], tags: ['best'], d: 'Aloo, begun, shutki, dal and tomato bhorta', db: 'আলু, বেগুন, শুঁটকি, ডাল ও টমেটো ভর্তা', prep: 6 }),
      I('begun', 'bhorta', 'Begun Bhaja', 'বেগুন ভাজা', 70, { icon: '🍆', veg: true, prep: 6 }),
      I('paratha', 'snacks', 'Paratha', 'পরোটা', 25, { icon: '🫓', veg: true, al: ['gluten'], prep: 5 }),
      I('fuchka', 'snacks', 'Fuchka (8 pcs)', 'ফুচকা (৮ পিস)', 120, { icon: '🥟', veg: true, spice: true, al: ['gluten'], prep: 6 }),
      I('pitha', 'snacks', 'Winter Pitha Platter', 'শীতের পিঠা প্লাটার', 180, { icon: '🥞', veg: true, al: ['dairy', 'gluten'], tags: ['season'], d: 'Bhapa, chitoi and patishapta with khejur gur', db: 'খেজুর গুড়ে ভাপা, চিতই ও পাটিসাপটা', prep: 10 }),
      I('cha', 'drinks', 'Lebu Cha', 'লেবু চা', 30, { icon: '🍵', veg: true, prep: 2 }),
      I('doi', 'drinks', 'Mishti Doi', 'মিষ্টি দই', 90, { icon: '🍯', veg: true, al: ['dairy'], d: 'Bogura-style clay pot doi', db: 'বগুড়ার মাটির হাঁড়ির দই', prep: 1 }),
      I('mango', 'drinks', 'Mango Lassi', 'ম্যাঙ্গো লাচ্ছি', 140, { icon: '🥭', veg: true, al: ['dairy'], prep: 3 }),
    ],
  },
  cafe: {
    label: 'Café & fast food',
    stations: [S('grill', 'Grill', 'গ্রিল'), S('fry', 'Fryer & Pasta', 'ফ্রায়ার ও পাস্তা'), S('coffee', 'Coffee bar', 'কফি বার')],
    categories: [
      C('burgers', 'Burgers & Wraps', 'বার্গার ও র‍্যাপ', 'grill'),
      C('mains', 'Mains & Sides', 'মেইন ও সাইড', 'fry'),
      C('coffee', 'Coffee & Drinks', 'কফি ও পানীয়', 'coffee'),
      C('dessert', 'Dessert', 'ডেজার্ট', 'coffee'),
    ],
    items: [
      I('beefburger', 'burgers', 'Classic Beef Burger', 'ক্লাসিক বিফ বার্গার', 390, { icon: '🍔', al: ['gluten', 'dairy', 'egg'], tags: ['best'], d: '150g beef patty, cheddar, caramelised onion', db: '১৫০ গ্রাম বিফ প্যাটি, চেডার চিজ', deal: { itemId: 'fries', price: 100 }, prep: 12 }),
      I('chickburger', 'burgers', 'Spicy Chicken Burger', 'স্পাইসি চিকেন বার্গার', 340, { icon: '🍔', spice: true, al: ['gluten', 'egg'], deal: { itemId: 'fries', price: 100 }, prep: 12 }),
      I('shawarma', 'burgers', 'Chicken Shawarma', 'চিকেন শর্মা', 220, { icon: '🌯', spice: true, al: ['gluten', 'sesame'], prep: 8 }),
      I('wings', 'mains', 'Chicken Wings (6 pcs)', 'চিকেন উইংস (৬ পিস)', 320, { icon: '🍗', spice: true, tags: ['best'], prep: 14 }),
      I('fries', 'mains', 'French Fries', 'ফ্রেঞ্চ ফ্রাই', 160, { icon: '🍟', veg: true, prep: 7 }),
      I('pasta', 'mains', 'Chicken Alfredo Pasta', 'চিকেন আলফ্রেডো পাস্তা', 420, { icon: '🍝', al: ['dairy', 'gluten'], tags: ['chef'], prep: 15 }),
      I('club', 'mains', 'Club Sandwich', 'ক্লাব স্যান্ডউইচ', 290, { icon: '🥪', al: ['gluten', 'egg'], prep: 9 }),
      I('coldcoffee', 'coffee', 'Cold Coffee', 'কোল্ড কফি', 220, { icon: '🧋', veg: true, al: ['dairy'], tags: ['best'], prep: 4 }),
      I('cappuccino', 'coffee', 'Cappuccino', 'ক্যাপুচিনো', 250, { icon: '☕', veg: true, al: ['dairy'], prep: 4 }),
      I('lemonade', 'coffee', 'Mint Lemonade', 'মিন্ট লেমোনেড', 180, { icon: '🍋', veg: true, prep: 3 }),
      I('brownie', 'dessert', 'Chocolate Brownie', 'চকলেট ব্রাউনি', 180, { icon: '🍫', veg: true, al: ['gluten', 'dairy', 'egg', 'nuts'], prep: 3 }),
    ],
  },
  chinese: {
    label: 'Chinese & Thai',
    stations: [S('wok', 'Wok', 'ওক'), S('soup', 'Soup & Starter', 'স্যুপ ও স্টার্টার'), S('bar', 'Drinks', 'পানীয়')],
    categories: [
      C('soup', 'Soup', 'স্যুপ', 'soup'),
      C('starter', 'Starters', 'স্টার্টার', 'soup'),
      C('rice', 'Rice & Noodles', 'রাইস ও নুডলস', 'wok'),
      C('mains', 'Chicken, Beef & Prawn', 'চিকেন, বিফ ও চিংড়ি', 'wok'),
      C('drinks', 'Drinks', 'পানীয়', 'bar'),
    ],
    items: [
      I('thaisoup', 'soup', 'Thai Soup (clear)', 'থাই স্যুপ', 380, { half: 220, icon: '🍜', spice: true, al: ['shellfish', 'fish'], tags: ['best'], prep: 10 }),
      I('cornsoup', 'soup', 'Chicken Corn Soup', 'চিকেন কর্ন স্যুপ', 320, { half: 190, icon: '🥣', al: ['egg'], prep: 10 }),
      I('wonton', 'starter', 'Fried Wonton (8 pcs)', 'ফ্রাইড অন্থন', 260, { icon: '🥟', al: ['gluten', 'shellfish'], prep: 9 }),
      I('tempura', 'starter', 'Prawn Tempura', 'প্রন টেম্পুরা', 450, { icon: '🍤', al: ['shellfish', 'gluten', 'egg'], tags: ['chef'], prep: 10 }),
      I('friedrice', 'rice', 'Chicken Fried Rice', 'চিকেন ফ্রাইড রাইস', 300, { half: 180, icon: '🍚', al: ['egg', 'soy'], prep: 8 }),
      I('chowmein', 'rice', 'Chicken Chowmein', 'চিকেন চাওমিন', 320, { half: 190, icon: '🍝', al: ['gluten', 'soy', 'egg'], prep: 8 }),
      I('chilichicken', 'mains', 'Chili Chicken', 'চিলি চিকেন', 420, { icon: '🌶️', spice: true, al: ['soy'], tags: ['best'], prep: 12 }),
      I('beefonion', 'mains', 'Beef Chili Onion', 'বিফ চিলি অনিয়ন', 460, { icon: '🥩', spice: true, al: ['soy'], prep: 12 }),
      I('veg', 'mains', 'Mixed Vegetable', 'মিক্সড ভেজিটেবল', 280, { icon: '🥦', veg: true, al: ['soy'], prep: 8 }),
      I('softdrink', 'drinks', 'Soft Drink', 'সফট ড্রিংক', 50, { icon: '🥤', veg: true, prep: 1 }),
      I('juice', 'drinks', 'Fresh Lime Juice', 'ফ্রেশ লাইম জুস', 120, { icon: '🍋', veg: true, prep: 3 }),
    ],
  },
  blank: {
    label: 'Start empty',
    stations: [S('kitchen', 'Kitchen', 'রান্নাঘর'), S('bar', 'Drinks', 'পানীয়')],
    categories: [C('mains', 'Mains', 'মেইন', 'kitchen'), C('drinks', 'Drinks', 'পানীয়', 'bar')],
    items: [],
  },
};

const clone = (o) => JSON.parse(JSON.stringify(o));

export const DEFAULT_PAYMENTS = () => ({
  bkash: { on: true, number: '01711-000000' },
  nagad: { on: true, number: '01811-000000' },
  rocket: { on: true, number: '01911-0000000' },
  card: { on: true, gateway: 'SSLCommerz' },
  banglaqr: { on: true },
  bank: { on: false, bank: 'Dutch-Bangla Bank', account: '' },
  cash: { on: true },
});

export const makeTables = (sections) => {
  const tables = [];
  sections.forEach((s) => {
    for (let i = 1; i <= s.count; i++) {
      const label = (s.prefix || 'T') + (s.start ? s.start + i - 1 : i);
      tables.push({ id: label.toLowerCase().replace(/[^a-z0-9]/g, ''), label, seats: s.seats || 4, section: s.id });
    }
  });
  return tables;
};

export function newRestaurant(p) {
  const tpl = clone(TEMPLATES[p.template || 'blank']);
  const sections = p.sections || [{ id: 'main', name: 'Main hall', prefix: 'T', count: 6, seats: 4 }];
  return {
    id: p.id,
    name: p.name,
    tagline: p.tagline || { en: '', bn: '' },
    cuisine: p.cuisine || tpl.label,
    city: p.city || 'Dhaka',
    area: p.area || '',
    address: p.address || '',
    phone: p.phone || '',
    bin: p.bin || '',
    brand: p.brand || '#0E4D3A',
    logoText: p.logoText || (p.name?.en || 'R').slice(0, 1),
    plan: p.plan || 'growth',
    status: p.status || 'trial',
    createdAt: p.createdAt || Date.now(),
    trialEnds: p.trialEnds || Date.now() + 14 * 864e5,
    tax: p.tax || { vat: 5, sc: 0, inclusive: false },
    stations: tpl.stations,
    categories: tpl.categories,
    items: tpl.items,
    sections: sections.map(({ id, name }) => ({ id, name })),
    tables: makeTables(sections),
    staff: p.staff || [],
    payments: p.payments || DEFAULT_PAYMENTS(),
    wifi: p.wifi || { ssid: '', password: '' },
    features: p.features || { autoKitchen: false, games: true, tableOrdering: true, takeaway: true, delivery: true },
    online: p.online || { packaging: 20, minOrder: 300, cod: true, zones: [] },
    prepTarget: p.prepTarget || 15,
    demo: !!p.demo,
  };
}

// ---------- Sample restaurants ----------
export function sampleRestaurants(now = Date.now()) {
  const kacchi = newRestaurant({
    id: 'kacchighor',
    demo: true,
    template: 'biryani',
    name: { en: 'Kacchi Ghor', bn: 'কাচ্চি ঘর' },
    tagline: { en: 'Old Dhaka biryani, since 1998', bn: '১৯৯৮ থেকে পুরান ঢাকার বিরিয়ানি' },
    city: 'Dhaka',
    area: 'Dhanmondi',
    address: 'House 32, Road 27 (old), Dhanmondi, Dhaka 1209',
    phone: '01700-112233',
    bin: '000123456-0101',
    brand: '#8A1C2B',
    logoText: 'K',
    plan: 'growth',
    status: 'active',
    createdAt: now - 120 * 864e5,
    sections: [
      { id: 'ground', name: 'Ground floor', prefix: 'T', count: 6, seats: 4 },
      { id: 'cabin', name: 'Family cabins', prefix: 'C', count: 2, seats: 8 },
    ],
    tax: { vat: 5, sc: 0, inclusive: false },
    staff: [
      { id: 's1', name: 'Rahim', role: 'waiter', section: 'ground' },
      { id: 's2', name: 'Karim', role: 'waiter', section: 'cabin' },
      { id: 's3', name: 'Ustad Jalal', role: 'kitchen', section: '' },
      { id: 's4', name: 'Shila', role: 'cashier', section: '' },
      { id: 's5', name: 'Babul', role: 'rider', section: '' },
    ],
    wifi: { ssid: 'KacchiGhor_Guest', password: 'biryani2026' },
    online: {
      packaging: 20, minOrder: 300, cod: true,
      zones: [
        { id: 'z1', name: 'Dhanmondi', fee: 40, eta: 30 },
        { id: 'z2', name: 'Lalmatia', fee: 50, eta: 35 },
        { id: 'z3', name: 'Mohammadpur', fee: 60, eta: 45 },
        { id: 'z4', name: 'Kalabagan', fee: 50, eta: 35 },
      ],
    },
    prepTarget: 12,
  });
  const nouka = newRestaurant({
    id: 'nouka',
    demo: true,
    template: 'deshi',
    name: { en: 'Nouka Deshi Kitchen', bn: 'নৌকা দেশি কিচেন' },
    tagline: { en: 'Home-style Bangladeshi food', bn: 'ঘরোয়া স্বাদের বাংলা খাবার' },
    city: 'Dhaka',
    area: 'Gulshan 2',
    address: 'Plot 14, Road 55, Gulshan 2, Dhaka 1212',
    phone: '01800-445566',
    bin: '000987654-0202',
    brand: '#0F5C4A',
    logoText: 'N',
    plan: 'pro',
    status: 'active',
    createdAt: now - 60 * 864e5,
    sections: [
      { id: 'hall', name: 'Main hall', prefix: 'T', count: 6, seats: 4 },
      { id: 'roof', name: 'Rooftop', prefix: 'R', count: 4, seats: 6 },
    ],
    tax: { vat: 5, sc: 5, inclusive: false },
    staff: [
      { id: 's1', name: 'Shuvo', role: 'waiter', section: 'hall' },
      { id: 's2', name: 'Mitu', role: 'waiter', section: 'roof' },
      { id: 's3', name: 'Bilkis Apa', role: 'kitchen', section: '' },
      { id: 's4', name: 'Arif', role: 'manager', section: '' },
      { id: 's5', name: 'Sohel', role: 'rider', section: '' },
    ],
    wifi: { ssid: 'Nouka_Guest', password: 'ilish2026' },
    online: {
      packaging: 25, minOrder: 400, cod: true,
      zones: [
        { id: 'z1', name: 'Gulshan', fee: 50, eta: 35 },
        { id: 'z2', name: 'Banani', fee: 60, eta: 40 },
        { id: 'z3', name: 'Baridhara', fee: 60, eta: 40 },
        { id: 'z4', name: 'Badda', fee: 80, eta: 50 },
      ],
    },
    prepTarget: 15,
  });
  const rooftop = newRestaurant({
    id: 'rooftopbites',
    demo: true,
    template: 'cafe',
    name: { en: 'Rooftop Bites Café', bn: 'রুফটপ বাইটস ক্যাফে' },
    tagline: { en: 'Burgers and coffee above GEC Circle', bn: 'জিইসি মোড়ের ছাদে বার্গার আর কফি' },
    city: 'Chattogram',
    area: 'GEC Circle',
    address: 'Level 9, Central Plaza, GEC Circle, Chattogram 4000',
    phone: '01900-778899',
    bin: '',
    brand: '#C2410C',
    logoText: 'R',
    plan: 'starter',
    status: 'trial',
    createdAt: now - 5 * 864e5,
    trialEnds: now + 9 * 864e5,
    sections: [{ id: 'roof', name: 'Rooftop', prefix: 'T', count: 6, seats: 4 }],
    tax: { vat: 5, sc: 0, inclusive: true },
    staff: [
      { id: 's1', name: 'Tanvir', role: 'waiter', section: 'roof' },
      { id: 's2', name: 'Joy', role: 'kitchen', section: '' },
    ],
    payments: { ...DEFAULT_PAYMENTS(), rocket: { on: false, number: '' } },
    wifi: { ssid: 'RooftopBites', password: 'coldcoffee' },
    features: { autoKitchen: true, games: true, tableOrdering: true, takeaway: true, delivery: false },
    online: { packaging: 15, minOrder: 200, cod: true, zones: [] },
    prepTarget: 12,
  });
  return [kacchi, nouka, rooftop];
}

export const PLATFORM_DEFAULT = {
  name: 'Thali',
  tagline: 'QR ordering & restaurant OS for Bangladesh',
  baseUrl: '',
  support: '09600-000000',
  plans: [
    { id: 'starter', name: 'Starter', price: 1500, tables: 10, features: ['QR table ordering', 'Kitchen display', 'Bangla + English menu', 'bKash / Nagad / card payments'] },
    { id: 'growth', name: 'Growth', price: 3500, tables: 30, features: ['Everything in Starter', 'Takeaway & delivery ordering', 'Bill split and tips', 'Sales & VAT reports'] },
    { id: 'pro', name: 'Pro', price: 7000, tables: 999, features: ['Everything in Growth', 'Unlimited tables', 'Multi-branch overview', 'Priority support'] },
  ],
};

// ---------- Quiz bank (table vs table game) ----------
export const QUIZ = [
  { q: { en: 'What is the national fish of Bangladesh?', bn: 'বাংলাদেশের জাতীয় মাছ কোনটি?' }, a: [{ en: 'Ilish (Hilsa)', bn: 'ইলিশ' }, { en: 'Rui', bn: 'রুই' }, { en: 'Pangas', bn: 'পাঙ্গাস' }], c: 0 },
  { q: { en: 'Kacchi biryani is most famously linked to…', bn: 'কাচ্চি বিরিয়ানি সবচেয়ে বিখ্যাত কোথায়?' }, a: [{ en: 'Old Dhaka', bn: 'পুরান ঢাকা' }, { en: 'Sylhet', bn: 'সিলেট' }, { en: 'Khulna', bn: 'খুলনা' }], c: 0 },
  { q: { en: 'Borhani is mainly made from…', bn: 'বোরহানি মূলত কী দিয়ে তৈরি?' }, a: [{ en: 'Milk tea', bn: 'দুধ চা' }, { en: 'Yogurt', bn: 'দই' }, { en: 'Coconut water', bn: 'ডাবের পানি' }], c: 1 },
  { q: { en: 'Which district is famous for mishti doi?', bn: 'মিষ্টি দইয়ের জন্য বিখ্যাত কোন জেলা?' }, a: [{ en: 'Bogura', bn: 'বগুড়া' }, { en: 'Cox’s Bazar', bn: 'কক্সবাজার' }, { en: 'Rangpur', bn: 'রংপুর' }], c: 0 },
  { q: { en: 'Which town is called the tea capital of Bangladesh?', bn: 'বাংলাদেশের চায়ের রাজধানী কোনটি?' }, a: [{ en: 'Sreemangal', bn: 'শ্রীমঙ্গল' }, { en: 'Rajshahi', bn: 'রাজশাহী' }, { en: 'Barishal', bn: 'বরিশাল' }], c: 0 },
  { q: { en: 'Bhapa and chitoi pitha are most popular in…', bn: 'ভাপা আর চিতই পিঠা কোন ঋতুতে বেশি জনপ্রিয়?' }, a: [{ en: 'Summer', bn: 'গ্রীষ্ম' }, { en: 'Monsoon', bn: 'বর্ষা' }, { en: 'Winter', bn: 'শীত' }], c: 2 },
  { q: { en: 'Mezban beef is a tradition of which region?', bn: 'মেজবানি মাংস কোন অঞ্চলের ঐতিহ্য?' }, a: [{ en: 'Chattogram', bn: 'চট্টগ্রাম' }, { en: 'Mymensingh', bn: 'ময়মনসিংহ' }, { en: 'Dinajpur', bn: 'দিনাজপুর' }], c: 0 },
  { q: { en: 'Which district is known for its sweet mangoes?', bn: 'আমের জন্য বিখ্যাত কোন জেলা?' }, a: [{ en: 'Chapainawabganj', bn: 'চাঁপাইনবাবগঞ্জ' }, { en: 'Bhola', bn: 'ভোলা' }, { en: 'Feni', bn: 'ফেনী' }], c: 0 },
  { q: { en: 'Shutki is…', bn: 'শুঁটকি হলো…' }, a: [{ en: 'Dried fish', bn: 'শুকনো মাছ' }, { en: 'A sweet', bn: 'একটি মিষ্টি' }, { en: 'Rice flour', bn: 'চালের গুঁড়া' }], c: 0 },
  { q: { en: 'Khejur gur comes from which tree?', bn: 'খেজুর গুড় কোন গাছ থেকে আসে?' }, a: [{ en: 'Coconut', bn: 'নারকেল' }, { en: 'Date palm', bn: 'খেজুর' }, { en: 'Palmyra', bn: 'তাল' }], c: 1 },
  { q: { en: 'Which is a famous sweet from Natore?', bn: 'নাটোরের বিখ্যাত মিষ্টি কোনটি?' }, a: [{ en: 'Kancha golla', bn: 'কাঁচাগোল্লা' }, { en: 'Chomchom', bn: 'চমচম' }, { en: 'Rosogolla', bn: 'রসগোল্লা' }], c: 0 },
  { q: { en: 'Porabari in Tangail is famous for…', bn: 'টাঙ্গাইলের পোড়াবাড়ি বিখ্যাত…' }, a: [{ en: 'Chomchom', bn: 'চমচম' }, { en: 'Biryani', bn: 'বিরিয়ানি' }, { en: 'Tea', bn: 'চা' }], c: 0 },
];

export const GUEST_NAMES = ['Aman', 'Riya', 'Tanvir', 'Nusrat', 'Rafi', 'Sadia', 'Imran', 'Farhana', 'Arif', 'Mitu', 'Sabbir', 'Tania', 'Shuvo', 'Nabila', 'Rakib', 'Jannat', 'Fahim', 'Sumaiya'];

// ---------- Demo sales history ----------
// Produces closed table sessions + their orders + completed online orders across the last few days.
export function makeLine(r, item, qty, size, guest) {
  const cat = r.categories.find((c) => c.id === item.cat);
  return {
    key: uid('l'),
    itemId: item.id,
    name: item.name,
    icon: item.icon,
    qty,
    size: item.half ? size : 'full',
    spice: item.spice ? 1 : null,
    note: '',
    unit: unitPrice(item, size),
    station: cat?.station || r.stations[0]?.id,
    guest: guest || '',
  };
}

export function randomLines(r, n, guests) {
  const avail = r.items.filter((i) => i.available);
  const lines = [];
  for (let k = 0; k < n && avail.length; k++) {
    const item = pick(avail);
    const size = item.half && Math.random() < 0.35 ? 'half' : 'full';
    const ex = lines.find((l) => l.itemId === item.id && l.size === size);
    if (ex) ex.qty += 1;
    else lines.push(makeLine(r, item, 1 + (Math.random() < 0.25 ? 1 : 0), size, guests ? pick(guests) : ''));
  }
  return lines;
}

const METHOD_WEIGHTS = [['bkash', 34], ['cash', 30], ['card', 16], ['nagad', 12], ['rocket', 4], ['banglaqr', 4]];
const pickMethod = (r) => {
  const enabled = METHOD_WEIGHTS.filter(([m]) => r.payments?.[m]?.on);
  const tot = enabled.reduce((a, [, w]) => a + w, 0);
  let x = Math.random() * tot;
  for (const [m, w] of enabled) { if ((x -= w) <= 0) return m; }
  return 'cash';
};

export function historyFor(r, days = 3, perDay = 6, now = Date.now()) {
  const docs = { sessions: [], orders: [] };
  const hours = [12, 13, 13, 14, 15, 17, 19, 20, 20, 21, 21, 22];
  for (let d = 0; d < days; d++) {
    const base = dayStart(now) - d * 864e5;
    for (let k = 0; k < perDay; k++) {
      const h = pick(hours);
      const t = base + h * 3600e3 + Math.floor(Math.random() * 55) * 60e3;
      if (t > now - 30 * 60e3) continue;
      const table = pick(r.tables);
      const guests = [pick(GUEST_NAMES), pick(GUEST_NAMES)].filter((v, i, a) => a.indexOf(v) === i);
      const lines = randomLines(r, 2 + Math.floor(Math.random() * 4), guests);
      const sub = lines.reduce((a, l) => a + l.unit * l.qty, 0);
      const tipPct = pick([0, 0, 0, 5, 10]);
      const bill = computeBill(r, sub, { tipPct });
      const method = pickMethod(r);
      const sid = uid('s');
      const oid = uid('o');
      const done = Object.fromEntries(lines.map((l) => [l.key, t + 12 * 60e3]));
      docs.orders.push({
        id: oid, rid: r.id, no: 100 + Math.floor(Math.random() * 900), channel: 'dine', tableId: table.id, sessionId: sid, round: 1,
        items: lines, done, status: 'served', createdAt: t, sentAt: t + 60e3, readyAt: t + 13 * 60e3, servedAt: t + 15 * 60e3,
      });
      docs.sessions.push({
        id: sid, rid: r.id, tableId: table.id, status: 'closed', guests, openedAt: t - 5 * 60e3, paidAt: t + 55 * 60e3, closedAt: t + 60 * 60e3,
        bill, paidBy: { [method]: bill.total }, invoiceNo: 'INV-' + String(t).slice(-6), quiz: { score: Math.floor(Math.random() * 5) },
      });
    }
    // online orders
    const online = r.features.takeaway ? Math.max(1, Math.floor(perDay / 3)) : 0;
    for (let k = 0; k < online; k++) {
      const t = base + pick([13, 14, 19, 20, 21]) * 3600e3 + Math.floor(Math.random() * 55) * 60e3;
      if (t > now - 30 * 60e3) continue;
      const delivery = r.features.delivery && r.online.zones.length && Math.random() < 0.6;
      const zone = delivery ? pick(r.online.zones) : null;
      const lines = randomLines(r, 2 + Math.floor(Math.random() * 3));
      const sub = lines.reduce((a, l) => a + l.unit * l.qty, 0);
      const bill = computeBill(r, sub, { packaging: r.online.packaging, delivery: zone ? zone.fee : 0 });
      const method = Math.random() < 0.45 ? 'cash' : pickMethod(r);
      docs.orders.push({
        id: uid('o'), rid: r.id, no: 1000 + Math.floor(Math.random() * 9000), channel: delivery ? 'delivery' : 'takeaway', round: 1,
        items: lines, done: Object.fromEntries(lines.map((l) => [l.key, t + 15 * 60e3])), status: 'completed',
        createdAt: t, sentAt: t + 2 * 60e3, readyAt: t + 18 * 60e3, completedAt: t + (delivery ? 50 : 22) * 60e3,
        customer: { name: pick(GUEST_NAMES), phone: '01' + (7 + Math.floor(Math.random() * 3)) + String(Math.floor(1e7 + Math.random() * 9e7)).slice(0, 8), address: delivery ? 'House 12, Road 4' : '', zone: zone ? zone.id : '' },
        bill, payment: { method, status: 'paid', paidAt: t + (delivery ? 50 : 22) * 60e3 },
      });
    }
  }
  return docs;
}

export function sampleReviews(r, now = Date.now()) {
  const comments = [
    'Kacchi was perfect, ordering from the phone was so easy.',
    'Food came fast. Loved paying with bKash at the table.',
    'Great taste, a bit crowded tonight.',
    'Split the bill with friends in seconds!',
    'খাবার অসাধারণ, সার্ভিসও দ্রুত।',
    'Waiter came right away when we pressed the button.',
  ];
  return Array.from({ length: 5 }, (_, i) => ({
    id: uid('v'), rid: r.id, stars: pick([5, 5, 4, 4, 5, 3]), tags: [pick(['Tasty food', 'Fast service', 'Friendly staff', 'Good value'])],
    comment: pick(comments), guest: pick(GUEST_NAMES), tableId: pick(r.tables).id, createdAt: now - (i * 7 + 2) * 3600e3,
  }));
}
