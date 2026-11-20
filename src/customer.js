// Customer experience after scanning a table QR: menu, order, live status, waiter calls, games, bill split, payment, receipt, review.
import { useState, useEffect, useMemo } from './hooks.js';
import { Ic, Btn, Sheet, Logo, Avatar, useNow, copyText, Empty } from './ui.js';
import { t } from './i18n.js';
import { state, get, toast } from './store.js';
import { L, tk, num, mmss, clock, orderEtaMs, activeLines, sumLines, clamp } from './util.js';
import * as A from './actions.js';
import { MenuList, ItemSheet, buildLines, CartLines, Totals, cartCount, cartQtyMap, cartBill, lineMeta, Plate } from './menu.js';
import { PayFlow, Receipt, ReviewForm, downloadReceipt, methodLabel } from './pay.js';
import { QUIZ } from './seed.js';

// ---------- per-device memory (who am I at this table, language) ----------
const mem = {};
const dk = (k) => 'thali.dev.' + k;
export function loadDev(k) {
  if (mem[k]) return mem[k];
  try {
    const v = JSON.parse(sessionStorage.getItem(dk(k)) || 'null');
    if (v) return (mem[k] = v);
  } catch (e) {}
  return (mem[k] = {});
}
export function saveDev(k, v) {
  mem[k] = v;
  try {
    sessionStorage.setItem(dk(k), JSON.stringify(v));
  } catch (e) {}
}
export function useDevice(k) {
  const [v, setV] = useState(() => loadDev(k));
  useEffect(() => setV(loadDev(k)), [k]);
  const set = (p) => {
    const n = { ...loadDev(k), ...p };
    saveDev(k, n);
    setV(n);
  };
  return [v, set];
}
export function useLang() {
  const [lang, setL] = useState(loadDev('lang').v || 'en');
  return [lang, (v) => (saveDev('lang', { v }), setL(v))];
}

export const LangSwitch = ({ lang, setLang }) => (
  <button type="button" class="lang" onClick={() => setLang(lang === 'en' ? 'bn' : 'en')} aria-label="Change language">
    <Ic n="globe" s={14} />
    {lang === 'en' ? 'বাংলা' : 'English'}
  </button>
);

