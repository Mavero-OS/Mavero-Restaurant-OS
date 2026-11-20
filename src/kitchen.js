// Kitchen display: tickets split by station, colour-coded timers, tap to bump.
import { useState } from './hooks.js';
import { Ic, Btn, Logo, useNow, Empty } from './ui.js';
import { mmss, clock, SPICE } from './util.js';
import * as A from './actions.js';

export function KitchenApp({ rid, compact }) {
  const r = A.restaurant(rid);
  const now = useNow(1000);
  const [station, setStation] = useState('all');
  if (!r) return <Empty icon="store" title="Restaurant not found" />;
  const orders = A.ordersFor(rid);
  const live = orders.filter((o) => o.status === 'kitchen').sort((a, b) => (a.sentAt || a.createdAt) - (b.sentAt || b.createdAt));
  const ready = orders.filter((o) => o.status === 'ready' || ((o.status === 'served' || o.status === 'out' || o.status === 'completed') && o.readyAt && now - o.readyAt < 15 * 60e3)).sort((a, b) => b.readyAt - a.readyAt).slice(0, 8);
  const tLabel = (o) => (o.channel === 'dine' ? r.tables.find((x) => x.id === o.tableId)?.label || o.tableId : o.channel === 'delivery' ? 'DELIVERY' : 'TAKEAWAY');
  const target = (r.prepTarget || 15) * 60e3;
  const waits = live.map((o) => now - (o.sentAt || o.createdAt));
  const avg = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;
  const stations = r.stations;
  const shown = station === 'all' ? stations : stations.filter((s) => s.id === station);

  const Ticket = ({ o, st }) => {
    const lines = o.items.filter((li) => !st || li.station === st);
    if (!lines.length) return null;
    const age = now - (o.sentAt || o.createdAt);
    const tone = age > target ? 'late' : age > target * 0.6 ? 'warn' : 'ok';
    const allDone = lines.every((li) => o.done?.[li.key]);
    return (
      <div key={o.id + st} class={'ticket t-' + tone + (age < 8000 ? ' fresh' : '') + (allDone ? ' alldone' : '')}>
        <div class="tk-h">
          <b class={'tk-t ' + o.channel}>{tLabel(o)}</b>
          <span class="mono">#{o.no}{o.round > 1 ? ' · R' + o.round : ''}</span>
          <span class="mono tk-age">{mmss(age)}</span>
        </div>
        <ul>
          {lines.map((li) => {
            const d = !!o.done?.[li.key];
            return (
              <li>
                <button type="button" class={'tk-line' + (d ? ' done' : '')} onClick={() => A.bumpLine(o.id, li.key, !d)} aria-pressed={d}>
                  <b class="mono">{li.qty}</b>
                  <span>
                    {li.name.en}
                    <small>{li.name.bn}</small>
                    {(li.size === 'half' || li.spice != null || li.note) && (
                      <em>
                        {li.size === 'half' && <i class="mod">HALF</i>}
                        {li.spice != null && <i class={'mod sp' + li.spice}>{SPICE[li.spice].en.toUpperCase()}</i>}
                        {li.note && <i class="mod note">{li.note}</i>}
                      </em>
                    )}
                  </span>
                  {d && <Ic n="check" s={16} w={3} />}
                </button>
              </li>
            );
          })}
        </ul>
        {o.note && <p class="tk-note">“{o.note}”</p>}
        <button type="button" class="tk-bump" onClick={() => A.bumpStation(o.id, st)}>{allDone ? 'Done' : 'Bump ' + (st ? stations.find((x) => x.id === st)?.name.en : 'all')}</button>
      </div>
    );
  };

  return (
    <div class={'kitchen dark' + (compact ? ' compact' : '')} style={{ '--brand': r.brand }}>
      <header class="k-head">
        <Logo r={r} size={30} />
        <b>Kitchen display</b>
        <span class="live"><i /> LIVE</span>
        <span class="k-sub">{live.length} tickets · avg wait {mmss(avg)} · target {r.prepTarget || 15} min</span>
        <span class="grow" />
        <div class="k-stations">
          <button type="button" class={station === 'all' ? 'on' : ''} onClick={() => setStation('all')}>All</button>
          {stations.map((s) => (
            <button type="button" class={station === s.id ? 'on' : ''} onClick={() => setStation(s.id)}>{s.name.en}</button>
          ))}
        </div>
        <span class="mono k-clock">{clock(now)}</span>
      </header>
      <div class="k-cols" style={{ '--cols': shown.length }}>
        {shown.map((s) => {
          const tickets = live.filter((o) => o.items.some((li) => li.station === s.id && !(o.done && o.done[li.key])));
          return (
            <section class="k-col">
              <h5>
                {s.name.en} <small>{s.name.bn}</small>
                <span class="mono">{tickets.length}</span>
              </h5>
              <div class="k-tickets">
                {tickets.map((o) => Ticket({ o, st: s.id }))}
                {!tickets.length && <p class="q-empty">Clear. New tickets appear here when staff send an order.</p>}
              </div>
            </section>
          );
        })}
      </div>
      <footer class="k-foot">
        <b>Ready</b>
        {ready.length === 0 && <span class="muted small">Nothing waiting at the pass</span>}
        {ready.map((o) => (
          <span class={'rchip' + (o.status === 'ready' ? ' wait' : '')}>
            {tLabel(o)} #{o.no}
            <small class="mono">{o.status === 'ready' ? 'at pass ' + mmss(now - o.readyAt) : 'picked up'}</small>
            {o.status === 'ready' && <button type="button" onClick={() => A.recallOrder(o.id)} aria-label="Recall ticket"><Ic n="refresh" s={12} /></button>}
          </span>
        ))}
      </footer>
    </div>
  );
}
