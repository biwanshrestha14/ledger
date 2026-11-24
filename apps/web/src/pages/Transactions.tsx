import { CheckSquare, Download, Ellipsis, FileUp, Plus, Search, SearchX, Tag, Trash2, X } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useComposer } from '../components/Composer';
import { ImportSheet } from '../components/ImportSheet';
import { Glyph } from '../components/Icon';
import { Alert, Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { TxRow } from '../components/TxRow';
import { Empty, ListSkeleton, Menu, PageHeader } from '../components/bits';
import { api } from '../lib/api';
import { currentMonth, formatDay, monthBounds, shiftMonth, todayISO } from '../lib/date';
import { useMoney } from '../lib/money';
import { useAccounts, useCategories, useInvalidateMoney, useTransactions } from '../lib/queries';
import type { Transaction } from '../lib/types';

type Period = 'all' | 'this' | 'last' | '90' | 'year' | 'custom';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'all', label: 'All Time' },
  { value: 'this', label: 'This Month' },
  { value: 'last', label: 'Last Month' },
  { value: '90', label: 'Last 90 Days' },
  { value: 'year', label: 'This Year' },
];

function periodRange(p: Period): { from?: string; to?: string } {
  const m = currentMonth();
  if (p === 'this') return monthBounds(m);
  if (p === 'last') return monthBounds(shiftMonth(m, -1));
  if (p === '90') { const d = new Date(); d.setDate(d.getDate() - 90); return { from: d.toLocaleDateString('en-CA'), to: todayISO() }; }
  if (p === 'year') return { from: `${m.slice(0, 4)}-01-01`, to: `${m.slice(0, 4)}-12-31` };
  return {};
}

function detectPeriod(from?: string | null, to?: string | null): Period {
  if (!from && !to) return 'all';
  for (const p of ['this', 'last', '90', 'year'] as Period[]) {
    const r = periodRange(p);
    if (r.from === from && r.to === to) return p;
  }
  return 'custom';
}

