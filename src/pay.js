// Payment chooser (simulated gateways), receipt and review form
import { useState } from './hooks.js';
import { Ic, Btn, QR, saveFile } from './ui.js';
import { t } from './i18n.js';
import { L, tk, num, PAY_METHODS, isBdPhone, clock, dateStr } from './util.js';
import { LIVE } from './backend.js';
import { gatewayFor } from './actions.js';
import { lineMeta } from './menu.js';

const METHOD_ICON = { bkash: 'wallet', nagad: 'wallet', rocket: 'wallet', card: 'card', banglaqr: 'qr', bank: 'bank', cash: 'cash' };
export const METHOD_ORDER = ['bkash', 'nagad', 'rocket', 'card', 'banglaqr', 'bank', 'cash'];
export const methodLabel = (m, lang) => (lang === 'bn' ? PAY_METHODS[m]?.bn : PAY_METHODS[m]?.label) || m;

export const trxId = (m) => (PAY_METHODS[m]?.short || 'TX').toUpperCase().replace(/[^A-Z]/g, 'X') + Math.random().toString(36).slice(2, 10).toUpperCase();

// onResult({method, status:'paid'|'pending', trx, wallet, ref}) or, live with a gateway, onResult({method, gateway})
export function PayFlow({ r, amount, lang, reference, onResult, onCancel, allowCash = true, cashLabel }) {
  const methods = METHOD_ORDER.filter(
    (m) => r.payments?.[m]?.on && (allowCash || m !== 'cash') && !(LIVE && m === 'card' && !gatewayFor(r, 'card'))
  );
  const [m, setM] = useState(null);
  const [wallet, setWallet] = useState('');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const gw = m ? gatewayFor(r, m) : null;
  const baseKind = m ? PAY_METHODS[m].kind : null;
  const kind = LIVE && (baseKind === 'mfs' || baseKind === 'gateway') ? (gw ? 'live-gateway' : 'live-manual') : baseKind;
  const bn = lang === 'bn';

  const run = async (payload) => {
    setErr('');
    setBusy(true);
    try {
      await onResult(payload);
    } catch (e) {
      setErr(e.message || String(e));
    }
    setBusy(false);
  };

  const finishDemoGateway = () => {
    if (baseKind === 'mfs' && !isBdPhone(wallet)) {
      setErr(t('badPhone', lang));
      return;
    }
    setErr('');
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      onResult({ method: m, status: 'paid', trx: trxId(m), wallet: wallet.replace(/\D/g, '').replace(/^(\d{3})\d{5}/, '$1•••••') });
    }, 1300);
  };

  if (!methods.length) return <p class="muted pad">{t('noPay', lang)}</p>;

  if (!m)
    return (
      <div class="payflow">
        <div class="pay-amount">
          <span>{t('pay', lang)}</span>
          <b>{tk(amount, lang)}</b>
        </div>
        <p class="opt-l">{t('choosePay', lang)}</p>
        <div class="methods">
          {methods.map((k) => (
            <button type="button" class={'method m-' + k} onClick={() => setM(k)}>
              <span class="m-ic"><Ic n={METHOD_ICON[k]} s={18} /></span>
              <span class="m-l">
                <b>{k === 'cash' && cashLabel ? cashLabel : methodLabel(k, lang)}</b>
                <small>
                  {PAY_METHODS[k].kind === 'mfs' ? (bn ? 'মোবাইল ব্যাংকিং' : 'Mobile wallet') : k === 'card' ? 'Visa · Mastercard · Amex' : k === 'banglaqr' ? (bn ? 'যেকোনো ব্যাংক অ্যাপ' : 'Any bank or wallet app') : k === 'bank' ? r.payments.bank?.bank : ''}
                </small>
              </span>
              <Ic n="right" s={16} />
            </button>
          ))}
        </div>
        {onCancel && <Btn kind="ghost" full onClick={onCancel}>{bn ? 'বাতিল' : 'Cancel'}</Btn>}
      </div>
    );

  return (
    <div class="payflow">
      <button type="button" class="back-link" onClick={() => (setM(null), setErr(''))}>
        <Ic n="left" s={16} /> {t('choosePay', lang)}
      </button>
      <div class="pay-amount">
        <span>{m === 'cash' && cashLabel ? cashLabel : methodLabel(m, lang)}</span>
        <b>{tk(amount, lang)}</b>
      </div>
      {!LIVE && <p class="demo-note"><Ic n="alert" s={14} /> {t('demoPay', lang)}</p>}

      {kind === 'live-gateway' && (
        <p class="muted small">
          {bn
            ? `আপনাকে ${gw === 'bkash' ? 'বিকাশের' : 'নিরাপদ'} পেমেন্ট পেজে নেওয়া হবে। পেমেন্ট শেষে আবার এখানে ফিরে আসবেন।`
            : `You'll continue to the secure ${gw === 'bkash' ? 'bKash' : 'payment'} page and come back here when it's done.`}
        </p>
      )}
      {kind === 'live-manual' && (
        <div class="bank-box">
          <span>{bn ? 'এই নম্বরে সেন্ড মানি / পেমেন্ট করুন' : 'Send the amount to this number'}</span>
          <b class="mono">{r.payments[m]?.number || '—'}</b>
          <span>{t('reference', lang)}: <b>{reference}</b></span>
          <label class="opt-l" for="pay-trx">{bn ? 'ট্রানজেকশন আইডি (TrxID)' : 'Transaction ID (TrxID)'}</label>
          <input id="pay-trx" class="input mono" value={ref} onInput={(e) => setRef(e.target.value.toUpperCase())} placeholder="e.g. BHK7Q2M9XZ" />
          <small class="muted">{bn ? 'স্টাফ নিশ্চিত করলেই বিল পরিশোধ হবে।' : 'Staff check it in their app, then your bill is marked paid.'}</small>
        </div>
      )}
      {!LIVE && baseKind === 'mfs' && (
        <div class="opt">
          <label class="opt-l" for="pay-wallet">{t('wallet', lang)} ({methodLabel(m, lang)})</label>
          <input id="pay-wallet" class="input" inputMode="numeric" placeholder="01XXXXXXXXX" value={wallet} onInput={(e) => setWallet(e.target.value)} />
          <small class="muted">{t('gatewayNote', lang)}</small>
        </div>
      )}
      {!LIVE && baseKind === 'gateway' && (
        <p class="muted small">{t('cardVia', lang)} {r.payments.card?.gateway || 'SSLCommerz'}. {t('gatewayNote', lang)}</p>
      )}
      {kind === 'qr' && (
        <div class="qr-pay">
          <QR text={`BANGLAQR|${r.name.en}|${amount}|${reference}`} size={168} />
          <small>{t('scanBank', lang)}</small>
          <small>{t('reference', lang)}: <b>{reference}</b></small>
        </div>
      )}
      {kind === 'bank' && (
        <div class="bank-box">
          <span>{t('transferTo', lang)}</span>
          <b>{r.payments.bank?.bank}</b>
          <span>{r.name.en} · A/C {r.payments.bank?.account || '—'}</span>
          <span>{t('reference', lang)}: <b>{reference}</b></span>
          <label class="opt-l" for="pay-ref">{t('reference', lang)} / TrxID</label>
          <input id="pay-ref" class="input" value={ref} onInput={(e) => setRef(e.target.value)} placeholder="e.g. FT2611200045" />
        </div>
      )}
      {kind === 'cash' && <p class="cash-note">{cashLabel ? '' : t('cashNote', lang)}</p>}
      {err && <p class="err">{err}</p>}

      {kind === 'live-gateway' && (
        <Btn kind="brand" size="lg" full disabled={busy} onClick={() => run({ method: m, gateway: gw })}>
          {busy ? (bn ? 'পেমেন্ট পেজ খুলছে…' : 'Opening payment page…') : `${t('payNow', lang)} ${tk(amount, lang)}`}
        </Btn>
      )}
      {kind === 'live-manual' && (
        <Btn kind="brand" size="lg" full disabled={busy || ref.trim().length < 6} onClick={() => run({ method: m, status: 'pending', trx: ref.trim() })}>{t('ivePaid', lang)}</Btn>
      )}
      {!LIVE && (baseKind === 'mfs' || baseKind === 'gateway') && (
        <Btn kind="brand" size="lg" full disabled={busy} onClick={finishDemoGateway}>
          {busy ? t('processing', lang) : `${t('payNow', lang)} ${tk(amount, lang)}`}
        </Btn>
      )}
      {(kind === 'qr' || kind === 'bank') && (
        <Btn kind="brand" size="lg" full disabled={busy} onClick={() => run({ method: m, status: 'pending', ref: ref || reference })}>{t('ivePaid', lang)}</Btn>
      )}
      {kind === 'cash' && (
        <Btn kind="brand" size="lg" full disabled={busy} onClick={() => run({ method: m, status: 'pending' })}>
          {cashLabel || (bn ? 'ক্যাশে দেব' : 'Pay with cash')}
        </Btn>
      )}
    </div>
  );
}

