import { ArrowLeftRight, Trash2 } from 'lucide-react';
import { createContext, FormEvent, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { todayISO } from '../lib/date';
import { useMoney } from '../lib/money';
import { useAccounts, useCategories, useInvalidateMoney, usePayees } from '../lib/queries';
import type { Transaction, TxType } from '../lib/types';
import { Glyph } from './Icon';
import { Segmented } from './Segmented';
import { Alert, Sheet } from './Sheet';
import { useToast } from './Toast';
import { Field } from './bits';

type Open = (opts?: { tx?: Transaction; defaults?: Partial<Pick<Transaction, 'type' | 'accountId' | 'categoryId'>> }) => void;
const Ctx = createContext<Open>(() => {});
export const useComposer = () => useContext(Ctx);

export function ComposerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; tx?: Transaction; defaults?: any; key: number }>({ open: false, key: 0 });
  const open = useCallback<Open>((o) => setState((s) => ({ open: true, tx: o?.tx, defaults: o?.defaults, key: s.key + 1 })), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  // Global shortcut: "N" opens a new transaction (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, select, [contenteditable], [role=dialog]')) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); open(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <Ctx.Provider value={open}>
      {children}
      {state.open && <TransactionSheet key={state.key} tx={state.tx} defaults={state.defaults} onClose={close} />}
    </Ctx.Provider>
  );
}