export function CustomerApp({ rid, tid, embedded }) {
  const r = A.restaurant(rid);
  const [dev, setDev] = useDevice(rid + ':' + tid);
  const [lang, setLang] = useLang();
  const [tab, setTab] = useState('menu');
  const [cart, setCart] = useState([]);
  const [item, setItem] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [overlay, setOverlay] = useState(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    setTab('menu');
    setCart([]);
    setOverlay(null);
    setCartOpen(false);
  }, [rid, tid]);

  const wrapCls = 'cust' + (embedded ? ' embedded' : ' standalone');
  if (!state.loaded) return <div class={wrapCls}><p class="pad muted center">Loading menu…</p></div>;
  if (!r) return <div class={wrapCls}><Empty icon="store" title="Restaurant not found" body="This QR code points to a restaurant that is no longer on the platform." /></div>;
  const table = r.tables.find((x) => x.id === tid);
  const style = { '--brand': r.brand };
  if (!table) return <div class={wrapCls} style={style}><Empty icon="qr" title="Table not found" body="Ask a staff member for a fresh QR code." /></div>;
  if (r.status === 'suspended')
    return (
      <div class={wrapCls} style={style}>
        <Empty icon="alert" title={lang === 'bn' ? 'অর্ডার এখন বন্ধ' : 'Ordering is unavailable right now'} body={lang === 'bn' ? 'অনুগ্রহ করে ওয়েটারকে বলুন।' : 'Please order with your waiter.'} />
      </div>
    );

  let s = dev.sid ? get('sessions', dev.sid) : null;
  if (s && s.tableId !== tid) s = null;

  if (!s)
    return (
      <Welcome r={r} table={table} lang={lang} setLang={setLang} cls={wrapCls} style={style}
        onStart={async (name) => {
          try {
            const sid = await A.joinTable(rid, tid, name);
            setDev({ sid, guest: name || t('guest', 'en') });
          } catch (e) {
            toast(e.message, 'alert');
          }
        }} />
    );
  if (s.status === 'closed') return <Closed r={r} s={s} table={table} lang={lang} setLang={setLang} cls={wrapCls} style={style} onNew={() => setDev({ sid: null })} />;

  const orders = A.sessionOrders(s.id).filter((o) => o.status !== 'cancelled');
  const activeCount = orders.filter((o) => o.status !== 'served').length;
  const canOrder = s.status === 'open' && r.features.tableOrdering !== false;
  const count = cartCount(cart);
  const bill = cartBill(r, cart);

  const addFromSheet = (opts) => {
    setCart([...cart, ...buildLines(r, item, opts, dev.guest)]);
    setItem(null);
  };
  const place = () => {
    if (!cart.length) return;
    A.placeOrder(rid, { channel: 'dine', sessionId: s.id, tableId: tid, lines: cart.map((l) => ({ ...l, guest: l.guest || dev.guest })), note, by: dev.guest });
    setCart([]);
    setNote('');
    setCartOpen(false);
    setTab('status');
    toast(t('orderSent', lang), 'ok');
  };

  return (
    <div class={wrapCls} style={style}>
      <header class="c-head">
        <Logo r={r} size={34} />
        <div class="c-title">
          <b>{L(r.name, lang)}</b>
          <small>
            {t('table', lang)} {table.label} · {dev.guest}
          </small>
        </div>
        <LangSwitch lang={lang} setLang={setLang} />
      </header>

      <main class="c-body">
        {tab === 'menu' && (
          <>
            {!canOrder && <p class="notice">{s.status === 'paid' ? t('paidThanks', lang) : t('orderClosedNote', lang)}</p>}
            <MenuList r={r} lang={lang} cartQty={cartQtyMap(cart)} onOpen={(i) => (canOrder ? setItem(i) : null)} />
          </>
        )}
        {tab === 'status' && <StatusTab r={r} s={s} orders={orders} lang={lang} go={setTab} openQuiz={() => setOverlay('quiz')} />}
        {tab === 'call' && <CallTab r={r} s={s} lang={lang} guest={dev.guest} />}
        {tab === 'bill' && <BillTab r={r} s={s} lang={lang} guest={dev.guest} table={table} />}
      </main>

      {tab === 'menu' && count > 0 && (
        <button type="button" class="cart-bar" onClick={() => setCartOpen(true)}>
          <span class="cb-count">{num(count, lang)}</span>
          <span>{t('viewOrder', lang)}</span>
          <b>{tk(bill.subtotal, lang)}</b>
        </button>
      )}

      <nav class="c-nav" aria-label="Sections">
        {[
          ['menu', 'cutlery', t('menu', lang)],
          ['status', 'clock', t('status', lang), activeCount],
          ['call', 'bell', t('call', lang)],
          ['bill', 'receipt', t('bill', lang)],
        ].map(([k, ic, label, badge]) => (
          <button type="button" class={tab === k ? 'on' : ''} onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}>
            <Ic n={ic} s={20} />
            <span>{label}</span>
            {badge > 0 && <i class="badge">{num(badge, lang)}</i>}
          </button>
        ))}
      </nav>

      {item && <ItemSheet r={r} item={item} lang={lang} onClose={() => setItem(null)} onAdd={addFromSheet} />}

      <Sheet open={cartOpen} onClose={() => setCartOpen(false)} title={t('yourOrder', lang)}>
        <div class="cart-sheet">
          <h3>{t('yourOrder', lang)}</h3>
          {cart.length ? (
            <>
              <CartLines lines={cart} setLines={setCart} lang={lang} />
              <label class="opt-l" for="order-note">{t('noteKitchen', lang)}</label>
              <input id="order-note" class="input" value={note} onInput={(e) => setNote(e.target.value)} placeholder={t('requestsPh', lang)} />
              <Totals bill={bill} lang={lang} />
              <Btn kind="brand" size="lg" full icon="chef" onClick={place}>
                {t('placeOrder', lang)}
              </Btn>
            </>
          ) : (
            <p class="muted">{t('emptyCart', lang)}</p>
          )}
        </div>
      </Sheet>

      <Sheet open={overlay === 'quiz'} onClose={() => setOverlay(null)} title={t('quiz', lang)}>
        {overlay === 'quiz' && <Quiz r={r} s={s} lang={lang} table={table} />}
      </Sheet>
    </div>
  );
}

