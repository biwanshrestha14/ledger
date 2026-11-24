import { PieChart, Plus } from 'lucide-react';
import { useState } from 'react';
import { Glyph } from '../components/Icon';
import { Alert, Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { Empty, ListSkeleton, MonthSwitch, PageHeader, Progress } from '../components/bits';
import { api } from '../lib/api';
import { currentMonth, monthBounds, shiftMonth } from '../lib/date';
import { useMoney } from '../lib/money';
import { useBudgets, useCategories, useInvalidateMoney, useOverview } from '../lib/queries';
import type { Budget } from '../lib/types';

export default function Budgets() {
  const [month, setMonth] = useState(currentMonth());
  const money = useMoney();
  const { data: budgets, isLoading } = useBudgets(month);
  const { data: ov } = useOverview(month);
  const { data: prev } = useOverview(shiftMonth(month, -1));
  const { data: categories = [] } = useCategories();
  const [editing, setEditing] = useState<{ categoryId?: string; budget?: Budget } | null>(null);

  const isCurrent = month === currentMonth();
  const days = monthBounds(month).days;
  const today = new Date().getDate();
  const monthProgress = isCurrent ? today / days : 1;
  const daysLeft = isCurrent ? days - today + 1 : 0;

  const list = budgets ?? [];
  const totalLimit = list.reduce((s, b) => s + b.amount, 0);
  const totalSpent = list.reduce((s, b) => s + Math.min(b.spent, Number.MAX_SAFE_INTEGER), 0);
  const left = totalLimit - totalSpent;
  const budgeted = new Set(list.map((b) => b.categoryId));
  const unbudgeted = (ov?.byCategory ?? []).filter((c) => c.categoryId && !budgeted.has(c.categoryId));
  const available = categories.filter((c) => c.kind === 'expense' && !c.archived && !budgeted.has(c.id));

  return (
    <div className="page">
      <PageHeader title="Budgets" subtitle="Monthly limits by category">
        <MonthSwitch month={month} onChange={setMonth} />
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})} disabled={!available.length}><Plus size={16} /> Add Budget</button>
      </PageHeader>

      {isLoading ? <ListSkeleton rows={5} /> : list.length === 0 ? (
        <div className="card">
          <Empty icon={PieChart} color="var(--indigo)" title="No budgets yet" message="Set a monthly limit for a category and Ledger will show how you’re pacing every day.">
            <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={18} /> Create a Budget</button>
          </Empty>
        </div>
      ) : (
        <div className="stack">
          <section className="card hero">
            <div className="row between wrap">
              <div>
                <div className="hero-label">{left >= 0 ? 'Left to spend' : 'Over budget'}</div>
                <div className={`hero-value ${left < 0 ? 'negative' : ''}`}>{money(Math.abs(left))}</div>
              </div>
              {isCurrent && left > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div className="hero-label">{daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</div>
                  <div className="stat-value">{money(Math.floor(left / daysLeft), { hideCents: true })}<span className="t-subhead secondary"> / day</span></div>
                </div>
              )}
            </div>
            <div className="mt-4">
              <Progress value={totalSpent / totalLimit} color={totalSpent > totalLimit ? 'var(--red)' : 'var(--indigo)'} marker={isCurrent ? monthProgress : undefined} />
            </div>
            <div className="budget-meta">
              <span>{money(totalSpent)} spent of {money(totalLimit)}</span>
              {isCurrent && <span>Line marks today</span>}
            </div>
          </section>

          <div className="list">
            {list.map((b) => {
              const ratio = b.spent / b.amount;
              const over = b.spent > b.amount;
              const ahead = !over && ratio > monthProgress + 0.1;
              return (
                <button key={b.id} className="list-row budget-row" style={{ display: 'block' }} onClick={() => setEditing({ budget: b })}>
                  <div className="row">
                    <Glyph icon={b.categoryIcon} color={b.categoryColor} />
                    <div className="grow">
                      <div className="row-title">{b.categoryName}</div>
                      <div className={`row-sub ${over ? 'negative' : ''}`}>
                        {over ? `${money(b.spent - b.amount)} over` : `${money(b.amount - b.spent)} left`}
                        {ahead && isCurrent && <span className="badge orange" style={{ marginLeft: 8 }}><span className="dot" aria-hidden /> Spending fast</span>}
                      </div>
                    </div>
                    <div className="row-value">
                      <span style={{ fontWeight: 600 }}>{money(b.spent, { hideCents: true })}</span>
                      <span className="secondary"> / {money(b.amount, { hideCents: true })}</span>
                    </div>
                  </div>
                  <div className="mt-4" style={{ paddingLeft: 48 }}>
                    <Progress value={ratio} color={over ? 'var(--red)' : ahead ? 'var(--orange)' : b.categoryColor} marker={isCurrent ? monthProgress : undefined} />
                  </div>
                </button>
              );
            })}
          </div>

          {unbudgeted.length > 0 && (
            <section>
              <h2 className="list-section-title">Spending without a budget</h2>
              <div className="list">
                {unbudgeted.map((c) => (
                  <button key={c.categoryId} className="list-row" onClick={() => setEditing({ categoryId: c.categoryId! })}>
                    <Glyph icon={c.icon} color={c.color} />
                    <div className="grow"><div className="row-title">{c.name}</div><div className="row-sub">Set a limit</div></div>
                    <span className="row-value">{money(c.amount)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {editing && (
        <BudgetSheet
          budget={editing.budget} initialCategory={editing.categoryId} available={available}
          lastMonth={(id) => prev?.byCategory.find((c) => c.categoryId === id)?.amount ?? 0}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function BudgetSheet({ budget, initialCategory, available, lastMonth, onClose }: {
  budget?: Budget; initialCategory?: string; available: { id: string; name: string; icon: string; color: string }[];
  lastMonth: (id: string) => number; onClose: () => void;
}) {
  const money = useMoney();
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? initialCategory ?? available[0]?.id ?? '');
  const [amount, setAmount] = useState(budget ? money.toInput(budget.amount) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const minor = money.parse(amount);
  const hint = categoryId ? lastMonth(categoryId) : 0;

  const save = async () => {
    if (!minor || minor <= 0) return setError('Enter a monthly limit greater than zero.');
    setBusy(true);
    try {
      await api(`/budgets/${categoryId}`, { method: 'PUT', json: { amount: minor } });
      invalidate();
      toast(budget ? 'Budget updated' : 'Budget created');
      onClose();
    } catch (e: any) { setError(e.message); setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    await api(`/budgets/${categoryId}`, { method: 'DELETE' }).catch(() => {});
    invalidate();
    toast('Budget removed');
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={budget ? budget.categoryName : 'New Budget'} locked={busy}
      action={<button className="btn btn-plain bold" onClick={save} disabled={busy || !minor || !categoryId}>{busy ? <span className="spinner" /> : 'Save'}</button>}
      footer={budget ? <button className="btn btn-destructive btn-block" onClick={() => setConfirm(true)}>Remove Budget</button> : undefined}
    >
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {!budget && (
          <div className="field">
            <span className="field-label">Category</span>
            <div className="chips">
              {available.map((c) => (
                <button type="button" key={c.id} className="chip" aria-pressed={c.id === categoryId} onClick={() => setCategoryId(c.id)}>
                  <Glyph icon={c.icon} color={c.color} size="sm" /> {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="amount-entry">
          <span className="cur" aria-hidden>{money.symbol}</span>
          <input data-autofocus inputMode="decimal" placeholder="0" aria-label="Monthly limit" value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} style={{ width: `${Math.max(1, amount.length) + 0.5}ch` }} />
        </div>
        <p className="t-subhead secondary" style={{ textAlign: 'center', marginTop: -8 }}>per month</p>
        {hint > 0 && (
          <div className="row" style={{ justifyContent: 'center' }}>
            <button type="button" className="chip plain" onClick={() => setAmount(money.toInput(Math.ceil(hint / 1000) * 1000))}>
              Last month you spent {money(hint, { hideCents: true })} — use this
            </button>
          </div>
        )}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button type="submit" hidden />
      </form>
      <Alert open={confirm} title="Remove this budget?" message="Your transactions won’t change." confirmLabel="Remove" destructive busy={busy} onConfirm={remove} onCancel={() => setConfirm(false)} />
    </Sheet>
  );
}