const TYPE_OPTIONS: { value: TxType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

function TransactionSheet({ tx, defaults, onClose }: { tx?: Transaction; defaults?: any; onClose: () => void }) {
  const money = useMoney();
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: payees = [] } = usePayees();
  const active = accounts.filter((a) => !a.archived || a.id === tx?.accountId || a.id === tx?.toAccountId);

  const [type, setType] = useState<TxType>(tx?.type ?? defaults?.type ?? 'expense');
  const [amount, setAmount] = useState(tx ? money.toInput(tx.amount) : '');
  const [payee, setPayee] = useState(tx?.payee ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(tx?.categoryId ?? defaults?.categoryId ?? null);
  const [accountId, setAccountId] = useState(tx?.accountId ?? defaults?.accountId ?? '');
  const [toAccountId, setToAccountId] = useState(tx?.toAccountId ?? '');
  const [date, setDate] = useState(tx?.date ?? todayISO());
  const [note, setNote] = useState(tx?.note ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const categoryTouched = useRef(!!tx);

  useEffect(() => {
    if (!accountId && active.length) setAccountId(active[0].id);
  }, [active, accountId]);
  useEffect(() => {
    if (type === 'transfer' && !toAccountId) setToAccountId(active.find((a) => a.id !== accountId)?.id ?? '');
  }, [type, active, accountId, toAccountId]);

  const kindCats = categories.filter((c) => c.kind === type && (!c.archived || c.id === categoryId));
  useEffect(() => {
    if (categoryId && !kindCats.some((c) => c.id === categoryId)) setCategoryId(null);
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestions = useMemo(() => {
    const q = payee.trim().toLowerCase();
    if (!q) return [];
    return payees.filter((p) => p.payee.toLowerCase().includes(q) && p.payee.toLowerCase() !== q).slice(0, 6);
  }, [payee, payees]);

  const pickPayee = (name: string) => {
    setPayee(name);
    setSuggestOpen(false);
    const match = payees.find((p) => p.payee.toLowerCase() === name.toLowerCase());
    if (match && !categoryTouched.current && match.type === type && match.categoryId) setCategoryId(match.categoryId);
  };

  const minor = money.parse(amount);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    setError('');
    if (!minor || minor <= 0) return setError('Enter an amount greater than zero.');
    if (!accountId) return setError('Add an account first.');
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) return setError('Choose two different accounts for a transfer.');
    const body = {
      type, amount: minor, accountId, date, payee: payee.trim(), note: note.trim(),
      categoryId: type === 'transfer' ? null : categoryId,
      toAccountId: type === 'transfer' ? toAccountId : null,
    };
    setSaving(true);
    try {
      if (tx) {
        await api(`/transactions/${tx.id}`, { method: 'PATCH', json: body });
        toast('Transaction updated');
      } else {
        const created = await api<Transaction>('/transactions', { method: 'POST', json: body });
        toast(`${type === 'transfer' ? 'Transfer' : type === 'income' ? 'Income' : 'Expense'} of ${money(minor)} added`, {
          label: 'Undo',
          run: async () => { await api(`/transactions/${created.id}`, { method: 'DELETE' }); invalidate(); },
        });
      }
      invalidate();
      onClose();
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!tx) return;
    setSaving(true);
    try {
      await api(`/transactions/${tx.id}`, { method: 'DELETE' });
      invalidate();
      onClose();
      toast('Transaction deleted', {
        label: 'Undo',
        run: async () => {
          await api('/transactions', { method: 'POST', json: {
            type: tx.type, amount: tx.amount, accountId: tx.accountId, toAccountId: tx.toAccountId, categoryId: tx.categoryId,
            date: tx.date, payee: tx.payee, note: tx.note,
          } });
          invalidate();
        },
      });
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA'); })();

  return (
    <Sheet
      open
      onClose={onClose}
      locked={saving}
      title={tx ? 'Edit Transaction' : 'New Transaction'}
      action={<button className="btn btn-plain bold" onClick={() => submit()} disabled={saving || !minor}>{saving ? <span className="spinner" /> : tx ? 'Save' : 'Add'}</button>}
      footer={tx ? (
        <button className="btn btn-destructive btn-block" onClick={() => setConfirmDelete(true)} disabled={saving}><Trash2 size={18} /> Delete Transaction</button>
      ) : undefined}
    >
      <form className="stack" onSubmit={submit} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}>
        <Segmented label="Transaction type" value={type} options={TYPE_OPTIONS} onChange={setType} />

        <div className={`amount-entry ${type}`}>
          <span className="cur" aria-hidden>{money.symbol}</span>
          <input
            data-autofocus inputMode="decimal" autoComplete="off" placeholder="0" aria-label={`Amount in ${money.currency}`}
            value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
            style={{ width: `${Math.max(1, amount.length || 1) + 0.5}ch` }}
          />
        </div>

        {type !== 'transfer' ? (
          <>
            <Field label={type === 'income' ? 'From' : 'Payee'} htmlFor="payee">
              <div style={{ position: 'relative' }}>
                <input
                  id="payee" className="input" placeholder={type === 'income' ? 'Employer, client…' : 'Store, person, service…'}
                  value={payee} autoComplete="off" role="combobox" aria-expanded={suggestOpen && suggestions.length > 0} aria-autocomplete="list"
                  onChange={(e) => { setPayee(e.target.value); setSuggestOpen(true); setSuggestIdx(0); }}
                  onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
                  onKeyDown={(e) => {
                    if (!suggestOpen || !suggestions.length) return;
                    if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestIdx((i) => (i + 1) % suggestions.length); }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestIdx((i) => (i - 1 + suggestions.length) % suggestions.length); }
                    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); pickPayee(suggestions[suggestIdx].payee); }
                    if (e.key === 'Escape') { e.stopPropagation(); setSuggestOpen(false); }
                  }}
                  maxLength={120}
                />
                {suggestOpen && suggestions.length > 0 && (
                  <div className="suggest" role="listbox">
                    {suggestions.map((s, i) => {
                      const c = categories.find((c) => c.id === s.categoryId);
                      return (
                        <button type="button" role="option" aria-selected={i === suggestIdx} key={s.payee} onMouseDown={(e) => e.preventDefault()} onClick={() => pickPayee(s.payee)}>
                          <Glyph icon={c?.icon} color={c?.color} size="sm" />
                          <span className="grow">{s.payee}</span>
                          {c && <span className="t-footnote secondary">{c.name}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Field>

            <div className="field">
              <span className="field-label" id="cat-label">Category</span>
              <div className="chips" role="group" aria-labelledby="cat-label">
                {kindCats.map((c) => (
                  <button
                    type="button" key={c.id} className="chip" aria-pressed={c.id === categoryId}
                    onClick={() => { categoryTouched.current = true; setCategoryId(c.id === categoryId ? null : c.id); }}
                  >
                    <Glyph icon={c.icon} color={c.color} size="sm" /> {c.name}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Account" htmlFor="account">
              <select id="account" className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          </>
        ) : (
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="grow">
              <Field label="From" htmlFor="from-acct">
                <select id="from-acct" className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
            </div>
            <button type="button" className="icon-btn" aria-label="Swap accounts" onClick={() => { setAccountId(toAccountId); setToAccountId(accountId); }}>
              <ArrowLeftRight size={18} />
            </button>
            <div className="grow">
              <Field label="To" htmlFor="to-acct">
                <select id="to-acct" className="select" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                  {active.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
            </div>
          </div>
        )}

        <div className="field">
          <label className="field-label" htmlFor="date">Date</label>
          <div className="row wrap">
            <input id="date" type="date" className="input grow" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ flexBasis: 160 }} />
            <button type="button" className="chip plain" aria-pressed={date === todayISO()} onClick={() => setDate(todayISO())}>Today</button>
            <button type="button" className="chip plain" aria-pressed={date === yesterday} onClick={() => setDate(yesterday)}>Yesterday</button>
          </div>
        </div>

        <Field label="Note" htmlFor="note">
          <input id="note" className="input" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>

        {error && <div className="form-error" role="alert">{error}</div>}
        <button type="submit" hidden />
      </form>

      <Alert
        open={confirmDelete} title="Delete this transaction?" message="Account balances and budgets will update." confirmLabel="Delete"
        destructive busy={saving} onConfirm={remove} onCancel={() => setConfirmDelete(false)}
      />
    </Sheet>
  );
}