function Welcome({ r, table, lang, setLang, cls, style, onStart }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const open = A.openSession(r.id, table.id);
  return (
    <div class={cls + ' welcome'} style={style}>
      <div class="w-top">
        <LangSwitch lang={lang} setLang={setLang} />
      </div>
      <div class="w-hero">
        <Logo r={r} size={64} />
        <small>{t('welcome', lang)}</small>
        <h1>{L(r.name, lang)}</h1>
        {L(r.tagline, lang) && <p>{L(r.tagline, lang)}</p>}
        <span class="w-table">
          {t('table', lang)} {table.label} · {num(table.seats, lang)} {t('seats', lang)}
        </span>
      </div>
      <div class="w-card">
        <p class="w-lead">{t('scanOrderPay', lang)}</p>
        {open && (open.guests || []).length > 0 && (
          <div class="w-guests">
            <small>{t('atTable', lang)}</small>
            <div>
              {open.guests.map((g) => (
                <span class="gchip"><Avatar name={g} size={22} /> {g}</span>
              ))}
            </div>
          </div>
        )}
        <label class="opt-l" for="guest-name">{t('yourName', lang)}</label>
        <input id="guest-name" class="input" value={name} maxLength={20} onInput={(e) => setName(e.target.value)} placeholder="Aman" />
        <small class="muted">{t('nameHint', lang)}</small>
        <Btn kind="brand" size="lg" full disabled={busy} onClick={async () => { setBusy(true); await onStart(name.trim()); setBusy(false); }}>
          {t('startOrdering', lang)}
        </Btn>
      </div>
      <LegalFoot lang={lang} />
    </div>
  );
}

export const LegalFoot = ({ lang }) => (
  <p class="legal-foot">
    <a href="#privacy">{lang === 'bn' ? 'গোপনীয়তা নীতি' : 'Privacy'}</a> · <a href="#terms">{lang === 'bn' ? 'শর্তাবলি' : 'Terms'}</a>
  </p>
);

function Closed({ r, s, table, lang, setLang, cls, style, onNew }) {
  const lines = activeLines(A.sessionOrders(s.id));
  return (
    <div class={cls} style={style}>
      <header class="c-head">
        <Logo r={r} size={34} />
        <div class="c-title">
          <b>{L(r.name, lang)}</b>
          <small>{t('table', lang)} {table.label}</small>
        </div>
        <LangSwitch lang={lang} setLang={setLang} />
      </header>
      <main class="c-body pad-x">
        <p class="notice">{t('closed', lang)}</p>
        {s.bill && <Receipt r={r} lines={lines} bill={s.bill} lang={lang} meta={{ invoiceNo: s.invoiceNo, where: t('table', lang) + ' ' + table.label, when: s.paidAt || s.closedAt, paidBy: s.paidBy, paid: !!s.paidAt }} />}
        <ReviewBlock r={r} s={s} lang={lang} />
        <Btn kind="brand" size="lg" full onClick={onNew}>{t('newVisit', lang)}</Btn>
      </main>
    </div>
  );
}

function ReviewBlock({ r, s, lang, guest }) {
  const [sent, setSent] = useState(false);
  if (s.reviewed && !sent) return null;
  return <ReviewForm lang={lang} done={sent} onSubmit={(v) => (A.submitReview(r.id, { ...v, sessionId: s.id, tableId: s.tableId, guest: guest || '' }), setSent(true))} />;
}

// ---------- My order ----------
const STAGES = ['ordered', 'cooking', 'ready', 'served'];
const stageIdx = (o) => ({ new: 0, kitchen: 1, ready: 2, served: 3 })[o.status] ?? 0;

