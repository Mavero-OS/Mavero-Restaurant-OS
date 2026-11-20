// Live demo: guest phone + staff tablet + kitchen display side by side, with a guest simulator for the other tables.
import { useState, useEffect, useRef } from './hooks.js';
import { Ic, Btn, Toggle, PhoneFrame, Empty } from './ui.js';
import { toast } from './store.js';
import { LIVE } from './backend.js';
import { pick, sumLines, computeBill } from './util.js';
import * as A from './actions.js';
import { GUEST_NAMES, randomLines } from './seed.js';
import { CustomerApp } from './customer.js';
import { OnlineApp } from './online.js';
import { StaffApp } from './staff.js';
import { KitchenApp } from './kitchen.js';

// One simulated step across the restaurant (except the table the presenter is using)
export function simStep(r, skip) {
  const now = Date.now();
  const age = (t) => now - (t || now);
  const acts = [];
  const sessions = A.openSessions(r.id).filter((s) => s.tableId !== skip);
  const orders = A.ordersFor(r.id).filter((o) => o.tableId !== skip || o.channel !== 'dine');
  const reqs = A.requestsFor(r.id).filter((q) => q.status !== 'done' && q.tableId !== skip);
  const pays = A.paymentsFor(r.id).filter((p) => p.status === 'pending' && p.tableId !== skip);

  pays.filter((p) => age(p.createdAt) > 5000).forEach((p) => acts.push([9, () => A.confirmPayment(p.id, 'Shila')]));
  reqs.filter((q) => q.status === 'open' && age(q.createdAt) > 6000).forEach((q) => acts.push([8, () => A.ackRequest(q.id, pick(r.staff.filter((s) => s.role === 'waiter')).name || 'Staff')]));
  reqs.filter((q) => q.status === 'ack' && q.type !== 'bill' && age(q.ackAt) > 6000).forEach((q) => acts.push([8, () => A.doneRequest(q.id)]));
  orders.filter((o) => o.status === 'new' && o.channel === 'dine' && age(o.createdAt) > 5000).forEach((o) => acts.push([7, () => A.sendToKitchen(o.id)]));
  orders.filter((o) => o.status === 'new' && o.channel !== 'dine' && age(o.createdAt) > 6000).forEach((o) => acts.push([7, () => A.acceptOrder(o.id)]));
  orders.filter((o) => o.status === 'kitchen' && age(o.sentAt) > 7000).forEach((o) => {
    const left = o.items.filter((li) => !(o.done && o.done[li.key]));
    if (left.length) acts.push([6, () => A.bumpLine(o.id, pick(left).key, true)]);
  });
  orders.filter((o) => o.status === 'ready' && age(o.readyAt) > 5000).forEach((o) => {
    if (o.channel === 'dine') acts.push([6, () => A.markServed(o.id)]);
    else if (o.channel === 'takeaway') acts.push([5, () => A.completeOnline(o.id)]);
    else acts.push([5, () => A.dispatchOrder(o.id, pick(r.staff.filter((s) => s.role === 'rider'))?.name || 'Rider')]);
  });
  orders.filter((o) => o.status === 'out' && age(o.outAt) > 12000).forEach((o) => acts.push([5, () => A.completeOnline(o.id)]));

  sessions.forEach((s) => {
    const so = A.sessionOrders(s.id).filter((o) => o.status !== 'cancelled');
    if (s.status === 'paid') {
      if (age(s.paidAt) > 6000)
        acts.push([4, () => {
          if (Math.random() < 0.6) A.submitReview(r.id, { stars: pick([5, 5, 4, 4, 3]), tags: [pick(['Tasty food', 'Fast service', 'Friendly staff', 'Good value'])], comment: '', sessionId: s.id, tableId: s.tableId, guest: (s.guests || [])[0] || '' });
          A.clearTable(s.id);
        }]);
      return;
    }
    if (!so.length && age(s.openedAt) > 5000) {
      acts.push([3, () => A.placeOrder(r.id, { channel: 'dine', sessionId: s.id, tableId: s.tableId, lines: randomLines(r, 2 + Math.floor(Math.random() * 3), s.guests && s.guests.length ? s.guests : null), by: (s.guests || [])[0] || '' })]);
      return;
    }
    const allServed = so.length && so.every((o) => o.status === 'served');
    if (allServed && !s.billRequested) {
      const lastServed = Math.max(...so.map((o) => o.servedAt || 0));
      if (age(lastServed) > 9000) {
        if (Math.random() < 0.35 && !reqs.some((q) => q.sessionId === s.id)) acts.push([2, () => A.callWaiter(r.id, s.id, s.tableId, pick(['water', 'napkins', 'cutlery']), '')]);
        else if (so.length < 2 && Math.random() < 0.25) acts.push([2, () => A.placeOrder(r.id, { channel: 'dine', sessionId: s.id, tableId: s.tableId, lines: randomLines(r, 1, s.guests), by: (s.guests || [])[0] || '' })]);
        else acts.push([2, () => { A.setTip(s.id, pick([0, 0, 5, 10])); A.requestBill(s.id); }]);
      }
    }
    if (s.billRequested && age(s.billAt) > 6000) {
      const { due, pending } = A.sessionBill(r, s);
      if (due > 0 && !pending) {
        const methods = ['bkash', 'cash', 'card', 'nagad', 'bkash', 'banglaqr'].filter((m) => r.payments?.[m]?.on);
        const m = pick(methods.length ? methods : ['cash']);
        acts.push([4, () => A.createPayment(r.id, s.id, { amount: due, method: m, status: m === 'cash' || m === 'banglaqr' ? 'pending' : 'paid', who: (s.guests || [])[0] || 'Guest' })]);
      }
    }
  });

  const free = r.tables.filter((t) => t.id !== skip && !A.openSession(r.id, t.id));
  if (free.length && sessions.length < Math.ceil(r.tables.length * 0.75) && Math.random() < 0.5)
    acts.push([1, () => {
      const t = pick(free);
      const sid = A.startSession(r.id, t.id, pick(GUEST_NAMES));
      if (Math.random() < 0.6) A.startSession(r.id, t.id, pick(GUEST_NAMES));
      return sid;
    }]);
  const onlineLive = orders.filter((o) => o.channel !== 'dine' && ['new', 'kitchen', 'ready', 'out'].includes(o.status)).length;
  if (r.features.takeaway && onlineLive < 2 && Math.random() < 0.12)
    acts.push([1, () => {
      const delivery = r.features.delivery && (r.online.zones || []).length && Math.random() < 0.6;
      const z = delivery ? pick(r.online.zones) : null;
      const lines = randomLines(r, 2 + Math.floor(Math.random() * 2));
      const bill = computeBill(r, sumLines(lines), { packaging: r.online.packaging || 0, delivery: z ? z.fee : 0 });
      const paid = Math.random() < 0.55;
      A.placeOrder(r.id, {
        channel: delivery ? 'delivery' : 'takeaway', lines, bill, zone: z ? z.id : '',
        customer: { name: pick(GUEST_NAMES), phone: '017' + String(Math.floor(1e7 + Math.random() * 8e7)), address: delivery ? 'House 7, Road 3' : '', zone: z ? z.id : '' },
        payment: paid ? { method: pick(['bkash', 'nagad', 'card']), status: 'paid', paidAt: now } : { method: 'cash', status: 'unpaid' },
      });
    }]);

  if (!acts.length) return;
  acts.sort((a, b) => b[0] - a[0]);
  // progress the most urgent flow, plus one random other thing for variety
  acts[0][1]();
  if (acts.length > 2 && Math.random() < 0.6) acts[1 + Math.floor(Math.random() * (acts.length - 1))][1]();
}

