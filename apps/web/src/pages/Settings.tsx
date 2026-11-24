import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Download, FileUp, KeyRound, LogOut, Smartphone } from 'lucide-react';
import { InstallSheet } from '../components/InstallSheet';
import { useInstall } from '../lib/install';
import { useState } from 'react';
import { ImportSheet } from '../components/ImportSheet';
import { Segmented } from '../components/Segmented';
import { Alert, Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { Field, PageHeader } from '../components/bits';
import { api } from '../lib/api';
import { formatMoney } from '../lib/money';
import { keys, useInvalidateMoney, useMe } from '../lib/queries';
import { ThemePref, useTheme } from '../lib/theme';
import type { User } from '../lib/types';

const CURRENCIES = ['NPR', 'INR', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'SGD', 'AED', 'NZD', 'SEK', 'BRL', 'MXN', 'ZAR'];
const LOCALES = [
  ['en-IN', 'Nepal · 12,34,567.00'], ['en-US', 'International · 1,234,567.00'], ['ne-NP', 'नेपाली · १२,३४,५६७'], ['en-GB', 'English (UK)'], ['de-DE', 'Deutsch'], ['fr-FR', 'Français'],
  ['es-ES', 'Español'], ['it-IT', 'Italiano'], ['nl-NL', 'Nederlands'], ['pt-BR', 'Português (Brasil)'], ['ja-JP', '日本語'], ['zh-CN', '中文'],
];

export default function Settings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const [theme, setTheme] = useTheme();
  const [name, setName] = useState(me?.name ?? '');
  const [pwOpen, setPwOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [iosSteps, setIosSteps] = useState(false);
  const install = useInstall();
  const [resetting, setResetting] = useState(false);
  const invalidate = useInvalidateMoney();

  const reset = async () => {
    setResetting(true);
    try {
      await api('/data/reset', { method: 'POST' });
      await invalidate();
      toast('All data erased. Your login is unchanged.');
      setResetOpen(false);
    } catch (e: any) { toast(e.message); }
    setResetting(false);
  };

  const update = async (patch: Partial<User>) => {
    try {
      const u = await api<User>('/auth/me', { method: 'PATCH', json: patch });
      qc.setQueryData(keys.me, u);
      toast('Saved');
    } catch (e: any) { toast(e.message); }
  };

  const signOut = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    qc.clear();
    qc.setQueryData(keys.me, null);
  };

  if (!me) return null;
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageHeader title="Settings" />

      <h2 className="list-section-title">Profile</h2>
      <div className="list">
        <div className="settings-row">
          <label htmlFor="s-name" className="t-body">Name</label>
          <input id="s-name" className="input" style={{ maxWidth: 260, textAlign: 'right', background: 'transparent' }} value={name}
            onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== me.name && update({ name: name.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} maxLength={60} />
        </div>
        <div className="settings-row"><span>Email</span><span className="secondary">{me.email}</span></div>
      </div>

      <h2 className="list-section-title">Preferences</h2>
      <div className="list">
        <div className="settings-row">
          <label htmlFor="s-cur">Currency</label>
          <select id="s-cur" className="select" value={me.currency} onChange={(e) => update({ currency: e.target.value })}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c} · {formatMoney(123456, c, me.locale)}</option>)}
          </select>
        </div>
        <div className="settings-row">
          <label htmlFor="s-loc">Number & date format</label>
          <select id="s-loc" className="select" value={me.locale} onChange={(e) => update({ locale: e.target.value })}>
            {LOCALES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="settings-row">
          <span>Appearance</span>
          <div style={{ width: 240 }}>
            <Segmented<ThemePref> label="Appearance" value={theme} onChange={setTheme}
              options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </div>
        </div>
      </div>
      <p className="t-footnote secondary" style={{ padding: 'var(--space-2) var(--space-4) 0' }}>
        Changing currency relabels amounts; it doesn’t convert them.
      </p>

      {(install.canPrompt || install.needsIOSSteps) && (
        <>
          <h2 className="list-section-title">App</h2>
          <div className="list">
            <button className="list-row" onClick={() => (install.canPrompt ? install.prompt().then((ok) => ok && toast('Ledger installed')) : setIosSteps(true))}>
              <span className="glyph" style={{ background: 'var(--blue)' }}><Smartphone size={18} /></span>
              <span className="grow"><span className="row-title" style={{ display: 'block' }}>Install App</span><span className="row-sub">Open Ledger from your Home Screen, full screen</span></span>
              <ChevronRight size={16} className="row-chevron" />
            </button>
          </div>
        </>
      )}

      <h2 className="list-section-title">Your Data</h2>
      <div className="list">
        <button className="list-row" onClick={() => setImportOpen(true)}>
          <span className="glyph" style={{ background: 'var(--blue)' }}><FileUp size={18} /></span>
          <span className="grow row-title">Import Transactions from CSV</span><ChevronRight size={16} className="row-chevron" />
        </button>
        <a className="list-row" href="/api/data/export.csv">
          <span className="glyph" style={{ background: 'var(--green)' }}><Download size={18} /></span>
          <span className="grow"><span className="row-title" style={{ display: 'block' }}>Export Transactions</span><span className="row-sub">CSV for spreadsheets</span></span>
        </a>
        <a className="list-row" href="/api/data/export.json">
          <span className="glyph" style={{ background: 'var(--indigo)' }}><Download size={18} /></span>
          <span className="grow"><span className="row-title" style={{ display: 'block' }}>Download Full Backup</span><span className="row-sub">Everything, as JSON</span></span>
        </a>
      </div>

      <h2 className="list-section-title">Security</h2>
      <div className="list">
        <button className="list-row" onClick={() => setPwOpen(true)}>
          <span className="glyph" style={{ background: 'var(--gray)' }}><KeyRound size={18} /></span>
          <span className="grow row-title">Change Password</span><ChevronRight size={16} className="row-chevron" />
        </button>
        <button className="list-row" onClick={signOut}>
          <span className="glyph" style={{ background: 'var(--gray)' }}><LogOut size={18} /></span>
          <span className="grow row-title">Sign Out</span>
        </button>
      </div>

      <div className="list mt-8">
        <button className="list-row no-icon" onClick={() => setResetOpen(true)}>
          <span className="grow row-title negative" style={{ textAlign: 'center' }}>Erase All Data</span>
        </button>
        <button className="list-row no-icon" onClick={() => setDeleteOpen(true)}>
          <span className="grow row-title negative" style={{ textAlign: 'center' }}>Delete Account</span>
        </button>
      </div>
      <p className="t-footnote secondary" style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
        Ledger · Member since {new Date(me.createdAt).toLocaleDateString(me.locale, { month: 'long', year: 'numeric' })}
      </p>

      {pwOpen && <PasswordSheet onClose={() => setPwOpen(false)} />}
      {importOpen && <ImportSheet onClose={() => setImportOpen(false)} />}
      {iosSteps && <InstallSheet onClose={() => setIosSteps(false)} />}
      {deleteOpen && <DeleteAccount onClose={() => setDeleteOpen(false)} />}
      <Alert open={resetOpen} title="Erase all data?" destructive busy={resetting} confirmLabel="Erase Everything"
        message="Every account, transaction, budget, goal and bill will be deleted and categories reset to defaults. You’ll stay signed in."
        onConfirm={reset} onCancel={() => setResetOpen(false)} />
    </div>
  );
}

function PasswordSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (next.length < 8) return setError('Choose a password with at least 8 characters.');
    setBusy(true);
    try {
      await api('/auth/password', { method: 'POST', json: { currentPassword: current, newPassword: next } });
      toast('Password changed. Other devices were signed out.');
      onClose();
    } catch (e: any) { setError(e.message); setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title="Change Password" locked={busy}
      action={<button className="btn btn-plain bold" onClick={save} disabled={busy || !current || !next}>{busy ? <span className="spinner" /> : 'Save'}</button>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Current password" htmlFor="pw-cur"><input id="pw-cur" data-autofocus type="password" className="input" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
        <Field label="New password" htmlFor="pw-new"><input id="pw-new" type="password" className="input" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <p className="t-footnote secondary">At least 8 characters. You’ll stay signed in on this device.</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

function DeleteAccount({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await api('/auth/me', { method: 'DELETE', json: { password } });
      qc.clear();
      qc.setQueryData(keys.me, null);
    } catch (e: any) { setError(e.message); setBusy(false); }
  };
  return (
    <Alert open title="Delete your account?" destructive busy={busy || !password} confirmLabel="Delete Everything"
      message="All accounts, transactions, budgets and goals will be permanently erased. Download a backup first if you want to keep anything."
      onConfirm={confirm} onCancel={onClose}>
      <div className="mt-4">
        <input type="password" className="input" placeholder="Enter your password" aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {error && <p className="field-error mt-2">{error}</p>}
      </div>
    </Alert>
  );
}
