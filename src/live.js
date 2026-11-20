// Screens that only exist in live mode: sign-in, team logins, payment gateway credentials.
import { useState, useEffect } from './hooks.js';
import { Ic, Btn, Field, Toggle, Modal, Empty, Avatar } from './ui.js';
import { state, toast, signIn, sendPasswordReset, setNewPassword, notify } from './store.js';
import { sb } from './backend.js';
import * as A from './actions.js';

export function Login() {
  const p = A.platform();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('login');
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'login') await signIn(email, password);
      else {
        await sendPasswordReset(email);
        toast('Check your email for a link to set a new password.', 'ok');
        setMode('login');
      }
    } catch (er) {
      setErr(er.message);
    }
    setBusy(false);
  };
  return (
    <div class="login-wrap">
      <form class="login card" onSubmit={submit}>
        <div class="brand dark-ink">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="34" height="34"><circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="2.2" /><circle cx="16" cy="16" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".6" /><circle cx="22.5" cy="9.5" r="3.2" fill="#F2B233" /></svg>
          </span>
          <span><b>{p.name}</b><small>Restaurant OS · Bangladesh</small></span>
        </div>
        <h2>{mode === 'login' ? 'Staff sign in' : 'Reset your password'}</h2>
        <p class="muted small">For restaurant owners, managers, waiters and kitchen staff. Guests don't need an account: they scan the table QR code.</p>
        <Field label="Email" id="login-email"><input id="login-email" class="input" type="email" autoComplete="username" required value={email} onInput={(e) => setEmail(e.target.value)} /></Field>
        {mode === 'login' && (
          <Field label="Password" id="login-pass"><input id="login-pass" class="input" type="password" autoComplete="current-password" required value={password} onInput={(e) => setPassword(e.target.value)} /></Field>
        )}
        {err && <p class="err">{err}</p>}
        <button type="submit" class="btn btn-primary btn-lg btn-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Send reset link'}</button>
        <button type="button" class="link small" onClick={() => setMode(mode === 'login' ? 'reset' : 'login')}>{mode === 'login' ? 'Forgot password?' : 'Back to sign in'}</button>
        <p class="legal-foot"><a href="#privacy">Privacy</a> · <a href="#terms">Terms</a></p>
      </form>
    </div>
  );
}

export function SetPassword() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const save = async (e) => {
    e.preventDefault();
    if (pw.length < 8) return setErr('Use at least 8 characters.');
    if (pw !== pw2) return setErr('The two passwords are different.');
    try {
      await setNewPassword(pw);
      toast('Password updated', 'ok');
    } catch (er) {
      setErr(er.message);
    }
  };
  return (
    <div class="login-wrap">
      <form class="login card" onSubmit={save}>
        <h2>Set a new password</h2>
        <button type="button" class="link small" onClick={() => { state.auth.recovery = false; toast('Password not changed'); notify(); }}>Cancel</button>
        <Field label="New password" id="np1"><input id="np1" class="input" type="password" autoComplete="new-password" value={pw} onInput={(e) => setPw(e.target.value)} /></Field>
        <Field label="Repeat it" id="np2"><input id="np2" class="input" type="password" autoComplete="new-password" value={pw2} onInput={(e) => setPw2(e.target.value)} /></Field>
        {err && <p class="err">{err}</p>}
        <button type="submit" class="btn btn-primary btn-lg btn-full">Save password</button>
      </form>
    </div>
  );
}

export function NoAccess({ msg }) {
  const a = state.auth;
  return (
    <Empty icon="alert" title="You don't have access to this page" body={msg || 'Ask the restaurant owner or the platform admin to add your login to this restaurant.'}>
      <div class="row-gap center">
        {a.members.map((m) => (
          <a class="btn btn-ghost btn-sm" href={'#' + m.rid + '-' + (m.role === 'kitchen' ? 'kitchen' : m.role === 'staff' ? 'staff' : 'owner-overview')}>{m.rid}</a>
        ))}
      </div>
    </Empty>
  );
}

const ROLE_INFO = {
  owner: 'Everything for this restaurant, including team logins and payment settings',
  manager: 'Menu, tables, reports, settings and team logins',
  staff: 'Staff tablet: orders, waiter calls, payments',
  kitchen: 'Kitchen display only',
};