const STEPS = [
  ['Scan', 'Open the guest phone: this is what a table QR code shows.'],
  ['Order', 'Add a dish (try Half/Full, spice level and the combo deal), then send the order.'],
  ['Confirm', 'On the staff tablet, tap Send to kitchen.'],
  ['Cook', 'On the kitchen display, tap each dish or Bump. The guest countdown keeps running.'],
  ['Serve', 'Back on the staff tablet, mark the food served.'],
  ['Pay', 'On the phone open Bill: add a tip, split it and pay by bKash, card or cash.'],
  ['Review', 'Leave a rating, then clear the table from the staff tablet.'],
];

function demoStage(r, tid) {
  const s = A.openSession(r.id, tid);
  if (!s) return 0;
  const so = A.sessionOrders(s.id).filter((o) => o.status !== 'cancelled');
  if (s.status === 'paid') return 6;
  if (!so.length) return 1;
  if (so.some((o) => o.status === 'new')) return 2;
  if (so.some((o) => o.status === 'kitchen')) return 3;
  if (so.some((o) => o.status === 'ready')) return 4;
  return 5;
}

export function DemoView({ rid }) {
  const r = A.restaurant(rid);
  const [tid, setTid] = useState(() => {
    const rr = A.restaurant(rid);
    const free = rr?.tables.find((t) => !A.openSession(rid, t.id));
    return (free || rr?.tables[0])?.id;
  });
  const [phone, setPhone] = useState('table');
  const [sim, setSim] = useState(false);
  const simRef = useRef(null);
  useEffect(() => {
    if (!sim) return;
    const tick = () => {
      const rr = A.restaurant(rid);
      if (rr) simStep(rr, tid);
    };
    tick();
    simRef.current = setInterval(tick, 2600);
    return () => clearInterval(simRef.current);
  }, [sim, rid, tid]);
  useEffect(() => {
    const rr = A.restaurant(rid);
    if (rr && !rr.tables.some((t) => t.id === tid)) setTid(rr.tables[0]?.id);
  }, [rid]);
  if (!r) return <Empty icon="store" title="Restaurant not found" />;
  const stage = demoStage(r, tid);
  return (
    <div class="demo">
      <div class="demo-bar">
        <div>
          <h1>Live demo · {r.name.en}</h1>
          <p class="muted small">Everything below is the real system. A tap on one screen shows up on the others{' '}instantly.</p>
        </div>
        <span class="grow" />
        <label class="inline-l" for="demo-table">Guest phone at</label>
        <select id="demo-table" class="input sm" value={tid} onChange={(e) => setTid(e.target.value)}>
          {r.tables.map((t) => <option value={t.id}>Table {t.label}{A.openSession(rid, t.id) ? ' · busy' : ''}</option>)}
        </select>
        {(!LIVE || r.demo) && <Toggle id="demo-sim" on={sim} onChange={setSim} label="Simulate other guests" />}
        <Btn kind="ghost" size="sm" icon="refresh" onClick={() => (A.clearLiveActivity(rid), toast('All tables cleared', 'ok'))}>Reset floor</Btn>
      </div>
      <ol class="demo-steps">
        {STEPS.map(([t, d], i) => (
          <li class={i < stage ? 'past' : i === stage ? 'now' : ''} title={d}>
            <span class="mono">{i + 1}</span>
            <b>{t}</b>
          </li>
        ))}
      </ol>
      <p class="demo-hint"><Ic n="right" s={14} /> {STEPS[stage][1]}</p>
      <div class="demo-grid">
        <div class="demo-phone">
          <div class="seg sm">
            <button type="button" class={phone === 'table' ? 'on' : ''} onClick={() => setPhone('table')}>Table QR</button>
            <button type="button" class={phone === 'online' ? 'on' : ''} onClick={() => setPhone('online')}>Takeaway / delivery</button>
          </div>
          <PhoneFrame>
            {phone === 'table' ? <CustomerApp key={rid + tid} rid={rid} tid={tid} embedded /> : <OnlineApp key={rid + 'online'} rid={rid} embedded />}
          </PhoneFrame>
          <a class="link small" href={phone === 'table' ? '#' + rid + '-table-' + tid : '#' + rid + '-order'}>Open full screen <Ic n="expand" s={12} /></a>
        </div>
        <div class="demo-right">
          <div class="pane">
            <div class="pane-h"><Ic n="tablet" s={14} /> Staff tablet</div>
            <StaffApp rid={rid} compact onOpenCustomer={(t) => (setTid(t), setPhone('table'))} />
          </div>
          <div class="pane">
            <div class="pane-h"><Ic n="monitor" s={14} /> Kitchen display</div>
            <KitchenApp rid={rid} compact />
          </div>
        </div>
      </div>
    </div>
  );
}
