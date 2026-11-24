import { Minus, Plus, Target } from 'lucide-react';
import { useState } from 'react';
import { Alert, Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { ColorPicker, Empty, Field, PageHeader, Ring, Skeleton } from '../components/bits';
import { api } from '../lib/api';
import { daysUntil, formatShortDate } from '../lib/date';
import { useMoney } from '../lib/money';
import { useGoals, useInvalidateMoney } from '../lib/queries';
import type { Goal } from '../lib/types';

export default function Goals() {
  const money = useMoney();
  const { data: goals, isLoading } = useGoals();
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const [contributing, setContributing] = useState<Goal | null>(null);

  return (
    <div className="page">
      <PageHeader title="Goals" subtitle="Save toward what matters">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><Plus size={16} /> New Goal</button>
      </PageHeader>

      {isLoading ? (
        <div className="grid grid-2">{[0, 1].map((i) => <div key={i} className="card"><Skeleton h={64} w={64} r={32} /><div className="mt-4"><Skeleton h={14} w="60%" /></div></div>)}</div>
      ) : !goals?.length ? (
        <div className="card"><Empty icon={Target} color="var(--pink)" title="No goals yet" message="An emergency fund, a trip, a new laptop — set a target and watch it fill up."><button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={18} /> Create a Goal</button></Empty></div>
      ) : (
        <div className="grid grid-2">
          {goals.map((g) => {
            const progress = g.saved / g.target;
            const remaining = Math.max(0, g.target - g.saved);
            const days = g.targetDate ? daysUntil(g.targetDate) : null;
            const months = days !== null ? Math.max(1, Math.ceil(days / 30.4)) : null;
            const done = g.saved >= g.target;
            return (
              <section key={g.id} className="card" aria-label={g.name}>
                <div className="row" style={{ gap: 'var(--space-4)', alignItems: 'flex-start' }}>
                  <Ring value={progress} color={g.color} />
                  <div className="grow">
                    <div className="row between">
                      <h2 className="t-headline">{g.name}</h2>
                      <button className="btn btn-plain btn-sm" onClick={() => setEditing(g)}>Edit</button>
                    </div>
                    <div className="stat-value" style={{ fontSize: '1.25rem' }}>{money(g.saved)} <span className="t-subhead secondary">of {money(g.target, { hideCents: true })}</span></div>
                    <p className="t-footnote secondary mt-2">
                      {done ? 'Goal reached. Well done.' : days !== null && days > 0
                        ? `${money(Math.ceil(remaining / months!), { hideCents: true })}/month to reach it by ${formatShortDate(g.targetDate!)}`
                        : days !== null ? `Target date passed · ${money(remaining, { hideCents: true })} to go` : `${money(remaining, { hideCents: true })} to go`}
                    </p>
                  </div>
                </div>
                <div className="row mt-4" style={{ gap: 'var(--space-2)' }}>
                  <button className="btn btn-secondary btn-sm grow" onClick={() => setContributing(g)}><Plus size={15} /> Add Money</button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {editing && <GoalSheet goal={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {contributing && <ContributeSheet goal={contributing} onClose={() => setContributing(null)} />}
    </div>
  );
}

function ContributeSheet({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const money = useMoney();
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const [amount, setAmount] = useState('');
  const [withdraw, setWithdraw] = useState(false);
  const [busy, setBusy] = useState(false);
  const minor = money.parse(amount);
  const save = async () => {
    if (!minor) return;
    setBusy(true);
    await api(`/goals/${goal.id}/contribute`, { method: 'POST', json: { amount: withdraw ? -minor : minor } });
    invalidate();
    toast(withdraw ? `Withdrew ${money(minor)} from ${goal.name}` : `Added ${money(minor)} to ${goal.name}`);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={goal.name} locked={busy}
      action={<button className="btn btn-plain bold" disabled={!minor || busy} onClick={save}>{busy ? <span className="spinner" /> : 'Done'}</button>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button type="button" className="chip plain" aria-pressed={!withdraw} onClick={() => setWithdraw(false)}><Plus size={15} /> Add</button>
          <button type="button" className="chip plain" aria-pressed={withdraw} onClick={() => setWithdraw(true)}><Minus size={15} /> Withdraw</button>
        </div>
        <div className="amount-entry">
          <span className="cur">{money.symbol}</span>
          <input data-autofocus inputMode="decimal" placeholder="0" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} style={{ width: `${Math.max(1, amount.length) + 0.5}ch` }} />
        </div>
        <p className="t-footnote secondary" style={{ textAlign: 'center' }}>Currently saved: {money(goal.saved)}</p>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

function GoalSheet({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const money = useMoney();
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? money.toInput(goal.target) : '');
  const [saved, setSaved] = useState(goal ? money.toInput(goal.saved) : '');
  const [date, setDate] = useState(goal?.targetDate ?? '');
  const [color, setColor] = useState(goal?.color ?? '#34c759');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const save = async () => {
    const t = money.parse(target);
    const s = saved ? money.parse(saved) : 0;
    if (!name.trim()) return setError('Enter a goal name.');
    if (!t || t <= 0) return setError('Enter a target greater than zero.');
    if (s === null || s < 0) return setError('Enter a valid amount saved.');
    setBusy(true);
    try {
      const body = { name: name.trim(), target: t, saved: s, targetDate: date || null, color };
      if (goal) await api(`/goals/${goal.id}`, { method: 'PATCH', json: body });
      else await api('/goals', { method: 'POST', json: body });
      invalidate();
      toast(goal ? 'Goal updated' : 'Goal created');
      onClose();
    } catch (e: any) { setError(e.message); setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    await api(`/goals/${goal!.id}`, { method: 'DELETE' });
    invalidate();
    toast('Goal deleted');
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={goal ? 'Edit Goal' : 'New Goal'} locked={busy}
      action={<button className="btn btn-plain bold" onClick={save} disabled={busy || !name.trim() || !target}>{busy ? <span className="spinner" /> : 'Save'}</button>}
      footer={goal ? <button className="btn btn-destructive btn-block" onClick={() => setConfirm(true)}>Delete Goal</button> : undefined}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Name" htmlFor="g-name"><input id="g-name" data-autofocus className="input" placeholder="e.g. Emergency Fund" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></Field>
        <div className="grid grid-2">
          <Field label="Target" htmlFor="g-target"><input id="g-target" className="input" inputMode="decimal" placeholder={money(0)} value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.,]/g, ''))} /></Field>
          <Field label="Saved so far" htmlFor="g-saved"><input id="g-saved" className="input" inputMode="decimal" placeholder={money(0)} value={saved} onChange={(e) => setSaved(e.target.value.replace(/[^\d.,]/g, ''))} /></Field>
        </div>
        <Field label="Target date (optional)" htmlFor="g-date"><input id="g-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="field"><span className="field-label">Color</span><ColorPicker value={color} onChange={setColor} /></div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button type="submit" hidden />
      </form>
      <Alert open={confirm} title={`Delete “${goal?.name}”?`} message="This can’t be undone." confirmLabel="Delete" destructive busy={busy} onConfirm={remove} onCancel={() => setConfirm(false)} />
    </Sheet>
  );
}
