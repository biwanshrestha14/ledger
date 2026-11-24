import { Banknote, CreditCard, Landmark, LineChart, PiggyBank, Plus, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { ColorPicker, Empty, Field, PageHeader, Skeleton, Switch } from '../components/bits';
import { api } from '../lib/api';
import { useMoney } from '../lib/money';
import { useAccounts, useInvalidateMoney } from '../lib/queries';
import type { Account, AccountType } from '../lib/types';

export const ACCOUNT_TYPES: { value: AccountType; label: string; icon: typeof Wallet }[] = [
  { value: 'checking', label: 'Checking', icon: Landmark },
  { value: 'savings', label: 'Savings', icon: PiggyBank },
  { value: 'credit', label: 'Credit Card', icon: CreditCard },
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'investment', label: 'Investment', icon: LineChart },
];
const typeInfo = (t: AccountType) => ACCOUNT_TYPES.find((x) => x.value === t)!;

export default function Accounts() {
  const money = useMoney();
  const navigate = useNavigate();
  const { data: accounts, isLoading } = useAccounts();
  const [editing, setEditing] = useState<Account | 'new' | null>(null);

  const active = (accounts ?? []).filter((a) => !a.archived);
  const archived = (accounts ?? []).filter((a) => a.archived);
  const assets = active.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const debts = active.filter((a) => a.balance < 0).reduce((s, a) => s - a.balance, 0);

  const card = (a: Account) => {
    const I = typeInfo(a.type).icon;
    return (
      <div key={a.id} className="card acct-card" style={{ opacity: a.archived ? 0.6 : 1 }}>
        <div className="row between">
          <span className="glyph" style={{ background: a.color }}><I size={19} /></span>
          <button className="btn btn-plain btn-sm" onClick={() => setEditing(a)}>Edit</button>
        </div>
        <button className="stack" style={{ gap: 2, textAlign: 'left' }} onClick={() => navigate(`/transactions?accountId=${a.id}`)}>
          <span className="t-subhead secondary">{a.name} · {typeInfo(a.type).label}</span>
          <span className={`stat-value ${a.balance < 0 ? 'negative' : ''}`}>{money(a.balance)}</span>
          <span className="t-footnote secondary">{a.transactionCount.toLocaleString()} transactions →</span>
        </button>
      </div>
    );
  };

  return (
    <div className="page">
      <PageHeader title="Accounts" subtitle="Everywhere your money lives">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><Plus size={16} /> Add Account</button>
      </PageHeader>

      {isLoading ? (
        <div className="grid grid-3">{[0, 1, 2].map((i) => <div className="card" key={i}><Skeleton h={36} w={36} r={10} /><div className="mt-4"><Skeleton h={14} w="50%" /></div><div className="mt-2"><Skeleton h={26} w="70%" /></div></div>)}</div>
      ) : !accounts?.length ? (
        <div className="card"><Empty icon={Wallet} title="No accounts" message="Add a bank account, card or cash wallet to start tracking."><button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={18} /> Add Account</button></Empty></div>
      ) : (
        <div className="stack">
          <div className="grid grid-3">
            <div className="card"><div className="stat-label">Net worth</div><div className="stat-value">{money(assets - debts)}</div></div>
            <div className="card"><div className="stat-label">Assets</div><div className="stat-value">{money(assets)}</div></div>
            <div className="card"><div className="stat-label">Debts</div><div className={`stat-value ${debts ? 'negative' : ''}`}>{money(debts)}</div></div>
          </div>
          <div className="grid grid-3">{active.map(card)}</div>
          {archived.length > 0 && (
            <>
              <h2 className="list-section-title" style={{ paddingTop: 'var(--space-4)' }}>Archived</h2>
              <div className="grid grid-3">{archived.map(card)}</div>
            </>
          )}
        </div>
      )}

      {editing && <AccountSheet account={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AccountSheet({ account, onClose }: { account?: Account; onClose: () => void }) {
  const money = useMoney();
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'checking');
  const [color, setColor] = useState(account?.color ?? '#0088ff');
  const [opening, setOpening] = useState(account ? money.toInput(Math.abs(account.openingBalance)) : '');
  const [owe, setOwe] = useState(account ? account.openingBalance < 0 : false);
  const [archived, setArchived] = useState(account?.archived ?? false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const isDebtType = type === 'credit';
  const save = async () => {
    if (!name.trim()) return setError('Enter an account name.');
    const o = opening ? money.parse(opening) : 0;
    if (o === null) return setError('Enter a valid starting balance.');
    const negative = isDebtType ? true : owe;
    setBusy(true);
    try {
      const body = { name: name.trim(), type, color, openingBalance: negative ? -Math.abs(o) : Math.abs(o) };
      if (account) await api(`/accounts/${account.id}`, { method: 'PATCH', json: { ...body, archived } });
      else await api('/accounts', { method: 'POST', json: body });
      invalidate();
      toast(account ? 'Account updated' : 'Account added');
      onClose();
    } catch (e: any) { setError(e.message); setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/accounts/${account!.id}`, { method: 'DELETE' });
      invalidate();
      toast('Account deleted');
      onClose();
    } catch (e: any) { setError(e.message); setBusy(false); setConfirm(false); }
  };

  return (
    <Sheet open onClose={onClose} title={account ? 'Edit Account' : 'New Account'} locked={busy}
      action={<button className="btn btn-plain bold" onClick={save} disabled={busy || !name.trim()}>{busy ? <span className="spinner" /> : 'Save'}</button>}
      footer={account ? <button className="btn btn-destructive btn-block" onClick={() => setConfirm(true)}>Delete Account</button> : undefined}
    >
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Name" htmlFor="acct-name">
          <input id="acct-name" data-autofocus className="input" placeholder="e.g. Everyday Checking" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <div className="field">
          <span className="field-label">Type</span>
          <div className="chips">
            {ACCOUNT_TYPES.map(({ value, label, icon: I }) => (
              <button type="button" key={value} className="chip plain" aria-pressed={value === type} onClick={() => setType(value)}><I size={16} /> {label}</button>
            ))}
          </div>
        </div>
        <Field label={isDebtType ? 'Starting balance owed' : 'Starting balance'} htmlFor="acct-open">
          <input id="acct-open" className="input" inputMode="decimal" placeholder={money(0)} value={opening} onChange={(e) => setOpening(e.target.value.replace(/[^\d.,]/g, ''))} />
        </Field>
        {!isDebtType && (
          <div className="row between">
            <span className="t-subhead">This balance is owed (negative)</span>
            <Switch checked={owe} onChange={setOwe} label="Balance is owed" />
          </div>
        )}
        <div className="field"><span className="field-label">Color</span><ColorPicker value={color} onChange={setColor} /></div>
        {account && (
          <div className="row between">
            <div><div className="t-subhead">Archive</div><div className="t-footnote secondary">Hide from pickers and net worth. History is kept.</div></div>
            <Switch checked={archived} onChange={setArchived} label="Archive account" />
          </div>
        )}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button type="submit" hidden />
      </form>
      <Alert open={confirm} title={`Delete “${account?.name}”?`} destructive busy={busy} confirmLabel="Delete Account"
        message={account?.transactionCount ? `Its ${account.transactionCount} transactions will be deleted too. To keep history, archive it instead.` : 'This can’t be undone.'}
        onConfirm={remove} onCancel={() => setConfirm(false)} />
    </Sheet>
  );
}

