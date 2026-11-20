// Shared UI primitives: icons, buttons, dialogs, form controls, QR codes, charts.
import { useState, useEffect, useRef, useMemo } from './hooks.js';
import qrcode from 'qrcode-generator';
import { onToast } from './store.js';
import { groupIN } from './util.js';

// ---------- icons (24px stroke) ----------
const circ = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const rect = (x, y, w, h, r = 0) =>
  r
    ? `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`
    : `M${x} ${y}h${w}v${h}h${-w}z`;

const P = {
  home: 'M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  grid: rect(3, 3, 7, 7, 1) + rect(14, 3, 7, 7, 1) + rect(3, 14, 7, 7, 1) + rect(14, 14, 7, 7, 1),
  chef: 'M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z M6 17h12',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0',
  receipt: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z M16 8H8 M16 12H8 M12 16H8',
  wifi: 'M5 12.55a11 11 0 0 1 14.08 0 M1.42 9a16 16 0 0 1 21.16 0 M8.53 16.11a6 6 0 0 1 6.95 0 M12 20h.01',
  game: 'M6 12h4 M8 10v4 M15 13h.01 M18 11h.01 M17.32 5H6.68a4 4 0 0 0-3.978 3.59l-.9 8.12A2.5 2.5 0 0 0 4.3 19.5c1 0 1.9-.55 2.33-1.43L8 15h8l1.37 3.07A2.5 2.5 0 0 0 19.7 19.5a2.5 2.5 0 0 0 2.5-2.79l-.9-8.12A4 4 0 0 0 17.32 5z',
  qr: rect(3, 3, 7, 7, 1) + rect(14, 3, 7, 7, 1) + rect(3, 14, 7, 7, 1) + 'M14 14h3v3h-3z M21 14v.01 M14 21h.01 M17 21h4 M21 17v.01',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 ' + circ(9, 7, 4) + ' M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  chart: 'M3 3v18h18 M7 16v-4 M12 16V8 M17 16v-7',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  x: 'M18 6 6 18 M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  clock: circ(12, 12, 10) + ' M12 6v6l4 2',
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  bike: circ(5.5, 17.5, 3.5) + circ(18.5, 17.5, 3.5) + ' M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M12 17.5V14l-3-3 4-3 2 3h2',
  bag: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z M3 6h18 M16 10a4 4 0 0 1-8 0',
  store: 'M3 9l1.5-5h15L21 9 M4 9v11h16V9 M9 20v-6h6v6 M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0',
  globe: circ(12, 12, 10) + ' M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  copy: rect(9, 9, 13, 13, 2) + ' M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  external: 'M15 3h6v6 M10 14 21 3 M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  leaf: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12',
  search: circ(11, 11, 8) + ' M21 21l-4.3-4.3',
  right: 'M9 18l6-6-6-6',
  left: 'M15 18l-6-6 6-6',
  down: 'M6 9l6 6 6-6',
  trash: 'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  edit: 'M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  card: rect(2, 5, 20, 14, 2) + ' M2 10h20',
  cash: rect(2, 6, 20, 12, 2) + circ(12, 12, 2) + ' M6 12h.01 M18 12h.01',
  wallet: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1 M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4',
  bank: 'M3 21h18 M3 10h18 M5 6l7-3 7 3 M4 10v11 M20 10v11 M8 14v3 M12 14v3 M16 14v3',
  play: 'M6 3l14 9-14 9V3z',
  pause: 'M6 4h4v16H6z M14 4h4v16h-4z',
  layout: rect(3, 3, 18, 18, 2) + ' M3 9h18 M9 21V9',
  monitor: rect(2, 3, 20, 14, 2) + ' M8 21h8 M12 17v4',
  tablet: rect(4, 2, 16, 20, 2) + ' M12 18h.01',
  mobile: rect(6, 2, 12, 20, 2) + ' M12 18h.01',
  back: 'M19 12H5 M12 19l-7-7 7-7',
  refresh: 'M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-15 6.7L3 16 M3 21v-5h5',
  drop: 'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z',
  layers: 'M12 2 2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  cutlery: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2 M7 2v20 M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7',
  message: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  zap: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  building: rect(4, 2, 16, 20, 2) + ' M9 22v-4h6v4 M8 6h.01 M12 6h.01 M16 6h.01 M8 10h.01 M12 10h.01 M16 10h.01 M8 14h.01 M12 14h.01 M16 14h.01',
  print: 'M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z',
  pin: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z ' + circ(12, 10, 3),
  split: 'M16 3h5v5 M8 3H3v5 M12 22v-8.3a4 4 0 0 0-1.17-2.83L3 3 M15 9l6-6',
  tag: 'M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z M7.5 7.5h.01',
  alert: circ(12, 12, 10) + ' M12 8v4 M12 16h.01',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  expand: 'M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
};