// Owner → Staff: real logins for this restaurant
export function TeamLogins({ r }) {
  const [list, setList] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff' });
  const [busy, setBusy] = useState(false);
  const [pwFor, setPwFor] = useState(null);
  const [newPw, setNewPw] = useState('');
  const load = async () => {
    const { data, error } = await sb.from('memberships').select('user_id, role, name, email, created_at').eq('rid', r.id).order('created_at');
    if (error) toast(error.message, 'alert');
    setList(data || []);
  };
  useEffect(() => {
    load();
  }, [r.id]);
  const canOwner = state.auth.admin || A_ROLE(r.id) === 'owner';
  const add = async () => {
    if (!form.email.includes('@') || form.password.length < 8) return toast('Enter an email and a password of at least 8 characters.', 'alert');
    setBusy(true);
    try {
      await A.team({ action: 'create', rid: r.id, ...form });
      toast(`Login created. Give ${form.email} their password in person.`, 'ok');
      setForm({ name: '', email: '', password: '', role: 'staff' });
      load();
    } catch (e) {
      toast(e.message, 'alert');
    }
    setBusy(false);
  };
  return (
    <div class="card">
      <div class="card-h">
        <h3>Logins</h3>
        <p class="muted small">Each person signs in on the restaurant's tablet, kitchen screen or their own phone.</p>
      </div>
      {list === null ? <p class="muted small">Loading…</p> : (
        <table class="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Access</th><th /></tr></thead>
          <tbody>
            {list.map((m) => (
              <tr>
                <td><Avatar name={m.name || m.email} size={24} /> {m.name || '—'}</td>
                <td>{m.email}</td>
                <td><b>{m.role}</b><br /><small class="muted">{ROLE_INFO[m.role]}</small></td>
                <td class="num">
                  {(m.role !== 'owner' || state.auth.admin) && (
                    <>
                      <Btn kind="icon" icon="sliders" aria-label="Reset password" onClick={() => (setPwFor(m), setNewPw(''))} />
                      <Btn kind="icon" icon="trash" aria-label="Remove login" onClick={async () => {
                        try {
                          await A.team({ action: 'remove', rid: r.id, userId: m.user_id });
                          load();
                        } catch (e) {
                          toast(e.message, 'alert');
                        }
                      }} />
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h4>Add a login</h4>
      <div class="form-2">
        <Field label="Name" id="tl-name"><input id="tl-name" class="input" value={form.name} onInput={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email" id="tl-email"><input id="tl-email" class="input" type="email" value={form.email} onInput={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Temporary password" id="tl-pass" hint="At least 8 characters. They can change it later."><input id="tl-pass" class="input" value={form.password} onInput={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <Field label="Access" id="tl-role">
          <select id="tl-role" class="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {canOwner && <option value="owner">Owner</option>}
            <option value="manager">Manager</option>
            <option value="staff">Staff (tablet)</option>
            <option value="kitchen">Kitchen display</option>
          </select>
        </Field>
      </div>
      <Btn kind="primary" icon="plus" disabled={busy} onClick={add}>{busy ? 'Creating…' : 'Create login'}</Btn>
      {pwFor && (
        <Modal open title={'New password for ' + (pwFor.name || pwFor.email)} onClose={() => setPwFor(null)} foot={
          <Btn kind="primary" disabled={newPw.length < 8} onClick={async () => {
            try {
              await A.team({ action: 'password', rid: r.id, userId: pwFor.user_id, password: newPw });
              toast('Password changed', 'ok');
              setPwFor(null);
            } catch (e) {
              toast(e.message, 'alert');
            }
          }}>Save password</Btn>
        }>
          <Field label="New password" id="tl-np"><input id="tl-np" class="input" value={newPw} onInput={(e) => setNewPw(e.target.value)} /></Field>
        </Modal>
      )}
    </div>
  );
}

const A_ROLE = (rid) => (state.auth.members.find((m) => m.rid === rid) || {}).role;

// Owner → Settings: gateway credentials go straight to the server and are never shown again
export function GatewaySettings({ r }) {
  const g = r.payments?.gateways || {};
  const [ssl, setSsl] = useState({ store_id: '', store_passwd: '', sandbox: g.sslcommerz?.sandbox !== false });
  const [bk, setBk] = useState({ app_key: '', app_secret: '', username: '', password: '', sandbox: g.bkash?.sandbox !== false });
  const [busy, setBusy] = useState('');
  const save = async (provider, config, sandbox) => {
    setBusy(provider);
    try {
      await A.saveGatewayCredentials({ action: 'save', rid: r.id, provider, config, sandbox });
      toast(provider === 'bkash' ? 'bKash checkout is ready' : 'SSLCommerz is ready', 'ok');
    } catch (e) {
      toast(e.message, 'alert');
    }
    setBusy('');
  };
  const removeIt = async (provider) => {
    setBusy(provider);
    try {
      await A.saveGatewayCredentials({ action: 'remove', rid: r.id, provider });
      toast('Removed. Payments fall back to staff confirmation.', 'ok');
    } catch (e) {
      toast(e.message, 'alert');
    }
    setBusy('');
  };
  const Status = ({ x }) => (x?.ready ? <span class={'pill tone-' + (x.sandbox ? 'warn' : 'ok')}>{x.sandbox ? 'Sandbox (test money)' : 'Live'}</span> : <span class="pill tone-alert">Not connected</span>);
  return (
    <div class="card">
      <h3>Online payment gateways</h3>
      <p class="muted small">
        Until a gateway is connected, guests paying by bKash, Nagad or Rocket send money to your number and type the TrxID; staff confirm it on the tablet. Card payments need SSLCommerz.
        Credentials are stored on the server only and are never shown in the browser again.
      </p>
      <div class="gw">
        <div class="gw-h"><b>SSLCommerz</b><Status x={g.sslcommerz} /><small class="muted">Cards, bKash, Nagad, Rocket and internet banking on one page</small></div>
        <div class="form-2">
          <Field label="Store ID" id="ssl-id"><input id="ssl-id" class="input" value={ssl.store_id} onInput={(e) => setSsl({ ...ssl, store_id: e.target.value })} /></Field>
          <Field label="Store password" id="ssl-pw"><input id="ssl-pw" class="input" type="password" value={ssl.store_passwd} onInput={(e) => setSsl({ ...ssl, store_passwd: e.target.value })} /></Field>
          <Toggle id="ssl-sb" on={ssl.sandbox} onChange={(v) => setSsl({ ...ssl, sandbox: v })} label="Sandbox (testing)" sub="Turn off after SSLCommerz approves your live store" />
        </div>
        <div class="row-gap">
          <Btn kind="primary" size="sm" disabled={!!busy || !ssl.store_id || !ssl.store_passwd} onClick={() => save('sslcommerz', { store_id: ssl.store_id.trim(), store_passwd: ssl.store_passwd.trim() }, ssl.sandbox)}>{busy === 'sslcommerz' ? 'Saving…' : 'Connect SSLCommerz'}</Btn>
          {g.sslcommerz?.ready && <Btn kind="ghost" size="sm" disabled={!!busy} onClick={() => removeIt('sslcommerz')}>Disconnect</Btn>}
        </div>
      </div>
      <div class="gw">
        <div class="gw-h"><b>bKash Checkout (direct)</b><Status x={g.bkash} /><small class="muted">Optional: lower fees for bKash if you have a bKash merchant account</small></div>
        <div class="form-2">
          <Field label="App key" id="bk-k"><input id="bk-k" class="input" value={bk.app_key} onInput={(e) => setBk({ ...bk, app_key: e.target.value })} /></Field>
          <Field label="App secret" id="bk-s"><input id="bk-s" class="input" type="password" value={bk.app_secret} onInput={(e) => setBk({ ...bk, app_secret: e.target.value })} /></Field>
          <Field label="Username" id="bk-u"><input id="bk-u" class="input" value={bk.username} onInput={(e) => setBk({ ...bk, username: e.target.value })} /></Field>
          <Field label="Password" id="bk-p"><input id="bk-p" class="input" type="password" value={bk.password} onInput={(e) => setBk({ ...bk, password: e.target.value })} /></Field>
          <Toggle id="bk-sb" on={bk.sandbox} onChange={(v) => setBk({ ...bk, sandbox: v })} label="Sandbox (testing)" />
        </div>
        <div class="row-gap">
          <Btn kind="primary" size="sm" disabled={!!busy || !bk.app_key || !bk.app_secret || !bk.username || !bk.password} onClick={() => save('bkash', { app_key: bk.app_key.trim(), app_secret: bk.app_secret.trim(), username: bk.username.trim(), password: bk.password }, bk.sandbox)}>{busy === 'bkash' ? 'Saving…' : 'Connect bKash'}</Btn>
          {g.bkash?.ready && <Btn kind="ghost" size="sm" disabled={!!busy} onClick={() => removeIt('bkash')}>Disconnect</Btn>}
        </div>
      </div>
    </div>
  );
}
