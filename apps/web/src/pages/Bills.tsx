import { CalendarClock, Check, Plus, SkipForward } from 'lucide-react';
import { useState } from 'react';
import { Glyph } from '../components/Icon';
import { Segmented } from '../components/Segmented';
import { Alert, Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { Empty, Field, ListSkeleton, PageHeader } from '../components/bits';
import { api } from '../lib/api';
import { daysUntil, relativeDue, todayISO } from '../lib/date';
import { useMoney } from '../lib/money';
import { useAccounts, useCategories, useInvalidateMoney, useRecurring } from '../lib/queries';
import type { Recurring } from '../lib/types';

const CADENCE = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' } as const;
const perMonth = (r: Recurring) => (r.cadence === 'weekly' ? (r.amount * 52) / 12 : r.cadence === 'yearly' ? r.amount / 12 : r.amount);

export default function Bills() {
  const money = useMoney();
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const { data: items, isLoading } = useRecurring();
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const monthlyOut = (items ?? []).filter((r) => r.type === 'expense').reduce((s, r) => s + perMonth(r), 0);
  const monthlyIn = (items ?? []).filter((r) => r.type === 'income').reduce((s, r) => s + perMonth(r), 0);
  const dueSoon = (items ?? []).filter((r) => daysUntil(r.nextDate) <= 7);
  const later = (items ?? []).filter((r) => daysUntil(r.nextDate) > 7);

  const act = async (r: Recurring, action: 'post' | 'skip') => {
    setBusyId(r.id);
    try {
      await api(`/recurring/${r.id}/${action}`, { method: 'POST' });
      invalidate();
      toast(action === 'post' ? `${r.name} recorded` : `${r.name} skipped this time`);
    } catch (e: any) { toast(e.message); }
    setBusyId(null);
  };

  const row = (r: Recurring) => {
    const overdue = daysUntil(r.nextDate) < 0;
    return (
      <div key={r.id} className="list-row">
        <button className="row grow" style={{ textAlign: 'left', minWidth: 0 }} onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`}>
          {r.categoryIcon ? <Glyph icon={r.categoryIcon} color={r.categoryColor} /> : <span className="glyph outline"><CalendarClock size={18} /></span>}
          <div className="grow">
            <div className="row-title">{r.name}</div>
            <div className={`row-sub ${overdue ? 'negative' : ''}`}>{relativeDue(r.nextDate)} · {CADENCE[r.cadence]} · {r.accountName}</div>
          </div>
          <span className={`row-value ${r.type === 'income' ? 'income' : ''}`}>{money(r.type === 'income' ? r.amount : -r.amount, { sign: r.type === 'income' })}</span>
        </button>
        {daysUntil(r.nextDate) <= 7 && (
          <div className="row" style={{ gap: 4 }}>
            <button className="icon-btn" title="Skip this time" aria-label={`Skip ${r.name} this time`} onClick={() => act(r, 'skip')} disabled={busyId === r.id}><SkipForward size={18} /></button>
            <button className="btn btn-secondary btn-sm" onClick={() => act(r, 'post')} disabled={busyId === r.id} aria-label={`Mark ${r.name} as ${r.type === 'income' ? 'received' : 'paid'}`}>
              {busyId === r.id ? <span className="spinner" /> : <><Check size={15} /> {r.type === 'income' ? 'Received' : 'Paid'}</>}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page">
      <PageHeader title="Bills" subtitle="Recurring payments and income">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><Plus size={16} /> Add Bill</button>
      </PageHeader>

      {isLoading ? <ListSkeleton rows={4} /> : !items?.length ? (
        <div className="card"><Empty icon={CalendarClock} color="var(--orange)" title="No bills yet" message="Add rent, subscriptions or paychecks. Mark them paid in one tap and Ledger records the transaction for you."><button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={18} /> Add a Bill</button></Empty></div>
      ) : (
        <div className="stack">
          <div className="grid grid-2">
            <div className="card"><div className="stat-label">Recurring costs per month</div><div className="stat-value">{money(Math.round(monthlyOut))}</div><div className="stat-delta">{money(Math.round(monthlyOut * 12), { hideCents: true })} per year</div></div>
            <div className="card"><div className="stat-label">Recurring income per month</div><div className="stat-value income">{money(Math.round(monthlyIn))}</div></div>
          </div>
          {dueSoon.length > 0 && (<section><h2 className="list-section-title">Due in the next 7 days</h2><div className="list">{dueSoon.map(row)}</div></section>)}
          {later.length > 0 && (<section><h2 className="list-section-title">Later</h2><div className="list">{later.map(row)}</div></section>)}
        </div>
      )}

      {editing && <BillSheet item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BillSheet({ item, onClose }: { item?: Recurring; onClose: () => void }) {
  const money = useMoney();
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const [type, setType] = useState<'expense' | 'income'>(item?.type ?? 'expense');
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState(item ? money.toInput(item.amount) : '');
  const [cadence, setCadence] = useState<Recurring['cadence']>(item?.cadence ?? 'monthly');
  const [nextDate, setNextDate] = useState(item?.nextDate ?? todayISO());
  const [accountId, setAccountId] = useState(item?.accountId ?? accounts.find((a) => !a.archived)?.id ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(item?.categoryId ?? null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const cats = categories.filter((c) => c.kind === type && !c.archived);

  const save = async () => {
    const minor = money.parse(amount);
    if (!name.trim()) return setError('Enter a name.');
    if (!minor || minor <= 0) return setError('Enter an amount greater than zero.');
    if (!accountId) return setError('Choose an account.');
    setBusy(true);
    try {
      const body = { name: name.trim(), type, amount: minor, cadence, nextDate, accountId, categoryId: cats.some((c) => c.id === categoryId) ? categoryId : null };
      if (item) await api(`/recurring/${item.id}`, { method: 'PATCH', json: body });
      else await api('/recurring', { method: 'POST', json: body });
      invalidate();
      toast(item ? 'Bill updated' : 'Bill added');
      onClose();
    } catch (e: any) { setError(e.message); setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    await api(`/recurring/${item!.id}`, { method: 'DELETE' });
    invalidate();
    toast('Bill deleted');
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={item ? 'Edit Bill' : 'New Bill'} locked={busy}
      action={<button className="btn btn-plain bold" onClick={save} disabled={busy || !name.trim() || !amount}>{busy ? <span className="spinner" /> : 'Save'}</button>}
      footer={item ? <button className="btn btn-destructive btn-block" onClick={() => setConfirm(true)}>Delete Bill</button> : undefined}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Segmented label="Type" value={type} onChange={setType} options={[{ value: 'expense', label: 'Bill' }, { value: 'income', label: 'Income' }]} />
        <Field label="Name" htmlFor="b-name"><input id="b-name" data-autofocus className="input" placeholder={type === 'expense' ? 'e.g. Rent, Netflix' : 'e.g. Salary'} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></Field>
        <div className="grid grid-2">
          <Field label="Amount" htmlFor="b-amt"><input id="b-amt" className="input" inputMode="decimal" placeholder={money(0)} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} /></Field>
          <Field label="Next due" htmlFor="b-date"><input id="b-date" type="date" className="input" value={nextDate} onChange={(e) => e.target.value && setNextDate(e.target.value)} /></Field>
        </div>
        <div className="field"><span className="field-label">Repeats</span>
          <Segmented label="Repeats" value={cadence} onChange={setCadence} options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} />
        </div>
        <Field label="Account" htmlFor="b-acct">
          <select id="b-acct" className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.filter((a) => !a.archived || a.id === accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <div className="field"><span className="field-label">Category</span>
          <div className="chips">
            {cats.map((c) => (
              <button type="button" key={c.id} className="chip" aria-pressed={c.id === categoryId} onClick={() => setCategoryId(c.id === categoryId ? null : c.id)}>
                <Glyph icon={c.icon} color={c.color} size="sm" /> {c.name}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button type="submit" hidden />
      </form>
      <Alert open={confirm} title={`Delete “${item?.name}”?`} message="Past transactions are kept." confirmLabel="Delete" destructive busy={busy} onConfirm={remove} onCancel={() => setConfirm(false)} />
    </Sheet>
  );
}