export default function Transactions() {
  const money = useMoney();
  const compose = useComposer();
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const [params, setParams] = useSearchParams();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const [q, setQ] = useState(params.get('q') ?? '');
  const dq = useDeferredValue(q);
  const [limit, setLimit] = useState(100);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [catSheet, setCatSheet] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const filters = {
    q: dq.trim() || undefined,
    type: params.get('type') ?? undefined,
    accountId: params.get('accountId') ?? undefined,
    categoryId: params.get('categoryId') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    limit,
  };
  const { data, isLoading, isFetching } = useTransactions(filters);
  const period = detectPeriod(filters.from, filters.to);

  const setParam = (k: string, v?: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
    setLimit(100);
  };
  const setPeriod = (p: Period) => {
    const r = periodRange(p);
    const next = new URLSearchParams(params);
    next.delete('from'); next.delete('to');
    if (r.from) next.set('from', r.from);
    if (r.to) next.set('to', r.to);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !t.closest('input, textarea, select, [role=dialog]')) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of data?.items ?? []) {
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date)!.push(t);
    }
    return [...map.entries()];
  }, [data]);

  const activeFilters = ['type', 'accountId', 'categoryId', 'from', 'to'].some((k) => params.get(k)) || !!q;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const exitSelect = () => { setSelecting(false); setSelected(new Set()); };

  const bulkDelete = async () => {
    setBusy(true);
    try {
      const r = await api<{ deleted: number }>('/transactions/bulk-delete', { method: 'POST', json: { ids: [...selected] } });
      toast(`${r.deleted} transaction${r.deleted === 1 ? '' : 's'} deleted`);
      exitSelect();
      invalidate();
    } catch (e: any) { toast(e.message); }
    setBusy(false);
    setConfirmBulk(false);
  };

  const bulkCategorize = async (categoryId: string | null) => {
    try {
      const r = await api<{ updated: number }>('/transactions/bulk-categorize', { method: 'POST', json: { ids: [...selected], categoryId } });
      toast(`${r.updated} transaction${r.updated === 1 ? '' : 's'} updated`);
      setCatSheet(false);
      exitSelect();
      invalidate();
    } catch (e: any) { toast(e.message); }
  };

  const categoryOptions = categories.filter((c) => !c.archived);

  return (
    <div className="page">
      <PageHeader title="Transactions" subtitle={data ? `${data.total.toLocaleString()} ${data.total === 1 ? 'transaction' : 'transactions'}` : undefined}>
        <button className="btn btn-gray btn-sm hide-mobile" onClick={() => (selecting ? exitSelect() : setSelecting(true))}>
          {selecting ? 'Done' : <><CheckSquare size={16} /> Select</>}
        </button>
        <Menu trigger={(p) => <button className="icon-btn gray" aria-label="More actions" {...p}><Ellipsis size={18} /></button>}>
          {(close) => (
            <>
              <button className="menu-item hide-desktop" onClick={() => { close(); setSelecting(true); }}><CheckSquare size={16} /> Select</button>
              <button className="menu-item" onClick={() => { close(); setImportOpen(true); }}><FileUp size={16} /> Import CSV…</button>
              <a className="menu-item" href="/api/data/export.csv" onClick={close}><Download size={16} /> Export CSV</a>
            </>
          )}
        </Menu>
      </PageHeader>

      <div className="filters">
        <div className="search">
          <Search size={16} />
          <input ref={searchRef} className="input" type="search" placeholder="Search payee, note or category" value={q}
            onChange={(e) => { setQ(e.target.value); setLimit(100); }} aria-label="Search transactions" style={{ minHeight: 36 }} />
        </div>
        <select className="select" value={period} onChange={(e) => setPeriod(e.target.value as Period)} aria-label="Period">
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          {period === 'custom' && <option value="custom">{filters.from} – {filters.to}</option>}
        </select>
        <select className="select" value={filters.type ?? ''} onChange={(e) => setParam('type', e.target.value)} aria-label="Type">
          <option value="">All Types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
          <option value="transfer">Transfers</option>
        </select>
        <select className="select" value={filters.accountId ?? ''} onChange={(e) => setParam('accountId', e.target.value)} aria-label="Account">
          <option value="">All Accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="select" value={filters.categoryId ?? ''} onChange={(e) => setParam('categoryId', e.target.value)} aria-label="Category">
          <option value="">All Categories</option>
          <option value="none">Uncategorized</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {activeFilters && (
          <button className="btn btn-plain btn-sm" onClick={() => { setQ(''); setParams({}, { replace: true }); }}><X size={14} /> Clear</button>
        )}
      </div>

      {data && data.total > 0 && (
        <div className="summary-strip" aria-live="polite">
          <span>Income <b className="income">{money(data.income)}</b></span>
          <span>Spending <b>{money(data.expense)}</b></span>
          <span>Net <b>{money(data.income - data.expense, { sign: true })}</b></span>
          {isFetching && <span className="spinner" style={{ width: 14, height: 14 }} aria-label="Updating" />}
        </div>
      )}

      {selecting && (
        <div className="bulk-bar">
          <span className="t-subhead grow"><b>{selected.size}</b> selected</span>
          <button className="btn btn-plain btn-sm" onClick={() => setSelected(new Set(data?.items.map((t) => t.id)))}>Select All</button>
          <button className="btn btn-gray btn-sm" disabled={!selected.size} onClick={() => setCatSheet(true)}><Tag size={15} /> Categorize</button>
          <button className="btn btn-destructive btn-sm" disabled={!selected.size} onClick={() => setConfirmBulk(true)}><Trash2 size={15} /> Delete</button>
          <button className="btn btn-plain btn-sm bold" onClick={exitSelect}>Done</button>
        </div>
      )}

      {isLoading ? <ListSkeleton rows={8} /> : !data?.items.length ? (
        <div className="card">
          {activeFilters ? (
            <Empty icon={SearchX} color="var(--gray)" title="No matches" message="Try a different search or clear the filters.">
              <button className="btn btn-gray" onClick={() => { setQ(''); setParams({}, { replace: true }); }}>Clear Filters</button>
            </Empty>
          ) : (
            <Empty icon={Plus} title="No transactions yet" message="Add one by hand, or import a CSV export from your bank.">
              <button className="btn btn-primary" onClick={() => compose()}><Plus size={18} /> Add Transaction</button>
              <button className="btn btn-secondary" onClick={() => setImportOpen(true)}><FileUp size={18} /> Import CSV</button>
            </Empty>
          )}
        </div>
      ) : (
        <>
          {groups.map(([date, items]) => {
            const net = items.reduce((s, t) => s + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0);
            return (
              <section key={date} aria-label={formatDay(date)}>
                <h2 className="list-section-title">
                  <span>{formatDay(date, money.locale)}</span>
                  {net !== 0 && <span className="num">{money(net, { sign: true })}</span>}
                </h2>
                <div className="list">
                  {items.map((t) => (
                    <TxRow key={t.id} tx={t} onClick={() => compose({ tx: t })} selectable={selecting} selected={selected.has(t.id)} onToggle={() => toggle(t.id)} />
                  ))}
                </div>
              </section>
            );
          })}
          {data.total > data.items.length && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--space-6)' }}>
              <button className="btn btn-gray" onClick={() => setLimit((l) => l + 100)} disabled={isFetching}>
                {isFetching ? <span className="spinner" /> : `Show More (${(data.total - data.items.length).toLocaleString()} left)`}
              </button>
            </div>
          )}
        </>
      )}

      <Alert open={confirmBulk} title={`Delete ${selected.size} transaction${selected.size === 1 ? '' : 's'}?`}
        message="This can’t be undone. Balances and budgets will update." confirmLabel="Delete" destructive busy={busy}
        onConfirm={bulkDelete} onCancel={() => setConfirmBulk(false)} />

      <Sheet open={catSheet} onClose={() => setCatSheet(false)} title="Choose Category">
        <p className="t-footnote secondary" style={{ marginBottom: 'var(--space-3)' }}>Only transactions of the matching type (expense or income) will change. Transfers are skipped.</p>
        <div className="list" style={{ background: 'var(--surface-elevated)', boxShadow: 'none' }}>
          {categoryOptions.map((c) => (
            <button key={c.id} className="list-row" onClick={() => bulkCategorize(c.id)}>
              <Glyph icon={c.icon} color={c.color} /> <span className="grow row-title">{c.name}</span>
              <span className="t-footnote secondary">{c.kind === 'income' ? 'Income' : 'Expense'}</span>
            </button>
          ))}
          <button className="list-row" onClick={() => bulkCategorize(null)}>
            <span className="glyph outline"><X size={18} /></span> <span className="grow row-title">Remove Category</span>
          </button>
        </div>
      </Sheet>

      {importOpen && <ImportSheet onClose={() => setImportOpen(false)} />}
    </div>
  );
}
