// Takeaway & delivery ordering page (shared on Facebook/WhatsApp or printed on flyers)
import { useState, useEffect } from './hooks.js';
import { Ic, Btn, Sheet, Logo, useNow, Empty } from './ui.js';
import { t } from './i18n.js';
import { state, get, toast } from './store.js';
import { L, tk, num, clock, isBdPhone, sumLines, computeBill, itemById } from './util.js';
import * as A from './actions.js';
import { MenuList, ItemSheet, buildLines, CartLines, Totals, cartCount, cartQtyMap, lineMeta } from './menu.js';
import { PayFlow, ReviewForm, methodLabel } from './pay.js';
import { useDevice, useLang, LangSwitch, LegalFoot } from './customer.js';
import { LIVE } from './backend.js';

export function OnlineApp({ rid, embedded }) {
  const r = A.restaurant(rid);
  const [dev, setDev] = useDevice('online:' + rid);
  const [lang, setLang] = useLang();
  const [mode, setMode] = useState('takeaway');
  const [cart, setCart] = useState([]);
  const [item, setItem] = useState(null);
  const [step, setStep] = useState('menu');
  const [zone, setZone] = useState('');
  const [form, setForm] = useState({ name: dev.name || '', phone: dev.phone || '', address: dev.address || '' });
  const [payWay, setPayWay] = useState('online');
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState('');
  const [trackId, setTrackId] = useState(null);
  useEffect(() => {
    if (r && !r.features.takeaway && r.features.delivery) setMode('delivery');
  }, [rid]);

  const cls = 'cust online' + (embedded ? ' embedded' : ' standalone');
  if (!state.loaded) return <div class={cls}><p class="pad muted center">Loading…</p></div>;
  if (!r) return <div class={cls}><Empty icon="store" title="Restaurant not found" /></div>;
  const style = { '--brand': r.brand };
  const canT = r.features.takeaway;
  const canD = r.features.delivery && (r.online.zones || []).length > 0;
  if ((!canT && !canD) || r.status === 'suspended')
    return (
      <div class={cls} style={style}>
        <Empty icon="bag" title={lang === 'bn' ? 'অনলাইন অর্ডার বন্ধ' : 'Online ordering is not available'} body={lang === 'bn' ? 'রেস্টুরেন্টে এসে অর্ডার করুন।' : 'Please visit the restaurant to order.'} />
      </div>
    );

  const myOrders = (dev.orders || []).map((id) => get('orders', id)).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
  const tracking = trackId ? get('orders', trackId) : step === 'track' ? myOrders[0] : null;
  const z = (r.online.zones || []).find((x) => x.id === zone);
  const sub = sumLines(cart);
  const bill = computeBill(r, sub, { packaging: cart.length ? r.online.packaging || 0 : 0, delivery: mode === 'delivery' && z ? z.fee : 0 });
  const count = cartCount(cart);

  const validate = () => {
    if (!form.name.trim()) return lang === 'bn' ? 'নাম দিন' : 'Add your name';
    if (!isBdPhone(form.phone)) return t('badPhone', lang);
    if (mode === 'delivery' && !z) return lang === 'bn' ? 'ডেলিভারি এলাকা বাছুন' : 'Choose your delivery area';
    if (mode === 'delivery' && form.address.trim().length < 6) return t('needAddress', lang);
    if (sub < (r.online.minOrder || 0)) return `${t('belowMin', lang)} (${t('minOrder', lang)} ${tk(r.online.minOrder, lang)})`;
    return '';
  };

  const remember = (id) => setDev({ orders: [id, ...(dev.orders || [])].slice(0, 10), name: form.name, phone: form.phone, address: form.address });
  const customer = () => ({ name: form.name.trim(), phone: form.phone.replace(/\D/g, ''), address: mode === 'delivery' ? form.address.trim() : '', zone: z ? z.id : '' });

  // live mode: the server checks prices and works out the bill, then payment starts
  const submitLive = async (pay) => {
    let saved;
    try {
      saved = await A.placeOrderAsync(rid, {
        channel: mode, lines: cart, note: '', customer: customer(), bill, zone: z ? z.id : '',
        payment: { method: pay.method, status: pay.method === 'cash' ? 'unpaid' : 'pending' },
      });
    } catch (e) {
      setErr(e.message);
      setPaying(false);
      throw e;
    }
    remember(saved.id);
    setCart([]);
    setTrackId(saved.id);
    if (pay.gateway) {
      await A.startGatewayPayment(rid, null, { orderId: saved.id, method: pay.method, who: form.name.trim() });
      return;
    }
    if (pay.method !== 'cash') A.createPayment(rid, null, { orderId: saved.id, method: pay.method, trx: pay.trx || '', ref: pay.ref || '', who: form.name.trim() });
    setPaying(false);
    setStep('track');
    toast(t('orderSent', lang), 'ok');
  };

  const submit = (payment) => {
    if (LIVE) return submitLive(payment);
    const id = A.placeOrder(rid, { channel: mode, lines: cart, note: '', customer: customer(), bill, payment, zone: z ? z.id : '' });
    remember(id);
    setCart([]);
    setPaying(false);
    setTrackId(id);
    setStep('track');
    toast(t('orderSent', lang), 'ok');
  };

  const place = () => {
    const e = validate();
    setErr(e);
    if (e) return;
    if (payWay === 'online') setPaying(true);
    else Promise.resolve(submit({ method: 'cash', status: 'unpaid' })).catch(() => {});
  };

  return (
    <div class={cls} style={style}>
      <header class="c-head">
        {step !== 'menu' ? (
          <button type="button" class="icon-btn" aria-label="Back" onClick={() => (setStep('menu'), setTrackId(null))}><Ic n="left" s={20} /></button>
        ) : (
          <Logo r={r} size={34} />
        )}
        <div class="c-title">
          <b>{L(r.name, lang)}</b>
          <small>{t('orderOnline', lang)} · {r.area}</small>
        </div>
        <LangSwitch lang={lang} setLang={setLang} />
      </header>

      <main class="c-body">
        {step === 'menu' && (
          <>
            <div class="pad-x mode-row">
              <div class="seg big">
                {canT && <button type="button" class={mode === 'takeaway' ? 'on' : ''} onClick={() => setMode('takeaway')}><Ic n="bag" s={16} /> {t('takeaway', lang)}</button>}
                {canD && <button type="button" class={mode === 'delivery' ? 'on' : ''} onClick={() => setMode('delivery')}><Ic n="bike" s={16} /> {t('delivery', lang)}</button>}
              </div>
              <small class="muted">
                {t('minOrder', lang)} {tk(r.online.minOrder || 0, lang)}
                {mode === 'delivery' && canD ? ` · ${t('deliveryFee', lang)} ${tk(Math.min(...r.online.zones.map((x) => x.fee)), lang)}+` : ''}
              </small>
              {myOrders.length > 0 && (
                <button type="button" class="track-link" onClick={() => (setTrackId(myOrders[0].id), setStep('track'))}>
                  <Ic n="clock" s={14} /> {t('track', lang)} #{num(myOrders[0].no, lang)}
                </button>
              )}
            </div>
            <MenuList r={r} lang={lang} cartQty={cartQtyMap(cart)} onOpen={setItem} />
            <LegalFoot lang={lang} />
          </>
        )}

        {step === 'checkout' && (
          <div class="pad-x checkout">
            <h2>{t('yourOrder', lang)}</h2>
            {cart.length ? <CartLines lines={cart} setLines={setCart} lang={lang} /> : <p class="muted">{t('emptyCart', lang)}</p>}
            {mode === 'delivery' && (
              <>
                <label class="opt-l" for="zone">{t('area', lang)}</label>
                <select id="zone" class="input" value={zone} onChange={(e) => setZone(e.target.value)}>
                  <option value="">{lang === 'bn' ? 'এলাকা বাছুন' : 'Choose area'}</option>
                  {r.online.zones.map((x) => (
                    <option value={x.id}>{x.name} · {tk(x.fee, lang)} · {num(x.eta, lang)} {t('minutes', lang)}</option>
                  ))}
                </select>
              </>
            )}
            <h4 class="sub-h">{t('details', lang)}</h4>
            <div class="form-grid">
              <label class="opt-l" for="on-name">{t('name', lang)}</label>
              <input id="on-name" class="input" value={form.name} onInput={(e) => setForm({ ...form, name: e.target.value })} />
              <label class="opt-l" for="on-phone">{t('mobile', lang)}</label>
              <input id="on-phone" class="input" inputMode="tel" placeholder="01XXXXXXXXX" value={form.phone} onInput={(e) => setForm({ ...form, phone: e.target.value })} />
              {mode === 'delivery' && (
                <>
                  <label class="opt-l" for="on-addr">{t('address', lang)}</label>
                  <textarea id="on-addr" class="input" rows="2" placeholder="House, road, block, landmark" value={form.address} onInput={(e) => setForm({ ...form, address: e.target.value })} />
                </>
              )}
            </div>
            <div class="opt">
              <span class="opt-l">{t('pay', lang)}</span>
              <div class="seg big">
                <button type="button" class={payWay === 'online' ? 'on' : ''} onClick={() => setPayWay('online')}><Ic n="wallet" s={16} /> {t('payOnline', lang)}</button>
                {r.online.cod !== false && (
                  <button type="button" class={payWay === 'cod' ? 'on' : ''} onClick={() => setPayWay('cod')}><Ic n="cash" s={16} /> {mode === 'delivery' ? t('cod', lang) : t('payPickup', lang)}</button>
                )}
              </div>
            </div>
            <Totals bill={bill} lang={lang} />
            {err && <p class="err">{err}</p>}
            <Btn kind="brand" size="lg" full disabled={!cart.length} onClick={place}>{t('placeOnline', lang)} · {tk(bill.total, lang)}</Btn>
          </div>
        )}

        {step === 'track' && tracking && <Track r={r} o={tracking} lang={lang} onNew={() => (setStep('menu'), setTrackId(null))} />}
        {step === 'track' && !tracking && <Empty icon="bag" title={t('nothingYet', lang)} />}
      </main>

      {step === 'menu' && count > 0 && (
        <button type="button" class="cart-bar" onClick={() => setStep('checkout')}>
          <span class="cb-count">{num(count, lang)}</span>
          <span>{t('viewOrder', lang)}</span>
          <b>{tk(sub, lang)}</b>
        </button>
      )}

      {item && <ItemSheet r={r} item={item} lang={lang} onClose={() => setItem(null)} onAdd={(o) => (setCart([...cart, ...buildLines(r, item, o, '')]), setItem(null))} />}
      <Sheet open={paying} onClose={() => setPaying(false)} title={t('pay', lang)}>
        {paying && (
          <PayFlow r={r} amount={bill.total} lang={lang} allowCash={false} reference={'WEB-' + Date.now().toString().slice(-5)} onCancel={() => setPaying(false)}
            onResult={(res) => (LIVE ? submit(res) : submit({ method: res.method, status: res.status === 'paid' ? 'paid' : 'pending', trx: res.trx || '', ref: res.ref || '', paidAt: res.status === 'paid' ? Date.now() : null }))} />
        )}
      </Sheet>
    </div>
  );
}