export function Receipt({ r, lines, bill, meta = {}, lang = 'en' }) {
  return (
    <div class="receipt">
      <div class="rc-head">
        <b>{L(r.name, lang)}</b>
        <small>{r.address}</small>
        {r.bin && <small>BIN {r.bin}</small>}
        <small class="rc-kind">{lang === 'bn' ? 'ট্যাক্স ইনভয়েস' : 'Tax invoice'}</small>
      </div>
      <div class="rc-meta">
        <span>{meta.invoiceNo || '—'}</span>
        <span>{meta.where}</span>
        <span>{meta.when ? dateStr(meta.when) + ' · ' + clock(meta.when) : ''}</span>
      </div>
      <table class="rc-lines">
        <tbody>
          {lines.map((l) => (
            <tr>
              <td>
                {num(l.qty, lang)} × {L(l.name, lang)}
                {lineMeta(l, lang) && <small>{lineMeta(l, lang)}</small>}
              </td>
              <td>{tk(l.unit * l.qty, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl class="rc-tot">
        <dt>{t('subtotal', lang)}</dt>
        <dd>{tk(bill.subtotal, lang)}</dd>
        {bill.sc > 0 && (<><dt>{t('sc', lang)} {num(bill.scPct, lang)}%</dt><dd>{tk(bill.sc, lang)}</dd></>)}
        {bill.packaging > 0 && (<><dt>{t('packaging', lang)}</dt><dd>{tk(bill.packaging, lang)}</dd></>)}
        {bill.delivery > 0 && (<><dt>{t('deliveryFee', lang)}</dt><dd>{tk(bill.delivery, lang)}</dd></>)}
        <dt>{bill.inclusive ? t('vatIncl', lang) : t('vat', lang)} {num(bill.vatPct, lang)}%</dt>
        <dd>{tk(bill.vat, lang)}</dd>
        {bill.tip > 0 && (<><dt>{t('tip', lang)}</dt><dd>{tk(bill.tip, lang)}</dd></>)}
        <dt class="grand">{t('total', lang)}</dt>
        <dd class="grand">{tk(bill.total, lang)}</dd>
      </dl>
      {meta.paidBy && (
        <div class="rc-paid">
          {Object.entries(meta.paidBy).map(([k, v]) => (
            <span>{methodLabel(k, lang)} {tk(v, lang)}</span>
          ))}
        </div>
      )}
      {meta.paid && <span class="stamp">{lang === 'bn' ? 'পরিশোধিত' : 'PAID'}</span>}
      <small class="rc-foot">{lang === 'bn' ? 'আবার আসবেন!' : 'Thank you. Please come again!'}</small>
    </div>
  );
}

export function receiptText(r, lines, bill, meta) {
  const row = (a, b) => a.padEnd(30).slice(0, 30) + String(b).padStart(10);
  return [
    r.name.en, r.address, r.bin ? 'BIN ' + r.bin : '', 'TAX INVOICE', '',
    (meta.invoiceNo || '') + '  ' + (meta.where || ''), meta.when ? dateStr(meta.when) + ' ' + clock(meta.when) : '', ''.padEnd(40, '-'),
    ...lines.map((l) => row(`${l.qty} x ${l.name.en}${l.size === 'half' ? ' (half)' : ''}`, '৳' + l.unit * l.qty)),
    ''.padEnd(40, '-'),
    row('Subtotal', '৳' + bill.subtotal),
    bill.sc ? row(`Service charge ${bill.scPct}%`, '৳' + bill.sc) : '',
    bill.packaging ? row('Packaging', '৳' + bill.packaging) : '',
    bill.delivery ? row('Delivery', '৳' + bill.delivery) : '',
    row(`VAT ${bill.vatPct}%${bill.inclusive ? ' (incl.)' : ''}`, '৳' + bill.vat),
    bill.tip ? row('Tip', '৳' + bill.tip) : '',
    row('TOTAL', '৳' + bill.total),
    meta.paidBy ? 'Paid: ' + Object.entries(meta.paidBy).map(([k, v]) => `${PAY_METHODS[k]?.label || k} ৳${v}`).join(', ') : '',
  ].filter((x) => x !== '').join('\n');
}

export function ReviewForm({ lang, onSubmit, done }) {
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState([]);
  const [comment, setComment] = useState('');
  if (done)
    return (
      <div class="review done">
        <div class="big-check"><Ic n="check" s={32} w={3} /></div>
        <h3>{t('thanks', lang)}</h3>
        <p class="muted">{t('thanksBody', lang)}</p>
      </div>
    );
  const TAGK = ['tagFood', 'tagFast', 'tagStaff', 'tagValue', 'tagClean'];
  return (
    <div class="review">
      <h3>{t('howWas', lang)}</h3>
      <div class="stars" role="radiogroup" aria-label={t('rate', lang)}>
        {[1, 2, 3, 4, 5].map((s) => (
          <button type="button" role="radio" aria-checked={stars === s} aria-label={s + ' stars'} class={s <= stars ? 'on' : ''} onClick={() => setStars(s)}>
            <Ic n="star" s={34} w={1.5} />
          </button>
        ))}
      </div>
      <div class="chips center">
        {TAGK.map((k) => {
          const on = tags.includes(k);
          return (
            <button type="button" class={'chip' + (on ? ' on' : '')} onClick={() => setTags(on ? tags.filter((x) => x !== k) : [...tags, k])}>
              {t(k, lang)}
            </button>
          );
        })}
      </div>
      <textarea id="review-comment" class="input" rows="3" placeholder={t('tellMore', lang)} value={comment} onInput={(e) => setComment(e.target.value)} />
      <Btn kind="brand" size="lg" full disabled={!stars} onClick={() => onSubmit({ stars, tags: tags.map((k) => t(k, 'en')), comment })}>
        {t('submit', lang)}
      </Btn>
    </div>
  );
}

export async function downloadReceipt(r, lines, bill, meta) {
  return saveFile(`${r.id}-${meta.invoiceNo || 'receipt'}.txt`, receiptText(r, lines, bill, meta));
}