function StatusTab({ r, s, orders, lang, go, openQuiz }) {
  const now = useNow(1000);
  const [copied, setCopied] = useState(false);
  const current = [...orders].reverse().find((o) => o.status !== 'served') || orders[orders.length - 1];
  const [board, setBoard] = useState([]);
  useEffect(() => {
    if (r.features.games !== false) A.quizBoard(r.id).then(setBoard).catch(() => {});
  }, [s.quiz?.score]);
  const rank = board.findIndex((x) => x.id === s.id) + 1;
  return (
    <div class="status pad-x">
      {!current ? (
        <Empty icon="cutlery" title={t('nothingYet', lang)}>
          <Btn kind="brand" onClick={() => go('menu')}>{t('browse', lang)}</Btn>
        </Empty>
      ) : (
        <StatusHero r={r} o={current} lang={lang} now={now} />
      )}

      {orders.length > 0 && (
        <div class="rounds">
          {orders.map((o) => (
            <div class="round">
              <div class="round-h">
                <b>{t('round', lang)} {num(o.round, lang)}</b>
                <small>{clock(o.createdAt, lang)}</small>
                <span class={'st st-' + o.status}>{t(STAGES[stageIdx(o)], lang)}</span>
              </div>
              <ul>
                {o.items.map((li) => (
                  <li class={o.done && o.done[li.key] ? 'done' : ''}>
                    <span class="ck">{o.done && o.done[li.key] ? <Ic n="check" s={12} w={3} /> : null}</span>
                    {num(li.qty, lang)} × {L(li.name, lang)}
                    {lineMeta(li, lang) && <small> · {lineMeta(li, lang)}</small>}
                    <em>{li.guest}</em>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {s.status === 'open' && (
            <Btn kind="soft" full icon="plus" onClick={() => go('menu')}>{t('orderMore', lang)}</Btn>
          )}
        </div>
      )}

      <div class="perks">
        {r.wifi?.ssid && (
          <div class="perk wifi">
            <Ic n="wifi" s={22} />
            <div>
              <small>{t('wifi', lang)}</small>
              <b>{r.wifi.ssid}</b>
              <span class="mono">{r.wifi.password}</span>
            </div>
            <Btn kind="soft" size="sm" icon={copied ? 'check' : 'copy'} onClick={async () => { await copyText(r.wifi.password); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? t('copied', lang) : t('copy', lang)}
            </Btn>
          </div>
        )}
        {r.features.games !== false && (
          <button type="button" class="perk game" onClick={openQuiz}>
            <Ic n="game" s={22} />
            <div>
              <small>{t('play', lang)}</small>
              <b>{t('quiz', lang)}</b>
              <span>{t('tvt', lang)}{rank ? ` · #${num(rank, lang)}` : ''}</span>
            </div>
            <Ic n="right" s={18} />
          </button>
        )}
      </div>
    </div>
  );
}

function StatusHero({ r, o, lang, now }) {
  const idx = stageIdx(o);
  const eta = orderEtaMs(r, o);
  const start = o.sentAt || o.createdAt;
  const left = eta - now;
  const prog = o.status === 'kitchen' ? clamp((now - start) / Math.max(1, eta - start), 0, 1) : idx >= 2 ? 1 : 0;
  const R = 54;
  const C = 2 * Math.PI * R;
  const title = o.status === 'new' ? t('waitConfirm', lang) : o.status === 'kitchen' ? t('isCooking', lang) : o.status === 'ready' ? t('isReady', lang) : t('enjoy', lang);
  return (
    <div class={'hero-status hs-' + o.status}>
      <small class="mono">{t('table', lang)} · #{num(o.no, lang)}</small>
      <h2>{title}</h2>
      <div class="ring">
        <svg viewBox="0 0 128 128" width="150" height="150" aria-hidden="true">
          <circle cx="64" cy="64" r={R} class="ring-bg" />
          <circle cx="64" cy="64" r={R} class="ring-fg" stroke-dasharray={C} stroke-dashoffset={C * (1 - prog)} transform="rotate(-90 64 64)" />
        </svg>
        <div class="ring-c">
          {o.status === 'kitchen' ? (
            <>
              <b class="mono">{num(mmss(Math.max(0, left)), lang)}</b>
              <small>{left > 0 ? t('minLeft', lang) : lang === 'bn' ? 'প্রায় তৈরি' : 'Almost ready'}</small>
            </>
          ) : o.status === 'new' ? (
            <span class="pulse-dot" />
          ) : (
            <Ic n="check" s={44} w={2.6} />
          )}
        </div>
      </div>
      <ol class="stages">
        {STAGES.map((st, i) => (
          <li class={i < idx ? 'past' : i === idx ? 'now' : ''}>{t(st, lang)}</li>
        ))}
      </ol>
    </div>
  );
}

// ---------- Call waiter ----------
function CallTab({ r, s, lang, guest }) {
  const now = useNow(1000);
  const [other, setOther] = useState(false);
  const [msg, setMsg] = useState('');
  const reqs = A.sessionRequests(s.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const call = (type, note) => {
    if (type === 'bill') A.requestBill(s.id);
    else A.callWaiter(r.id, s.id, s.tableId, type, note);
    toast(t('sentWaiter', lang), 'ok');
  };
  const LABEL = { waiter: t('callWaiter', lang), water: t('water', lang), napkins: t('napkins', lang), cutlery: t('cutlery', lang), bill: t('bill', lang), other: t('other', lang) };
  return (
    <div class="call pad-x">
      <h2>{t('needSomething', lang)}</h2>
      <button type="button" class="call-btn" onClick={() => call('waiter', '')}>
        <span class="call-ring" />
        <Ic n="bell" s={40} w={2} />
        <b>{t('callWaiter', lang)}</b>
      </button>
      <div class="chips center">
        {[['water', 'drop'], ['napkins', 'layers'], ['cutlery', 'cutlery'], ['bill', 'receipt']].map(([k, ic]) => (
          <button type="button" class="chip big" onClick={() => call(k, '')}>
            <Ic n={ic} s={16} /> {LABEL[k]}
          </button>
        ))}
        <button type="button" class={'chip big' + (other ? ' on' : '')} onClick={() => setOther(!other)}>
          <Ic n="message" s={16} /> {LABEL.other}
        </button>
      </div>
      {other && (
        <div class="other-row">
          <input id="waiter-msg" class="input" value={msg} onInput={(e) => setMsg(e.target.value)} placeholder={t('msgWaiter', lang)} />
          <Btn kind="brand" disabled={!msg.trim()} onClick={() => (call('other', msg.trim()), setMsg(''), setOther(false))}>{t('send', lang)}</Btn>
        </div>
      )}
      {reqs.length > 0 && (
        <ul class="req-list">
          {reqs.map((q) => (
            <li class={'rq-' + q.status}>
              <b>{LABEL[q.type] || q.type}</b>
              {q.note && <small>“{q.note}”</small>}
              <span>
                {q.status === 'open' && <>{t('sentWaiter', lang)} <em class="mono">{num(mmss(now - q.createdAt), lang)}</em></>}
                {q.status === 'ack' && <>{q.ackBy} {t('onWay', lang)}</>}
                {q.status === 'done' && t('done', lang)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Bill, split and pay ----------
function BillTab({ r, s, lang, guest, table }) {
  const [mode, setMode] = useState('full');
  const [n, setN] = useState(Math.max(2, (s.guests || []).length));
  const [paying, setPaying] = useState(null); // {amount, who}
  const { lines, bill, pays, paid, pending, due } = A.sessionBill(r, s);

  if (s.status === 'paid')
    return (
      <div class="bill pad-x">
        <p class="notice ok">{t('paidThanks', lang)}</p>
        <Receipt r={r} lines={lines} bill={s.bill || bill} lang={lang} meta={{ invoiceNo: s.invoiceNo, where: t('table', lang) + ' ' + table.label, when: s.paidAt, paidBy: s.paidBy, paid: true }} />
        <Btn kind="soft" full icon="download" onClick={() => downloadReceipt(r, lines, s.bill || bill, { invoiceNo: s.invoiceNo, where: 'Table ' + table.label, when: s.paidAt, paidBy: s.paidBy })}>{t('download', lang)}</Btn>
        <ReviewBlock r={r} s={s} lang={lang} guest={guest} />
      </div>
    );

  if (!lines.length)
    return (
      <div class="bill pad-x">
        <Empty icon="receipt" title={t('nothingYet', lang)} />
      </div>
    );

  const guests = [...new Set(lines.map((l) => l.guest).filter(Boolean))];
  const shareByGuest = () => {
    const shared = lines.filter((l) => !l.guest);
    const sharedSub = sumLines(shared);
    return guests.map((g) => {
      const sub = sumLines(lines.filter((l) => l.guest === g)) + sharedSub / Math.max(1, guests.length);
      const amt = Math.round((sub / Math.max(1, bill.subtotal)) * bill.total);
      const got = pays.filter((p) => p.who === g && p.status !== 'failed').reduce((a, p) => a + p.amount, 0);
      return { g, amt, got };
    });
  };
  const eq = Math.ceil(bill.total / Math.max(1, n));
  const tipOpts = [0, 5, 10, 15];

  const onResult = async (res) => {
    if (res.gateway) {
      await A.startGatewayPayment(r.id, s.id, { who: paying.who, amount: paying.amount, method: res.method });
      return; // the browser is leaving for the payment page
    }
    A.createPayment(r.id, s.id, { who: paying.who, amount: paying.amount, ...res });
    setPaying(null);
    toast(res.status === 'paid' ? t('success', lang) : t('waitingConfirm', lang), res.status === 'paid' ? 'ok' : 'info');
  };

  return (
    <div class="bill pad-x">
      <h2>{t('yourBill', lang)}</h2>
      <ul class="bill-lines">
        {lines.map((l) => (
          <li>
            <span>{num(l.qty, lang)} × {L(l.name, lang)}{lineMeta(l, lang) && <small> · {lineMeta(l, lang)}</small>}</span>
            {guests.length > 1 && <em>{l.guest}</em>}
            <b>{tk(l.unit * l.qty, lang)}</b>
          </li>
        ))}
      </ul>
      <div class="opt">
        <span class="opt-l">{t('tip', lang)}</span>
        <div class="seg">
          {tipOpts.map((p) => (
            <button type="button" class={(s.tipPct || 0) === p ? 'on' : ''} onClick={() => A.setTip(s.id, p)}>
              {p ? num(p, lang) + '%' : t('noTip', lang)}
            </button>
          ))}
        </div>
      </div>
      <Totals bill={bill} lang={lang} />

      {pays.length > 0 && (
        <ul class="pay-list">
          {pays.map((p) => (
            <li class={'ps-' + p.status}>
              <Avatar name={p.who || '?'} size={24} />
              <span>{p.who} · {methodLabel(p.method, lang)}</span>
              <b>{tk(p.amount, lang)}</b>
              <em>{p.status === 'paid' ? t('paid', lang) : p.status === 'pending' ? t('pending', lang) : '✕'}</em>
            </li>
          ))}
        </ul>
      )}
      <div class="due-row">
        <span>{t('remaining', lang)}</span>
        <b>{tk(due, lang)}</b>
      </div>

      {due > 0 && (
        <>
          <div class="opt">
            <span class="opt-l"><Ic n="split" s={14} /> {t('split', lang)}</span>
            <div class="seg">
              <button type="button" class={mode === 'full' ? 'on' : ''} onClick={() => setMode('full')}>{t('payFull', lang)}</button>
              <button type="button" class={mode === 'equal' ? 'on' : ''} onClick={() => setMode('equal')}>{t('equal', lang)}</button>
              {guests.length > 1 && <button type="button" class={mode === 'items' ? 'on' : ''} onClick={() => setMode('items')}>{t('byItems', lang)}</button>}
            </div>
          </div>
          {mode === 'full' && (
            <Btn kind="brand" size="lg" full onClick={() => setPaying({ amount: due, who: guest })}>{t('pay', lang)} {tk(due, lang)}</Btn>
          )}
          {mode === 'equal' && (
            <div class="split-eq">
              <div class="stepper">
                <button type="button" aria-label="Fewer people" onClick={() => setN(Math.max(2, n - 1))}><Ic n="minus" s={16} /></button>
                <b>{num(n, lang)} {t('people', lang)}</b>
                <button type="button" aria-label="More people" onClick={() => setN(Math.min(20, n + 1))}><Ic n="plus" s={16} /></button>
              </div>
              <div class="share-big">
                <small>{t('yourShare', lang)}</small>
                <b>{tk(Math.min(eq, due), lang)}</b>
              </div>
              <Btn kind="brand" size="lg" full onClick={() => setPaying({ amount: Math.min(eq, due), who: guest })}>{t('pay', lang)} {tk(Math.min(eq, due), lang)}</Btn>
            </div>
          )}
          {mode === 'items' && (
            <div class="split-items">
              {shareByGuest().map(({ g, amt, got }) => {
                const left = Math.max(0, Math.min(amt - got, due));
                return (
                  <div class={'share' + (g === guest ? ' me' : '')}>
                    <Avatar name={g} size={36} />
                    <span>
                      <b>{g}{g === guest ? ` (${t('you', lang)})` : ''}</b>
                      <small>{tk(amt, lang)}{got > 0 ? ` · ${t('paid', lang)} ${tk(got, lang)}` : ''}</small>
                    </span>
                    {left > 0 ? (
                      <Btn kind={g === guest ? 'brand' : 'soft'} size="sm" onClick={() => setPaying({ amount: left, who: g })}>{t('pay', lang)} {tk(left, lang)}</Btn>
                    ) : (
                      <span class="paid-tick"><Ic n="check" s={16} w={3} /></span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {!s.billRequested ? (
            <Btn kind="ghost" full icon="bell" onClick={() => (A.requestBill(s.id), toast(t('billRequested', lang), 'ok'))}>{t('askBill', lang)}</Btn>
          ) : (
            <p class="notice">{t('billRequested', lang)}</p>
          )}
        </>
      )}
      {due === 0 && pending > 0 && <p class="notice">{t('waitingConfirm', lang)}</p>}

      <Sheet open={!!paying} onClose={() => setPaying(null)} title={t('pay', lang)}>
        {paying && <PayFlow r={r} amount={paying.amount} lang={lang} reference={`${table.label}-${s.id.slice(-4).toUpperCase()}`} onResult={onResult} onCancel={() => setPaying(null)} />}
      </Sheet>
    </div>
  );
}

// ---------- Quiz (table vs table) ----------
function Quiz({ r, s, lang, table }) {
  const qs = useMemo(() => {
    const start = ((s.quiz?.played || 0) * 5) % QUIZ.length;
    return Array.from({ length: 5 }, (_, i) => QUIZ[(start + i) % QUIZ.length]);
  }, [s.quiz?.played]);
  const [i, setI] = useState(0);
  const [pick, setPick] = useState(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [board, setBoard] = useState([]);
  useEffect(() => {
    A.quizBoard(r.id).then(setBoard).catch(() => {});
  }, [finished, s.quiz?.score]);
  const q = qs[i];
  const answer = (k) => {
    if (pick != null) return;
    setPick(k);
    if (k === q.c) setScore(score + 1);
  };
  const next = () => {
    if (i < qs.length - 1) {
      setI(i + 1);
      setPick(null);
    } else {
      A.addQuizScore(s.id, score);
      setFinished(true);
    }
  };
  return (
    <div class="quiz">
      <div class="quiz-h">
        <Ic n="game" s={20} />
        <b>{t('quiz', lang)}</b>
        <span class="mono">{num(score, lang)} {t('points', lang)}</span>
      </div>
      {!finished ? (
        <>
          <small class="mono">{num(i + 1, lang)} / {num(qs.length, lang)}</small>
          <h3>{L(q.q, lang)}</h3>
          <div class="answers">
            {q.a.map((a, k) => (
              <button type="button" class={'ans' + (pick != null && k === q.c ? ' right' : '') + (pick === k && k !== q.c ? ' wrong' : '')} onClick={() => answer(k)} disabled={pick != null}>
                {L(a, lang)}
              </button>
            ))}
          </div>
          {pick != null && (
            <>
              <p class={pick === q.c ? 'ok-t' : 'bad-t'}>{pick === q.c ? t('correct', lang) : `${t('wrong', lang)}: ${L(q.a[q.c], lang)}`}</p>
              <Btn kind="brand" full onClick={next}>{i < qs.length - 1 ? t('next', lang) : t('roundDone', lang)}</Btn>
            </>
          )}
        </>
      ) : (
        <div class="quiz-done">
          <h3>{t('roundDone', lang)} · {num(score, lang)}/{num(qs.length, lang)}</h3>
          <Btn kind="brand" onClick={() => (setI(0), setPick(null), setScore(0), setFinished(false))}>{t('playAgain', lang)}</Btn>
        </div>
      )}
      <div class="board">
        <small class="opt-l">{t('leaderboard', lang)}</small>
        {board.map((b, k) => (
          <div class={'brow' + (b.id === s.id ? ' me' : '')}>
            <span class="mono">#{num(k + 1, lang)}</span>
            <b>{t('table', lang)} {b.label}{b.id === s.id ? ` · ${t('thisTable', lang)}` : ''}</b>
            <span class="mono">{num(b.score, lang)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