function Track({ r, o, lang, onNew }) {
  const now = useNow(1000);
  const [sent, setSent] = useState(false);
  const delivery = o.channel === 'delivery';
  const z = (r.online.zones || []).find((x) => x.id === o.zone);
  const stages = delivery
    ? [['new', t('placed', lang)], ['kitchen', t('accepted', lang) + ' · ' + t('cooking', lang)], ['ready', t('ready', lang)], ['out', t('outFor', lang)], ['completed', t('delivered', lang)]]
    : [['new', t('placed', lang)], ['kitchen', t('accepted', lang) + ' · ' + t('cooking', lang)], ['ready', t('readyPickup', lang)], ['completed', t('pickedUp', lang)]];
  const idx = o.status === 'completed' ? stages.length : stages.findIndex(([k]) => k === o.status);
  const prep = Math.max(r.prepTarget || 15, ...o.items.map((li) => itemById(r, li.itemId)?.prep || 0));
  const etaAt = o.createdAt + (prep + (delivery ? z?.eta || 30 : 5)) * 60000;
  const minsLeft = Math.max(0, Math.round((etaAt - now) / 60000));
  return (
    <div class="pad-x track">
      {o.status === 'cancelled' ? (
        <p class="notice bad">{t('rejected', lang)}</p>
      ) : (
        <div class="hero-status hs-kitchen">
          <small class="mono">{delivery ? t('delivery', lang) : t('takeaway', lang)} · #{num(o.no, lang)}</small>
          <h2>{o.status === 'completed' ? (delivery ? t('delivered', lang) : t('pickedUp', lang)) : `${t('eta', lang)}: ${num(minsLeft, lang)} ${t('minutes', lang)}`}</h2>
          <ol class="vstages">
            {stages.map(([k, label], i) => (
              <li class={i < idx ? 'past' : i === idx ? 'now' : ''}>
                <span class="vdot">{i < idx ? <Ic n="check" s={12} w={3} /> : null}</span>
                {label}
                {k === 'out' && o.rider && i <= idx && <small> · {o.rider}</small>}
              </li>
            ))}
          </ol>
        </div>
      )}
      <div class="round">
        <div class="round-h">
          <b>{clock(o.createdAt, lang)}</b>
          <small>{o.customer?.name} · {o.customer?.phone}</small>
        </div>
        <ul>
          {o.items.map((li) => (
            <li>{num(li.qty, lang)} × {L(li.name, lang)}{lineMeta(li, lang) && <small> · {lineMeta(li, lang)}</small>}</li>
          ))}
        </ul>
        {o.bill && <Totals bill={o.bill} lang={lang} />}
        <p class="muted small">
          {methodLabel(o.payment?.method || 'cash', lang)} · {o.payment?.status === 'paid' ? t('paid', lang) : o.channel === 'delivery' ? t('cod', lang) : t('payPickup', lang)}
        </p>
      </div>
      {o.status === 'completed' && (sent || !(o.reviewed || A.reviewsFor(r.id).some((v) => v.orderId === o.id))) && (
        <ReviewForm lang={lang} done={sent} onSubmit={(v) => (A.submitReview(r.id, { ...v, orderId: o.id, guest: o.customer?.name || '' }), setSent(true))} />
      )}
      <Btn kind="soft" full icon="plus" onClick={onNew}>{t('newOrder', lang)}</Btn>
    </div>
  );
}
