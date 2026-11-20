// Menu browsing, item options and cart: shared by table ordering and takeaway/delivery ordering.
import { useState, useMemo, useRef } from './hooks.js';
import { Ic, Btn, Sheet } from './ui.js';
import { t } from './i18n.js';
import { L, tk, num, uid, unitPrice, itemById, ALLERGENS, SPICE, TAGS, computeBill, sumLines } from './util.js';

export const Plate = ({ item, size = 56, dim }) => (
  <span class={'plate' + (dim ? ' dim' : '')} style={{ width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.5) + 'px' }} aria-hidden="true">
    {item?.icon || '🍽️'}
  </span>
);

export const Chilis = ({ n = 0, max = 4 }) => (
  <span class="chilis" aria-label={`Spice ${n + 1} of ${max}`}>
    {Array.from({ length: max }, (_, i) => (
      <Ic n="flame" s={14} cls={i <= n ? 'on' : ''} />
    ))}
  </span>
);

export function priceLabel(item, lang) {
  if (item.half) return `${t('half', lang)} ${tk(item.half, lang)} · ${t('full', lang)} ${tk(item.price, lang)}`;
  return tk(item.price, lang);
}

export function MenuList({ r, lang, onOpen, cartQty = {}, compact }) {
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [veg, setVeg] = useState(false);
  const cats = r.categories.filter((c) => r.items.some((i) => i.cat === c.id));
  const qq = q.trim().toLowerCase();
  const list = r.items.filter(
    (i) =>
      (cat === 'all' || i.cat === cat) &&
      (!veg || i.veg) &&
      (!qq || (i.name.en + ' ' + i.name.bn + ' ' + (i.desc?.en || '')).toLowerCase().includes(qq))
  );
  const grouped = cats
    .map((c) => ({ c, items: list.filter((i) => i.cat === c.id) }))
    .filter((g) => g.items.length);
  return (
    <div class="menu">
      <div class="menu-tools">
        <label class="search">
          <Ic n="search" s={16} />
          <input id={'menu-search-' + r.id} type="search" placeholder={t('search', lang)} value={q} onInput={(e) => setQ(e.target.value)} />
        </label>
        <button type="button" class={'chip' + (veg ? ' on veg' : '')} onClick={() => setVeg(!veg)}>
          <Ic n="leaf" s={14} />
          {t('vegOnly', lang)}
        </button>
      </div>
      <div class="cats" role="tablist">
        <button type="button" class={'cat' + (cat === 'all' ? ' on' : '')} onClick={() => setCat('all')}>{t('all', lang)}</button>
        {cats.map((c) => (
          <button type="button" class={'cat' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>
            {L(c.name, lang)}
          </button>
        ))}
      </div>
      {grouped.length === 0 && <p class="muted center pad">{lang === 'bn' ? 'কিছু পাওয়া যায়নি' : 'No dishes match'}</p>}
      {grouped.map((g) => (
        <section class="menu-group">
          <h4>{L(g.c.name, lang)}</h4>
          {g.items.map((i) => (
            <button type="button" class={'dish' + (i.available ? '' : ' out') + (compact ? ' compact' : '')} onClick={() => i.available && onOpen(i)} disabled={!i.available}>
              <Plate item={i} size={compact ? 44 : 58} dim={!i.available} />
              <span class="dish-main">
                <span class="dish-name">
                  {L(i.name, lang)}
                  {i.veg && <Ic n="leaf" s={13} cls="veg" />}
                </span>
                {!compact && i.desc && L(i.desc, lang) && <span class="dish-desc">{L(i.desc, lang)}</span>}
                <span class="dish-meta">
                  <b>{priceLabel(i, lang)}</b>
                  {i.tags.map((tg) => TAGS[tg] && <span class={'tag t-' + tg}>{L(TAGS[tg], lang)}</span>)}
                  {!i.available && <span class="tag t-out">{t('soldOut', lang)}</span>}
                </span>
              </span>
              {i.available && (
                <span class={'dish-add' + (cartQty[i.id] ? ' has' : '')} aria-label={t('add', lang)}>
                  {cartQty[i.id] ? num(cartQty[i.id], lang) : <Ic n="plus" s={18} w={2.4} />}
                </span>
              )}
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

export function buildLines(r, item, { size, spice, qty, note, deal }, guest) {
  const cat = r.categories.find((c) => c.id === item.cat);
  const main = {
    key: uid('l'), itemId: item.id, name: item.name, icon: item.icon, qty, size: item.half ? size : 'full',
    spice: item.spice ? spice : null, note: note || '', unit: unitPrice(item, size), station: cat?.station || r.stations[0]?.id, guest: guest || '',
  };
  const out = [main];
  if (deal && item.deal) {
    const d = itemById(r, item.deal.itemId);
    if (d) {
      const dc = r.categories.find((c) => c.id === d.cat);
      out.push({
        key: uid('l'), itemId: d.id, name: d.name, icon: d.icon, qty, size: 'full', spice: null, note: '', unit: item.deal.price,
        station: dc?.station || r.stations[0]?.id, guest: guest || '', deal: true,
      });
    }
  }
  return out;
}

export function ItemSheet({ r, item, lang, onClose, onAdd }) {
  const [size, setSize] = useState(item?.half ? 'full' : 'full');
  const [spice, setSpice] = useState(1);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [deal, setDeal] = useState(false);
  if (!item) return null;
  const dealItem = item.deal ? itemById(r, item.deal.itemId) : null;
  const unit = unitPrice(item, size) + (deal && dealItem ? item.deal.price : 0);
  return (
    <Sheet open={!!item} onClose={onClose} title={L(item.name, lang)}>
      <div class="item-sheet">
        <div class="item-hero">
          <Plate item={item} size={96} />
          <div>
            <h3>{L(item.name, lang)}</h3>
            <p class="muted">{L(item.desc, lang)}</p>
            <b class="price">{priceLabel(item, lang)}</b>
          </div>
        </div>
        <div class="opt">
          <span class="opt-l">{t('allergens', lang)}</span>
          <div class="chips">
            {item.allergens.length ? item.allergens.map((a) => <span class="chip warn">{L(ALLERGENS[a], lang)}</span>) : <span class="muted small">{t('noAllergens', lang)}</span>}
          </div>
        </div>
        {item.half && (
          <div class="opt">
            <span class="opt-l">{t('size', lang)}</span>
            <div class="seg big">
              {['half', 'full'].map((s) => (
                <button type="button" class={size === s ? 'on' : ''} onClick={() => setSize(s)}>
                  {t(s, lang)} <small>{tk(unitPrice(item, s), lang)}</small>
                </button>
              ))}
            </div>
          </div>
        )}
        {item.spice && (
          <div class="opt">
            <span class="opt-l">{t('spice', lang)}</span>
            <div class="seg big">
              {SPICE.map((s, i) => (
                <button type="button" class={spice === i ? 'on' : ''} onClick={() => setSpice(i)}>
                  <Chilis n={i} />
                  <small>{L(s, lang)}</small>
                </button>
              ))}
            </div>
          </div>
        )}
        {dealItem && (
          <button type="button" class={'deal' + (deal ? ' on' : '')} onClick={() => setDeal(!deal)}>
            <span class="deal-check">{deal && <Ic n="check" s={14} w={3} />}</span>
            <Plate item={dealItem} size={36} />
            <span class="deal-t">
              <b>{t('deal', lang)}: + {L(dealItem.name, lang)}</b>
              <small>
                {tk(item.deal.price, lang)} <s>{tk(dealItem.price, lang)}</s> · {t('save', lang)} {tk(dealItem.price - item.deal.price, lang)}
              </small>
            </span>
          </button>
        )}
        <div class="opt">
          <label class="opt-l" for="item-note">{t('requests', lang)}</label>
          <input id="item-note" class="input" placeholder={t('requestsPh', lang)} value={note} onInput={(e) => setNote(e.target.value)} />
        </div>
        <div class="item-foot">
          <div class="stepper">
            <button type="button" aria-label="Less" onClick={() => setQty(Math.max(1, qty - 1))}><Ic n="minus" s={16} /></button>
            <b>{num(qty, lang)}</b>
            <button type="button" aria-label="More" onClick={() => setQty(qty + 1)}><Ic n="plus" s={16} /></button>
          </div>
          <Btn kind="brand" size="lg" onClick={() => onAdd({ size, spice, qty, note, deal })}>
            {t('addToOrder', lang)} · {tk(unit * qty, lang)}
          </Btn>
        </div>
      </div>
    </Sheet>
  );
}

export const lineMeta = (li, lang) =>
  [li.size === 'half' ? t('half', lang) : null, li.spice != null ? L(SPICE[li.spice], lang) : null, li.deal ? t('dealTag', lang) : null, li.note || null]
    .filter(Boolean)
    .join(' · ');

export function CartLines({ lines, setLines, lang, showGuest }) {
  const change = (key, d) =>
    setLines(lines.map((l) => (l.key === key ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0));
  return (
    <ul class="cart-lines">
      {lines.map((l) => (
        <li>
          <Plate item={l} size={40} />
          <span class="cl-main">
            <b>{L(l.name, lang)}</b>
            <small>{[lineMeta(l, lang), showGuest && l.guest].filter(Boolean).join(' · ')}</small>
          </span>
          <div class="stepper sm">
            <button type="button" aria-label="Less" onClick={() => change(l.key, -1)}><Ic n="minus" s={14} /></button>
            <b>{num(l.qty, lang)}</b>
            <button type="button" aria-label="More" onClick={() => change(l.key, 1)}><Ic n="plus" s={14} /></button>
          </div>
          <span class="cl-price">{tk(l.unit * l.qty, lang)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Totals({ bill, lang, onlyTotal }) {
  return (
    <dl class="totals">
      {!onlyTotal && (
        <>
          <dt>{t('subtotal', lang)}</dt>
          <dd>{tk(bill.subtotal, lang)}</dd>
          {bill.sc > 0 && (
            <>
              <dt>{t('sc', lang)} ({num(bill.scPct, lang)}%)</dt>
              <dd>{tk(bill.sc, lang)}</dd>
            </>
          )}
          {bill.packaging > 0 && (
            <>
              <dt>{t('packaging', lang)}</dt>
              <dd>{tk(bill.packaging, lang)}</dd>
            </>
          )}
          {bill.delivery > 0 && (
            <>
              <dt>{t('deliveryFee', lang)}</dt>
              <dd>{tk(bill.delivery, lang)}</dd>
            </>
          )}
          <dt>{bill.inclusive ? t('vatIncl', lang) : t('vat', lang)} ({num(bill.vatPct, lang)}%)</dt>
          <dd>{tk(bill.vat, lang)}</dd>
          {bill.tip > 0 && (
            <>
              <dt>{t('tip', lang)}</dt>
              <dd>{tk(bill.tip, lang)}</dd>
            </>
          )}
        </>
      )}
      <dt class="grand">{t('total', lang)}</dt>
      <dd class="grand">{tk(bill.total, lang)}</dd>
    </dl>
  );
}

export const cartCount = (lines) => lines.reduce((a, l) => a + (l.deal ? 0 : l.qty), 0);
export const cartQtyMap = (lines) => lines.reduce((m, l) => (l.deal ? m : ((m[l.itemId] = (m[l.itemId] || 0) + l.qty), m)), {});
export const cartBill = (r, lines, opts) => computeBill(r, sumLines(lines), opts);