export const Ic = ({ n, s = 18, w = 1.8, cls = '' }) => (
  <svg class={'ic ' + cls} width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={w} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={P[n] || P.grid} />
  </svg>
);

// ---------- basics ----------
export const Btn = ({ kind = 'ghost', size = '', icon, children, class: c = '', full, ...rest }) => (
  <button type="button" class={`btn btn-${kind} ${size ? 'btn-' + size : ''} ${full ? 'btn-full' : ''} ${c}`} {...rest}>
    {icon && <Ic n={icon} s={size === 'lg' ? 20 : 16} />}
    {children != null && children !== '' && <span>{children}</span>}
  </button>
);

export const Pill = ({ tone = 'idle', children, dot }) => (
  <span class={'pill tone-' + tone}>
    {dot && <i class="dot" />}
    {children}
  </span>
);

export const Toggle = ({ on, onChange, label, id, sub }) => (
  <label class="toggle" for={id}>
    <input id={id} type="checkbox" checked={!!on} onChange={(e) => onChange(e.target.checked)} />
    <span class="track"><span class="knob" /></span>
    {label && (
      <span class="tlabel">
        {label}
        {sub && <small>{sub}</small>}
      </span>
    )}
  </label>
);

export const Seg = ({ options, value, onChange, cls = '' }) => (
  <div class={'seg ' + cls} role="radiogroup">
    {options.map((o) => (
      <button type="button" role="radio" aria-checked={o.v === value} class={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
        {o.l}
      </button>
    ))}
  </div>
);

export const Field = ({ label, hint, children, id, wide }) => (
  <div class={'field' + (wide ? ' wide' : '')}>
    {label && <label for={id}>{label}</label>}
    {children}
    {hint && <small class="hint">{hint}</small>}
  </div>
);

export function Modal({ open, onClose, title, children, wide, foot, cls = '' }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  if (!open) return null;
  return (
    <div class="modal-wrap" onClick={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div class={'modal ' + (wide ? 'wide ' : '') + cls} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h3>{title}</h3>
          {onClose && <Btn icon="x" kind="icon" onClick={onClose} aria-label="Close" />}
        </header>
        <div class="modal-body">{children}</div>
        {foot && <footer>{foot}</footer>}
      </div>
    </div>
  );
}

export function Sheet({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div class="sheet-wrap" onClick={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title || 'Details'}>
        <div class="grab" />
        {children}
      </div>
    </div>
  );
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function Toasts() {
  const [list, setList] = useState([]);
  useEffect(
    () =>
      onToast((t) => {
        setList((l) => [...l.slice(-3), t]);
        setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), 4200);
      }),
    []
  );
  return (
    <div class="toasts" aria-live="polite">
      {list.map((t) => (
        <div class={'toast tone-' + t.tone} key={t.id}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export const Avatar = ({ name = '?', color, size = 28 }) => {
  const hues = ['#E2553A', '#3D6BE0', '#1F8A5B', '#B5478A', '#C98A12', '#5A4FCF'];
  const c = color || hues[(name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % hues.length];
  return (
    <span class="avatar" style={{ background: c, width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.42) + 'px' }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
};

export const Logo = ({ r, size = 40 }) => (
  <span class="rlogo" style={{ background: r?.brand || '#0E4D3A', width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.48) + 'px' }}>
    {r?.logoText || 'R'}
  </span>
);

export const Empty = ({ icon = 'grid', title, body, children }) => (
  <div class="empty">
    <Ic n={icon} s={28} />
    <strong>{title}</strong>
    {body && <p>{body}</p>}
    {children}
  </div>
);

// ---------- QR ----------
export function qrPath(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return { n, d };
}

export const QR = ({ text, size = 160, fg = '#111', bg = '#fff', label }) => {
  const { n, d } = useMemo(() => {
    try {
      return qrPath(text);
    } catch (e) {
      return { n: 21, d: '' };
    }
  }, [text]);
  return (
    <svg class="qr" width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} shape-rendering="crispEdges" role="img" aria-label={label || 'QR code'}>
      <rect x="-2" y="-2" width={n + 4} height={n + 4} fill={bg} />
      <path d={d} fill={fg} />
    </svg>
  );
};

export const qrSvgString = (text, size = 180, fg = '#111') => {
  const { n, d } = qrPath(text);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="${fg}"/></svg>`;
};

// ---------- downloads / copy ----------
export async function saveFile(filename, data, mime = 'text/plain') {
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      const dl = await window.claude.use('downloads');
      if (dl) {
        await dl.save({ filename, data });
        return true;
      }
    }
  } catch (e) {
    return false;
  }
  try {
    const blob = new Blob([data], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
    return true;
  } catch (e) {
    return false;
  }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    return false;
  }
}

// ---------- charts ----------
const compact = (v) => (v >= 100000 ? (v / 100000).toFixed(v >= 1000000 ? 0 : 1) + 'L' : v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'K' : String(Math.round(v)));
const niceMax = (m) => {
  if (m <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  const f = m / p;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * p;
};

// Column chart: one series over ordered buckets (e.g. sales by hour). Hover shows the exact value.
export function Columns({ data, height = 180, fmt = (v) => '৳' + groupIN(v), label = 'Value' }) {
  const [hover, setHover] = useState(-1);
  const wrap = useRef(null);
  const [w, setW] = useState(560);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver((es) => setW(Math.max(240, es[0].contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const padL = 44, padB = 22, padT = 18;
  const max = niceMax(Math.max(...data.map((d) => d.v), 0));
  const ih = height - padB - padT;
  const iw = w - padL - 6;
  const band = iw / Math.max(1, data.length);
  const bw = Math.min(24, band - 4);
  const ticks = [0, max / 2, max];
  const peak = data.reduce((a, d, i) => (d.v > (data[a]?.v || 0) ? i : a), 0);
  return (
    <div class="chart" ref={wrap}>
      <svg width={w} height={height} role="img" aria-label={label}>
        {ticks.map((t) => {
          const y = padT + ih - (t / max) * ih;
          return (
            <g>
              <line x1={padL} x2={w - 4} y1={y} y2={y} class="grid" />
              <text x={padL - 8} y={y + 4} class="tick" text-anchor="end">{compact(t)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const x = padL + i * band + (band - bw) / 2;
          const h = Math.max(d.v > 0 ? 2 : 0, (d.v / max) * ih);
          const y = padT + ih - h;
          const r = Math.min(4, h, bw / 2);
          const path = h > 0 ? `M${x} ${padT + ih}V${y + r}a${r} ${r} 0 0 1 ${r} ${-r}h${bw - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}V${padT + ih}z` : '';
          return (
            <g onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)} onFocus={() => setHover(i)} onBlur={() => setHover(-1)} tabindex="0">
              <rect x={padL + i * band} y={padT} width={band} height={ih} fill="transparent" />
              <path d={path} class={'bar' + (hover === i ? ' hot' : '')} />
              {(i % Math.ceil(data.length / 12) === 0) && (
                <text x={padL + i * band + band / 2} y={height - 6} class="tick" text-anchor="middle">{d.l}</text>
              )}
              {i === peak && d.v > 0 && hover < 0 && (
                <text x={x + bw / 2} y={y - 5} class="vlabel" text-anchor="middle">{compact(d.v)}</text>
              )}
            </g>
          );
        })}
        <line x1={padL} x2={w - 4} y1={padT + ih} y2={padT + ih} class="axis" />
      </svg>
      {hover >= 0 && data[hover] && (
        <div class="tip" style={{ left: Math.min(w - 130, Math.max(0, padL + hover * band + band / 2 - 60)) + 'px' }}>
          <b>{data[hover].l}</b>
          <span>{fmt(data[hover].v)}</span>
          {data[hover].sub && <small>{data[hover].sub}</small>}
        </div>
      )}
    </div>
  );
}

// Horizontal bars with label and value at the tip (category comparison).
export function HBars({ data, fmt = (v) => '৳' + groupIN(v), empty = 'No data yet' }) {
  const max = Math.max(...data.map((d) => d.v), 0) || 1;
  if (!data.length || data.every((d) => !d.v)) return <p class="muted small">{empty}</p>;
  return (
    <div class="hbars">
      {data.map((d) => (
        <div class="hbar" title={`${d.l}: ${fmt(d.v)}`}>
          <span class="hl">{d.l}</span>
          <span class="htrack">
            <span class="hfill" style={{ width: (d.v > 0 ? Math.max(2, (d.v / max) * 100) : 0) + '%' }} />
          </span>
          <span class="hv">{fmt(d.v)}{d.pct != null && <small> · {d.pct}%</small>}</span>
        </div>
      ))}
    </div>
  );
}

export const Stat = ({ label, value, sub, tone }) => (
  <div class={'stat' + (tone ? ' tone-' + tone : '')}>
    <span class="slabel">{label}</span>
    <strong class="svalue">{value}</strong>
    {sub && <span class="ssub">{sub}</span>}
  </div>
);

export const PhoneFrame = ({ children, cls = '' }) => (
  <div class={'phone ' + cls}>
    <div class="phone-notch" />
    <div class="phone-screen">{children}</div>
  </div>
);
