// Staff tablet: live floor map, new orders → kitchen, waiter calls, payments, takeaway/delivery pipeline, manual orders.
import { useState } from './hooks.js';
import { Ic, Btn, Modal, Logo, Avatar, useNow, Empty, Seg } from './ui.js';
import { get, toast } from './store.js';
import { L, tk, mmss, clock, tableState, TABLE_STATES, PAY_METHODS, activeLines, unitPrice, uid, sumLines, computeBill, isBdPhone } from './util.js';
import * as A from './actions.js';
import { lineMeta, Plate } from './menu.js';
import { Receipt, methodLabel, METHOD_ORDER } from './pay.js';
import { useDevice } from './customer.js';

const REQ_LABEL = { waiter: 'Call waiter', water: 'Water', napkins: 'Napkins', cutlery: 'Cutlery', bill: 'Bill', other: 'Message' };
const REQ_ICON = { waiter: 'bell', water: 'drop', napkins: 'layers', cutlery: 'cutlery', bill: 'receipt', other: 'message' };

export function floorModel(r) {
  const orders = A.ordersFor(r.id);
  const reqs = A.requestsFor(r.id);
  const pays = A.paymentsFor(r.id);
  return r.tables.map((tb) => {
    const s = A.openSession(r.id, tb.id);
    if (!s) return { tb, s: null, st: 'free' };
    const so = orders.filter((o) => o.sessionId === s.id);
    const sq = reqs.filter((q) => q.sessionId === s.id && q.status !== 'done');
    const sp = pays.filter((p) => p.sessionId === s.id);
    const st = tableState(s, so, sq, sp);
    const since =
      st === 'help' ? Math.min(...sq.map((q) => q.createdAt)) :
      st === 'ordering' ? Math.min(...so.filter((o) => o.status === 'new').map((o) => o.createdAt)) :
      st === 'cooking' ? Math.min(...so.filter((o) => o.status === 'kitchen').map((o) => o.sentAt || o.createdAt)) :
      st === 'ready' ? Math.min(...so.filter((o) => o.status === 'ready').map((o) => o.readyAt || o.createdAt)) :
      st === 'bill' ? s.billAt || s.openedAt :
      st === 'paid' ? s.paidAt : s.openedAt;
    const total = sumLines(activeLines(so));
    return { tb, s, st, since, total, guests: (s.guests || []).length, help: sq.find((q) => q.type !== 'bill') };
  });
}

export function StaffApp({ rid, compact, onOpenCustomer }) {
  const r = A.restaurant(rid);
  const now = useNow(1000);
  const [dev, setDev] = useDevice('staff:' + rid);
  const [tab, setTab] = useState('orders');
  const [drawer, setDrawer] = useState(null);
  const [pos, setPos] = useState(null); // {tableId?} manual order
  if (!r) return <Empty icon="store" title="Restaurant not found" />;
  const me = dev.me || r.staff.find((s) => s.role === 'waiter')?.name || 'Staff';
  const floor = floorModel(r);
  const orders = A.ordersFor(rid);
  const newDine = orders.filter((o) => o.channel === 'dine' && o.status === 'new').sort((a, b) => a.createdAt - b.createdAt);
  const readyDine = orders.filter((o) => o.channel === 'dine' && o.status === 'ready').sort((a, b) => a.readyAt - b.readyAt);
  const reqs = A.requestsFor(rid).filter((q) => q.status !== 'done').sort((a, b) => a.createdAt - b.createdAt);
  const pend = A.paymentsFor(rid).filter((p) => p.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  const online = orders.filter((o) => o.channel !== 'dine' && ['new', 'kitchen', 'ready', 'out'].includes(o.status)).sort((a, b) => a.createdAt - b.createdAt);
  const occupied = floor.filter((f) => f.s).length;
  const tLabel = (tid) => r.tables.find((x) => x.id === tid)?.label || tid;
  const waiters = r.staff.filter((s) => s.role === 'waiter' || s.role === 'manager');
  const riders = r.staff.filter((s) => s.role === 'rider');

  const counts = { orders: newDine.length + readyDine.length, calls: reqs.length, pay: pend.length, online: online.filter((o) => o.status === 'new' || o.status === 'ready').length };

  return (
    <div class={'staff dark' + (compact ? ' compact' : '')} style={{ '--brand': r.brand }}>
      <header class="k-head">
        <Logo r={r} size={30} />
        <b>{r.name.en}</b>
        <span class="live"><i /> STAFF · LIVE</span>
        <span class="k-sub">{occupied}/{r.tables.length} tables busy</span>
        <span class="grow" />
        <label class="me-pick">
          <Avatar name={me} size={22} />
          <select id={'staff-me-' + rid} aria-label="Who is using this tablet" value={me} onChange={(e) => setDev({ me: e.target.value })}>
            {waiters.map((w) => <option value={w.name}>{w.name}</option>)}
            {!waiters.length && <option>Staff</option>}
          </select>
        </label>
        <Btn kind="brand" size="sm" icon="plus" onClick={() => setPos({})}>New order</Btn>
        <span class="mono k-clock">{clock(now)}</span>
      </header>

      <div class="staff-grid">
        <section class="floor">
          <div class="legend">
            {['free', 'ordering', 'cooking', 'ready', 'eating', 'help', 'bill', 'paid'].map((k) => (
              <span class={'lg tone-' + TABLE_STATES[k].tone}><i />{TABLE_STATES[k].label}</span>
            ))}
          </div>
          {r.sections.map((sec) => (
            <div class="sec">
              <h5>{sec.name}</h5>
              <div class="tiles">
                {floor.filter((f) => f.tb.section === sec.id).map((f) => (
                  <button type="button" class={'tile tone-' + TABLE_STATES[f.st].tone + (f.st === 'help' ? ' urgent' : '')} onClick={() => setDrawer(f.tb.id)}>
                    <span class="t-label">{f.tb.label}</span>
                    <span class="t-state">{TABLE_STATES[f.st].label}</span>
                    {f.s ? (
                      <>
                        <span class="t-time mono">{mmss(now - f.since)}</span>
                        <span class="t-meta">{f.guests ? f.guests + ' guest' + (f.guests > 1 ? 's' : '') : 'Walk-in'}{f.total ? ' · ' + tk(f.total) : ''}</span>
                      </>
                    ) : (
                      <span class="t-meta">{f.tb.seats} seats</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <aside class="queue">
          <div class="q-tabs" role="tablist">
            {[['orders', 'Orders'], ['calls', 'Calls'], ['pay', 'Payments'], ['online', 'Online']].map(([k, l]) => (
              <button type="button" role="tab" aria-selected={tab === k} class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {l}
                {counts[k] > 0 && <i class={'qbadge' + (k === 'calls' ? ' hot' : '')}>{counts[k]}</i>}
              </button>
            ))}
          </div>
          <div class="q-list">
            {tab === 'orders' && (
              <>
                {!newDine.length && !readyDine.length && <p class="q-empty">No new orders. They appear here the moment a table orders.</p>}
                {newDine.map((o) => (
                  <div class="qcard new">
                    <div class="qc-h">
                      <b>{tLabel(o.tableId)}</b>
                      <span>Round {o.round}{o.by ? ' · ' + o.by : ''}</span>
                      <span class="mono age">{mmss(now - o.createdAt)}</span>
                    </div>
                    <ul class="qc-lines">
                      {o.items.map((li) => <li><b>{li.qty}×</b> {li.name.en}{lineMeta(li, 'en') && <small> · {lineMeta(li, 'en')}</small>}</li>)}
                    </ul>
                    {o.note && <p class="qc-note">“{o.note}”</p>}
                    <div class="qc-f">
                      <span class="mono">{o.items.reduce((a, l) => a + l.qty, 0)} items · {tk(sumLines(o.items))}</span>
                      <Btn kind="ghost" size="sm" onClick={() => A.cancelOrder(o.id)}>Cancel</Btn>
                      <Btn kind="brand" size="sm" icon="chef" onClick={() => A.sendToKitchen(o.id)}>Send to kitchen</Btn>
                    </div>
                  </div>
                ))}
                {readyDine.map((o) => (
                  <div class="qcard ready">
                    <div class="qc-h">
                      <b>{tLabel(o.tableId)}</b>
                      <span>Food ready · #{o.no}</span>
                      <span class="mono age">{mmss(now - (o.readyAt || o.createdAt))}</span>
                    </div>
                    <ul class="qc-lines">{o.items.map((li) => <li><b>{li.qty}×</b> {li.name.en}</li>)}</ul>
                    <div class="qc-f">
                      <span />
                      <Btn kind="ok" size="sm" icon="check" onClick={() => A.markServed(o.id)}>Mark served</Btn>
                    </div>
                  </div>
                ))}
              </>
            )}
            {tab === 'calls' && (
              <>
                {!reqs.length && <p class="q-empty">No one is waiting. Calls from table phones land here.</p>}
                {reqs.map((q) => (
                  <div class={'qcard call' + (q.status === 'ack' ? ' ack' : '')}>
                    <div class="qc-h">
                      <b>{tLabel(q.tableId)}</b>
                      <span><Ic n={REQ_ICON[q.type] || 'bell'} s={14} /> {REQ_LABEL[q.type] || q.type}</span>
                      <span class={'mono age' + (now - q.createdAt > 120000 ? ' late' : '')}>{mmss(now - q.createdAt)}</span>
                    </div>
                    {q.note && <p class="qc-note">“{q.note}”</p>}
                    <div class="qc-f">
                      <span class="muted small">{q.status === 'ack' ? q.ackBy + ' is going' : 'Waiting'}</span>
                      {q.type === 'bill' && <Btn kind="ghost" size="sm" icon="receipt" onClick={() => setDrawer(q.tableId)}>Open bill</Btn>}
                      {q.status === 'open' ? (
                        <Btn kind="brand" size="sm" onClick={() => A.ackRequest(q.id, me)}>On my way</Btn>
                      ) : (
                        <Btn kind="ok" size="sm" icon="check" onClick={() => A.doneRequest(q.id)}>Done</Btn>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
            {tab === 'pay' && (
              <>
                {!pend.length && <p class="q-empty">Nothing to confirm. Cash, bank transfer and Bangla QR payments wait here for a quick check.</p>}
                {pend.map((p) => (
                  <div class="qcard pay">
                    <div class="qc-h">
                      <b>{tLabel(p.tableId)}</b>
                      <span>{p.who} · {methodLabel(p.method, 'en')}</span>
                      <span class="mono age">{mmss(now - p.createdAt)}</span>
                    </div>
                    <div class="qc-amt">{tk(p.amount)}</div>
                    {p.ref && <p class="qc-note mono">Ref {p.ref}</p>}
                    {p.trx && <p class="qc-note mono">TrxID {p.trx}</p>}
                    <div class="qc-f">
                      {p.gateway ? (
                        <>
                          <span class="muted small">Paying online via {p.gateway === 'bkash' ? 'bKash' : 'SSLCommerz'}. Confirms by itself.</span>
                          {now - p.createdAt > 15 * 60e3 && <Btn kind="ghost" size="sm" onClick={() => A.rejectPayment(p.id)}>Mark failed</Btn>}
                        </>
                      ) : (
                        <>
                          <Btn kind="ghost" size="sm" onClick={() => A.rejectPayment(p.id)}>Not received</Btn>
                          <Btn kind="ok" size="sm" icon="check" onClick={() => A.confirmPayment(p.id, me)}>{p.method === 'cash' ? 'Cash collected' : 'Confirm received'}</Btn>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
            {tab === 'online' && (
              <>
                {!online.length && <p class="q-empty">No takeaway or delivery orders right now.</p>}
                {online.map((o) => <OnlineCard o={o} r={r} now={now} riders={riders} />)}
              </>
            )}
          </div>
        </aside>
      </div>

      {drawer && <TableDrawer r={r} tid={drawer} me={me} onClose={() => setDrawer(null)} onNewOrder={(tid) => (setDrawer(null), setPos({ tableId: tid }))} onOpenCustomer={onOpenCustomer} />}
      {pos && <ManualOrder r={r} init={pos} onClose={() => setPos(null)} me={me} />}
    </div>
  );
}

function OnlineCard({ o, r, now, riders }) {
  const [rider, setRider] = useState(riders[0]?.name || '');
  const z = (r.online.zones || []).find((x) => x.id === o.zone);
  const paid = o.payment?.status === 'paid';
  return (
    <div class={'qcard online os-' + o.status}>
      <div class="qc-h">
        <b class={'chan ' + o.channel}><Ic n={o.channel === 'delivery' ? 'bike' : 'bag'} s={14} /> {o.channel === 'delivery' ? 'Delivery' : 'Takeaway'}</b>
        <span>#{o.no} · {o.customer?.name}</span>
        <span class="mono age">{mmss(now - o.createdAt)}</span>
      </div>
      <p class="qc-note">{o.customer?.phone}{z ? ' · ' + z.name : ''}{o.customer?.address ? ' · ' + o.customer.address : ''}</p>
      <ul class="qc-lines">{o.items.map((li) => <li><b>{li.qty}×</b> {li.name.en}{lineMeta(li, 'en') && <small> · {lineMeta(li, 'en')}</small>}</li>)}</ul>
      <div class="qc-f">
        <span class="mono">{tk(o.bill?.total || 0)} · {paid ? 'Paid ' + methodLabel(o.payment.method, 'en') : o.payment?.status === 'pending' ? 'Verify ' + methodLabel(o.payment.method, 'en') : o.channel === 'delivery' ? 'Cash on delivery' : 'Pay at pickup'}</span>
      </div>
      <div class="qc-f">
        {o.status === 'new' && (
          <>
            <Btn kind="ghost" size="sm" onClick={() => A.rejectOrder(o.id)}>Reject</Btn>
            <Btn kind="brand" size="sm" icon="check" onClick={() => A.acceptOrder(o.id)}>Accept & cook</Btn>
          </>
        )}
        {o.status === 'kitchen' && <span class="muted small">In the kitchen</span>}
        {o.status === 'ready' && o.channel === 'takeaway' && <Btn kind="ok" size="sm" icon="bag" onClick={() => A.completeOnline(o.id)}>Handed to customer</Btn>}
        {o.status === 'ready' && o.channel === 'delivery' && (
          <>
            <select class="input sm" aria-label="Rider" value={rider} onChange={(e) => setRider(e.target.value)}>
              {riders.map((x) => <option>{x.name}</option>)}
              <option value="Third-party rider">Third-party rider</option>
            </select>
            <Btn kind="brand" size="sm" icon="bike" onClick={() => A.dispatchOrder(o.id, rider)}>Dispatch</Btn>
          </>
        )}
        {o.status === 'out' && (
          <>
            <span class="muted small">With {o.rider || 'rider'} · {mmss(now - o.outAt)}</span>
            <Btn kind="ok" size="sm" icon="check" onClick={() => A.completeOnline(o.id)}>Delivered</Btn>
          </>
        )}
      </div>
    </div>
  );
}

function TableDrawer({ r, tid, me, onClose, onNewOrder, onOpenCustomer }) {
  const now = useNow(1000);
  const [method, setMethod] = useState('cash');
  const [showBill, setShowBill] = useState(false);
  const tb = r.tables.find((x) => x.id === tid);
  const s = A.openSession(r.id, tid);
  if (!tb) return null;
  const custLink = '#' + r.id + '-table-' + tid;
  if (!s)
    return (
      <Modal open title={`${tb.label} · free`} onClose={onClose} cls="dark-modal">
        <p class="muted">{tb.seats} seats · {r.sections.find((x) => x.id === tb.section)?.name}</p>
        <div class="row-gap">
          <Btn kind="brand" icon="plus" onClick={() => onNewOrder(tid)}>Take an order</Btn>
          <Btn kind="soft" icon="users" onClick={() => A.joinTable(r.id, tid, '').catch((e) => toast(e.message, 'alert'))}>Seat walk-in guests</Btn>
          {onOpenCustomer ? (
            <Btn kind="ghost" icon="mobile" onClick={() => (onOpenCustomer(tid), onClose())}>Show on guest phone</Btn>
          ) : (
            <a class="btn btn-ghost" href={custLink}><Ic n="mobile" s={16} /><span>Open guest view</span></a>
          )}
        </div>
      </Modal>
    );
  const orders = A.sessionOrders(s.id);
  const reqs = A.sessionRequests(s.id).filter((q) => q.status !== 'done');
  const { lines, bill, pays, paid, pending, due } = A.sessionBill(r, s);
  const methods = METHOD_ORDER.filter((m) => r.payments?.[m]?.on);
  return (
    <Modal open wide title={`${tb.label} · ${(s.guests || []).join(', ') || 'Walk-in'}`} onClose={onClose} cls="dark-modal">
      <div class="drawer">
        <div class="dr-col">
          <p class="muted small">Seated {clock(s.openedAt)} · {mmss(now - s.openedAt)} ago{s.quiz?.score ? ` · quiz ${s.quiz.score} pts` : ''}</p>
          {reqs.length > 0 && (
            <div class="dr-reqs">
              {reqs.map((q) => (
                <div class="dr-req">
                  <Ic n={REQ_ICON[q.type] || 'bell'} s={16} />
                  <b>{REQ_LABEL[q.type]}</b>
                  {q.note && <small>“{q.note}”</small>}
                  <span class="mono">{mmss(now - q.createdAt)}</span>
                  {q.status === 'open' ? <Btn size="sm" kind="brand" onClick={() => A.ackRequest(q.id, me)}>On my way</Btn> : <Btn size="sm" kind="ok" onClick={() => A.doneRequest(q.id)}>Done</Btn>}
                </div>
              ))}
            </div>
          )}
          {orders.map((o) => (
            <div class={'dr-order dro-' + o.status}>
              <div class="dr-oh">
                <b>Round {o.round}</b>
                <span class="muted small">{clock(o.createdAt)}{o.by ? ' · ' + o.by : ''}</span>
                <span class={'spill s-' + o.status}>{o.status === 'kitchen' ? 'cooking' : o.status}</span>
              </div>
              <ul>
                {o.items.map((li) => (
                  <li class={o.done?.[li.key] ? 'done' : ''}>
                    <b>{li.qty}×</b> {li.name.en}{lineMeta(li, 'en') && <small> · {lineMeta(li, 'en')}</small>}<span class="mono">{tk(li.unit * li.qty)}</span>
                  </li>
                ))}
              </ul>
              <div class="row-gap">
                {o.status === 'new' && <Btn kind="brand" size="sm" icon="chef" onClick={() => A.sendToKitchen(o.id)}>Send to kitchen</Btn>}
                {o.status === 'ready' && <Btn kind="ok" size="sm" icon="check" onClick={() => A.markServed(o.id)}>Mark served</Btn>}
                {(o.status === 'new' || o.status === 'kitchen') && <Btn kind="ghost" size="sm" onClick={() => A.cancelOrder(o.id)}>Cancel round</Btn>}
              </div>
            </div>
          ))}
          {!orders.length && <p class="muted">No orders yet.</p>}
          <div class="row-gap">
            {s.status === 'open' && <Btn kind="soft" icon="plus" onClick={() => onNewOrder(tid)}>Add items</Btn>}
            {onOpenCustomer ? (
              <Btn kind="ghost" icon="mobile" onClick={() => (onOpenCustomer(tid), onClose())}>Show on guest phone</Btn>
            ) : (
              <a class="btn btn-ghost" href={custLink}><Ic n="mobile" s={16} /><span>Open guest view</span></a>
            )}
          </div>
        </div>
        <div class="dr-col bill-col">
          <h4>Bill</h4>
          <dl class="totals dark">
            <dt>Subtotal</dt><dd>{tk(bill.subtotal)}</dd>
            {bill.sc > 0 && (<><dt>Service {bill.scPct}%</dt><dd>{tk(bill.sc)}</dd></>)}
            <dt>VAT {bill.vatPct}%{bill.inclusive ? ' incl.' : ''}</dt><dd>{tk(bill.vat)}</dd>
            {bill.tip > 0 && (<><dt>Tip</dt><dd>{tk(bill.tip)}</dd></>)}
            <dt class="grand">Total</dt><dd class="grand">{tk(bill.total)}</dd>
          </dl>
          {pays.length > 0 && (
            <ul class="pay-list dark">
              {pays.map((p) => (
                <li class={'ps-' + p.status}>
                  <span>{p.who || 'Table'} · {methodLabel(p.method, 'en')}</span>
                  <b>{tk(p.amount)}</b>
                  {p.status === 'pending' ? <Btn size="sm" kind="ok" onClick={() => A.confirmPayment(p.id, me)}>Confirm</Btn> : <em>{p.status}</em>}
                </li>
              ))}
            </ul>
          )}
          <div class="due-row"><span>Left to pay</span><b>{tk(due)}</b></div>
          {s.status === 'paid' ? (
            <>
              <p class="notice ok">Paid in full {s.invoiceNo ? '· ' + s.invoiceNo : ''}</p>
              <Btn kind="brand" full icon="check" onClick={() => (A.clearTable(s.id), onClose())}>Clear table for next guests</Btn>
            </>
          ) : (
            <>
              {(due > 0 || pending > 0) && bill.total > 0 && (
                <div class="settle">
                  <select class="input sm" aria-label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
                    {methods.map((m) => <option value={m}>{PAY_METHODS[m].label}</option>)}
                  </select>
                  <Btn kind="ok" size="sm" icon="check" onClick={() => A.settleRemaining(s.id, method, me)}>Settle {tk(due + pending)}</Btn>
                </div>
              )}
              <Btn kind="ghost" size="sm" icon="receipt" onClick={() => setShowBill(!showBill)}>{showBill ? 'Hide' : 'Preview'} printed bill</Btn>
              {showBill && <Receipt r={r} lines={lines} bill={bill} meta={{ where: 'Table ' + tb.label, when: Date.now() }} />}
              {!lines.length && <Btn kind="ghost" size="sm" onClick={() => (A.clearTable(s.id), onClose())}>Close empty table</Btn>}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

// Manual order entry (walk-ins without phones, phone-in takeaway)
function ManualOrder({ r, init, onClose, me }) {
  const [target, setTarget] = useState(init.tableId || r.tables[0]?.id || 'takeaway');
  const [lines, setLines] = useState([]);
  const [cat, setCat] = useState(r.categories[0]?.id);
  const [cust, setCust] = useState({ name: '', phone: '' });
  const [err, setErr] = useState('');
  const add = (item, size) => {
    const ex = lines.find((l) => l.itemId === item.id && l.size === size);
    if (ex) setLines(lines.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l)));
    else {
      const c = r.categories.find((x) => x.id === item.cat);
      setLines([...lines, { key: uid('l'), itemId: item.id, name: item.name, icon: item.icon, qty: 1, size, spice: item.spice ? 1 : null, note: '', unit: unitPrice(item, size), station: c?.station, guest: '' }]);
    }
  };
  const sub = sumLines(lines);
  const place = async () => {
    if (!lines.length) return;
    if (target === 'takeaway') {
      if (!cust.name.trim() || !isBdPhone(cust.phone)) return setErr('Add the customer name and an 11-digit mobile number.');
      const bill = computeBill(r, sub, { packaging: r.online.packaging || 0 });
      const id = A.placeOrder(r.id, { channel: 'takeaway', lines, customer: { name: cust.name, phone: cust.phone, address: '' }, bill, payment: { method: 'cash', status: 'unpaid' }, by: me });
      A.acceptOrder(id);
    } else {
      let sid;
      try {
        sid = await A.joinTable(r.id, target, '');
      } catch (e) {
        return setErr(e.message);
      }
      const id = A.placeOrder(r.id, { channel: 'dine', sessionId: sid, tableId: target, lines, by: me });
      A.sendToKitchen(id);
    }
    onClose();
  };
  return (
    <Modal open wide title="New order" onClose={onClose} cls="dark-modal" foot={
      <>
        <span class="mono">{lines.reduce((a, l) => a + l.qty, 0)} items · {tk(sub)}</span>
        <Btn kind="brand" icon="chef" disabled={!lines.length} onClick={place}>Send to kitchen</Btn>
      </>
    }>
      <div class="pos">
        <div class="pos-left">
          <label class="opt-l" for="pos-target">For</label>
          <select id="pos-target" class="input" value={target} onChange={(e) => setTarget(e.target.value)}>
            {r.tables.map((tb) => <option value={tb.id}>Table {tb.label}</option>)}
            {r.features.takeaway && <option value="takeaway">Takeaway (phone or counter)</option>}
          </select>
          {target === 'takeaway' && (
            <div class="form-grid">
              <input class="input" aria-label="Customer name" placeholder="Customer name" value={cust.name} onInput={(e) => setCust({ ...cust, name: e.target.value })} />
              <input class="input" aria-label="Customer mobile" placeholder="01XXXXXXXXX" value={cust.phone} onInput={(e) => setCust({ ...cust, phone: e.target.value })} />
            </div>
          )}
          <div class="cats small">
            {r.categories.map((c) => <button type="button" class={'cat' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>{c.name.en}</button>)}
          </div>
          <div class="pos-items">
            {r.items.filter((i) => i.cat === cat).map((i) => (
              <div class={'pos-item' + (i.available ? '' : ' out')}>
                <Plate item={i} size={34} />
                <span><b>{i.name.en}</b><small>{i.name.bn}</small></span>
                {i.half && <Btn size="sm" kind="soft" disabled={!i.available} onClick={() => add(i, 'half')}>Half {tk(i.half)}</Btn>}
                <Btn size="sm" kind="soft" disabled={!i.available} onClick={() => add(i, 'full')}>{i.half ? 'Full ' : ''}{tk(i.price)}</Btn>
              </div>
            ))}
          </div>
        </div>
        <div class="pos-right">
          <h4>Ticket</h4>
          {!lines.length && <p class="muted small">Tap dishes to add them.</p>}
          <ul class="qc-lines">
            {lines.map((l) => (
              <li>
                <b>{l.qty}×</b> {l.name.en}{l.size === 'half' ? ' (half)' : ''}
                <span class="grow" />
                <button type="button" class="icon-btn sm" aria-label="Remove one" onClick={() => setLines(lines.map((x) => (x === l ? { ...x, qty: x.qty - 1 } : x)).filter((x) => x.qty > 0))}><Ic n="minus" s={14} /></button>
              </li>
            ))}
          </ul>
          {err && <p class="err">{err}</p>}
        </div>
      </div>
    </Modal>
  );
}
