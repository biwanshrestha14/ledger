import { ArrowDownRight, ArrowUpRight, CalendarClock, ChevronRight, Lightbulb, Plus, Sparkles, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useComposer } from '../components/Composer';
import { Glyph } from '../components/Icon';
import { useToast } from '../components/Toast';
import { TxRow } from '../components/TxRow';
import { Empty, MonthSwitch, PageHeader, Progress, Skeleton } from '../components/bits';
import { api } from '../lib/api';
import { currentMonth, formatMonth, monthBounds, relativeDue } from '../lib/date';
import { useMoney } from '../lib/money';
import { useBudgets, useInvalidateMoney, useMe, useOverview, useTransactions } from '../lib/queries';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function ChartTip({ active, payload, label, fmt, labelFmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tt-label">{labelFmt ? labelFmt(label) : label}</div>
      {payload.filter((p: any) => p.value != null).map((p: any) => (
        <div className="tt-row" key={p.dataKey}>
          <span className="dot" style={{ background: p.color ?? p.payload?.fill }} /> {p.name}: <b>{fmt(p.value)}</b>
        </div>
      ))}
    </div>
  );
}

export default function Overview() {
  const [month, setMonth] = useState(currentMonth());
  const money = useMoney();
  const compose = useComposer();
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const { data: me } = useMe();
  const { data: ov, isLoading } = useOverview(month);
  const { data: budgets = [] } = useBudgets(month);
  const b = monthBounds(month);
  const { data: recent } = useTransactions({ from: b.from, to: b.to, limit: 6 });
  const [loadingSample, setLoadingSample] = useState(false);

  const isCurrent = month === currentMonth();
  const firstName = me?.name.split(' ')[0];

  const loadSample = async () => {
    setLoadingSample(true);
    try {
      await api('/data/sample', { method: 'POST' });
      await invalidate();
      toast('Sample data added. Erase it anytime in Settings.');
    } catch (e: any) {
      toast(e.message);
    } finally {
      setLoadingSample(false);
    }
  };

  if (isLoading || !ov) {
    return (
      <div className="page">
        <PageHeader title="Overview" subtitle={`${greeting()}, ${firstName}`} />
        <div className="grid grid-4">
          <div className="card span-2"><Skeleton h={14} w={90} /><div className="mt-2"><Skeleton h={44} w="60%" /></div><div className="mt-4"><Skeleton h={90} /></div></div>
          {[0, 1].map((i) => <div className="card" key={i}><Skeleton h={14} w={70} /><div className="mt-2"><Skeleton h={28} w="70%" /></div></div>)}
        </div>
      </div>
    );
  }

  const hasActivity = ov.trend.some((t) => t.income || t.expense) || (recent?.total ?? 0) > 0;
  const fmtCompact = (v: number) => money(v, { compact: true });
  const fmtWhole = (v: number) => money(v, { hideCents: true });

  // Spending pace: compare to the same day last month.
  const day = Math.min(ov.daily.dayOfMonth, ov.daily.current.length);
  const spentSoFar = ov.daily.current[day - 1] ?? 0;
  const lastAtSameDay = ov.daily.previous[Math.min(day, ov.daily.previous.length) - 1] ?? 0;
  const paceDiff = spentSoFar - lastAtSameDay;
  const pace = ov.daily.current.map((v, i) => ({
    day: i + 1,
    current: i < day ? v : null,
    previous: ov.daily.previous[i] ?? null,
  }));

  const expenseDelta = ov.previous.expense ? (ov.expense - ov.previous.expense) / ov.previous.expense : null;
  const totalSpent = ov.byCategory.reduce((s, c) => s + c.amount, 0);
  const overBudget = budgets.filter((x) => x.spent > x.amount);
  const sortedBudgets = [...budgets].sort((a, b2) => b2.spent / b2.amount - a.spent / a.amount).slice(0, 4);
  const monthProgress = isCurrent ? day / ov.daily.current.length : 1;
  const nwChange = ov.trend.length > 1 ? ov.trend[11].netWorth - ov.trend[10].netWorth : 0;

  let insight: string | null = null;
  if (ov.previous.expense > 0 && isCurrent && spentSoFar > 0) {
    insight = paceDiff <= 0
      ? `You’ve spent ${fmtWhole(-paceDiff)} less than at this point last month. Nice pace.`
      : `You’ve spent ${fmtWhole(paceDiff)} more than at this point last month${ov.byCategory[0] ? ` — mostly on ${ov.byCategory[0].name}` : ''}.`;
  } else if (overBudget.length) {
    insight = `${overBudget.map((x) => x.categoryName).join(', ')} ${overBudget.length === 1 ? 'is' : 'are'} over budget this month.`;
  }

  return (
    <div className="page">
      <PageHeader title="Overview" subtitle={`${greeting()}, ${firstName}`}>
        <MonthSwitch month={month} onChange={setMonth} />
      </PageHeader>

      {!hasActivity ? (
        <div className="card">
          <Empty icon={Wallet} title="Your ledger is ready" message="Add your first transaction, or explore with three months of realistic sample data.">
            <button className="btn btn-primary" onClick={() => compose()}><Plus size={18} /> Add Transaction</button>
            <button className="btn btn-secondary" onClick={loadSample} disabled={loadingSample}>
              {loadingSample ? <span className="spinner" /> : <Sparkles size={18} />} Try Sample Data
            </button>
          </Empty>
        </div>
      ) : (
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          {insight && (
            <div className="insight" role="note">
              <span className="glyph sm" style={{ background: 'var(--yellow)' }}><Lightbulb size={16} color="#1d1d1f" /></span>
              <p>{insight}</p>
            </div>
          )}

          <div className="grid grid-4">
            <section className="card hero span-2" aria-label="Net worth">
              <div className="row between">
                <span className="hero-label">Net Worth</span>
                {nwChange !== 0 && (
                  <span className={`badge ${nwChange > 0 ? 'green' : 'red'}`}>
                    {nwChange > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />} {money(nwChange, { sign: true, hideCents: true })} this month
                  </span>
                )}
              </div>
              <div className="hero-value">{money(ov.netWorth)}</div>
              <div className="t-footnote secondary mt-2 num">Assets {fmtWhole(ov.assets)} · Liabilities {fmtWhole(ov.liabilities)}</div>
              <div className="chart short mt-4" role="img" aria-label={`Net worth over the last 12 months, from ${fmtWhole(ov.trend[0].netWorth)} to ${fmtWhole(ov.netWorth)}`}>
                <ResponsiveContainer>
                  <AreaChart data={ov.trend} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--indigo)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--indigo)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" tickFormatter={(m) => formatMonth(m, undefined, true)} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                    <YAxis hide domain={['dataMin', 'dataMax']} />
                    <Tooltip content={<ChartTip fmt={fmtWhole} labelFmt={(m: string) => formatMonth(m)} />} cursor={{ stroke: 'var(--separator)' }} />
                    <Area type="monotone" dataKey="netWorth" name="Net worth" stroke="var(--indigo)" strokeWidth={2.5} fill="url(#nw)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="card" aria-label="Spent">
              <div className="stat-label">Spent in {formatMonth(month, undefined, true)}</div>
              <div className="stat-value">{money(ov.expense)}</div>
              {expenseDelta !== null && (
                <div className="stat-delta">
                  {expenseDelta > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {Math.abs(Math.round(expenseDelta * 100))}% vs {formatMonth(ov.previous.month, undefined, true)} total
                </div>
              )}
              <div className="mt-6 stat-label">Income</div>
              <div className="stat-value income">{money(ov.income)}</div>
            </section>

            <section className="card" aria-label="Saved">
              <div className="stat-label">Net this month</div>
              <div className={`stat-value ${ov.net < 0 ? 'negative' : ''}`}>{money(ov.net, { sign: true })}</div>
              <div className="stat-delta">{ov.net >= 0 ? 'Saved' : 'Overspent'}</div>
              <div className="mt-6 stat-label">Savings rate</div>
              <div className="stat-value">{ov.savingsRate === null ? '—' : `${Math.round(ov.savingsRate * 100)}%`}</div>
              {ov.savingsRate !== null && <div className="mt-2"><Progress value={Math.max(0, ov.savingsRate)} color="var(--green)" thin /></div>}
            </section>
          </div>

          <div className="grid grid-2">
            <section className="card" aria-label="Spending pace">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Spending Pace</h2>
                  <p className="t-footnote secondary">
                    {isCurrent && lastAtSameDay > 0
                      ? `${money(Math.abs(paceDiff), { hideCents: true })} ${paceDiff > 0 ? 'more' : 'less'} than last month by day ${day}`
                      : 'Cumulative spending through the month'}
                  </p>
                </div>
              </div>
              <div className="chart" role="img" aria-label={`Cumulative spending: ${fmtWhole(spentSoFar)} by day ${day}, compared with ${fmtWhole(lastAtSameDay)} last month`}>
                <ResponsiveContainer>
                  <LineChart data={pace} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <XAxis dataKey="day" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
                    <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={fmtCompact} />
                    <Tooltip content={<ChartTip fmt={fmtWhole} labelFmt={(d: number) => `Day ${d}`} />} cursor={{ stroke: 'var(--separator)' }} />
                    <Line type="monotone" dataKey="previous" name={formatMonth(ov.previous.month, undefined, true)} stroke="var(--gray-2)" strokeDasharray="4 4" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="current" name={formatMonth(month, undefined, true)} stroke="var(--indigo)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="legend mt-2">
                <span><i className="line" style={{ background: 'var(--indigo)' }} /> {formatMonth(month, undefined, true)}</span>
                <span><i className="dash" /> {formatMonth(ov.previous.month, undefined, true)}</span>
              </div>
            </section>

            <section className="card" aria-label="Spending by category">
              <div className="card-header">
                <h2 className="card-title">Where It Went</h2>
                <Link className="card-link" to={`/transactions?type=expense&from=${b.from}&to=${b.to}`}>See All <ChevronRight size={14} /></Link>
              </div>
              {ov.byCategory.length === 0 ? (
                <p className="t-subhead secondary">No spending in {formatMonth(month)}.</p>
              ) : (
                <div className="row wrap" style={{ gap: 'var(--space-5)', alignItems: 'center' }}>
                  <div className="donut" role="img" aria-label={`Spending by category, ${fmtWhole(totalSpent)} total`}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={ov.byCategory} dataKey="amount" nameKey="name" innerRadius={62} outerRadius={86} paddingAngle={2} cornerRadius={4} stroke="none" isAnimationActive={false}>
                          {ov.byCategory.map((c) => <Cell key={c.name} fill={c.color} />)}
                        </Pie>
                        <Tooltip content={<ChartTip fmt={fmtWhole} labelFmt={() => ''} />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-center"><b>{fmtWhole(totalSpent)}</b><small>spent</small></div>
                  </div>
                  <div className="grow" style={{ minWidth: 200 }}>
                    {ov.byCategory.slice(0, 6).map((c) => (
                      <Link key={c.name} to={`/transactions?categoryId=${c.categoryId ?? 'none'}&from=${b.from}&to=${b.to}`} className="row" style={{ padding: '6px 0', color: 'var(--label)' }}>
                        <span className="dot" style={{ background: c.color }} />
                        <span className="grow t-subhead">{c.name}</span>
                        <span className="t-footnote secondary num">{Math.round((c.amount / totalSpent) * 100)}%</span>
                        <span className="t-subhead num" style={{ minWidth: 80, textAlign: 'right' }}>{fmtWhole(c.amount)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          <div className="grid grid-2">
            <section className="card" aria-label="Budgets">
              <div className="card-header">
                <h2 className="card-title">Budgets</h2>
                <Link className="card-link" to="/budgets">{budgets.length ? 'Manage' : 'Set Up'} <ChevronRight size={14} /></Link>
              </div>
              {sortedBudgets.length === 0 ? (
                <p className="t-subhead secondary">Set monthly limits to see how you’re tracking.</p>
              ) : (
                <div className="stack" style={{ gap: 'var(--space-4)' }}>
                  {sortedBudgets.map((x) => {
                    const ratio = x.spent / x.amount;
                    const over = ratio > 1;
                    return (
                      <div key={x.id}>
                        <div className="row between t-subhead">
                          <span className="row" style={{ gap: 8 }}><Glyph icon={x.categoryIcon} color={x.categoryColor} size="sm" /> {x.categoryName}</span>
                          <span className="num">
                            <b style={{ fontWeight: 600 }} className={over ? 'negative' : ''}>{fmtWhole(x.spent)}</b>
                            <span className="secondary"> / {fmtWhole(x.amount)}</span>
                          </span>
                        </div>
                        <div className="mt-2">
                          <Progress value={ratio} color={over ? 'var(--red)' : ratio > monthProgress + 0.1 ? 'var(--orange)' : x.categoryColor} marker={isCurrent ? monthProgress : undefined} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="card" aria-label="Upcoming bills">
              <div className="card-header">
                <h2 className="card-title">Upcoming Bills</h2>
                <Link className="card-link" to="/bills">{ov.upcoming.length ? 'All Bills' : 'Add'} <ChevronRight size={14} /></Link>
              </div>
              {ov.upcoming.length === 0 ? (
                <p className="t-subhead secondary">Track rent, subscriptions and paychecks so nothing sneaks up on you.</p>
              ) : (
                <div className="list list-plain" style={{ margin: '0 calc(-1 * var(--space-4))' }}>
                  {ov.upcoming.map((r) => {
                    const overdue = relativeDue(r.nextDate).startsWith('Overdue');
                    return (
                      <Link key={r.id} to="/bills" className="list-row" style={{ minHeight: 52 }}>
                        {r.categoryIcon ? <Glyph icon={r.categoryIcon} color={r.categoryColor} /> : <span className="glyph outline"><CalendarClock size={18} /></span>}
                        <div className="grow">
                          <div className="row-title">{r.name}</div>
                          <div className={`row-sub ${overdue ? 'negative' : ''}`}>{relativeDue(r.nextDate)}</div>
                        </div>
                        <span className={`row-value ${r.type === 'income' ? 'income' : ''}`}>{money(r.type === 'income' ? r.amount : -r.amount, { sign: r.type === 'income' })}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <div className="grid grid-2">
            <section className="card" aria-label="Cash flow">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Cash Flow</h2>
                  <p className="t-footnote secondary">Last 6 months</p>
                </div>
                <div className="legend">
                  <span><i style={{ background: 'var(--green)' }} /> Income</span>
                  <span><i style={{ background: 'var(--gray-3)' }} /> Spending</span>
                </div>
              </div>
              <div className="chart" role="img" aria-label={`Income and spending for the last 6 months: ${ov.trend.slice(-6).map((t) => `${formatMonth(t.month, undefined, true)} income ${fmtWhole(t.income)}, spending ${fmtWhole(t.expense)}`).join('; ')}`}>
                <ResponsiveContainer>
                  <BarChart data={ov.trend.slice(-6)} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barGap={3}>
                    <XAxis dataKey="month" tickFormatter={(m) => formatMonth(m, undefined, true)} tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={fmtCompact} />
                    <Tooltip content={<ChartTip fmt={fmtWhole} labelFmt={(m: string) => formatMonth(m)} />} cursor={{ fill: 'var(--fill-quaternary)' }} />
                    <Bar dataKey="income" name="Income" fill="var(--green)" radius={[5, 5, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                    <Bar dataKey="expense" name="Spending" fill="var(--gray-3)" radius={[5, 5, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="card" aria-label="Recent transactions" style={{ paddingBottom: 'var(--space-2)' }}>
              <div className="card-header">
                <h2 className="card-title">Recent</h2>
                <Link className="card-link" to="/transactions">See All <ChevronRight size={14} /></Link>
              </div>
              {recent?.items.length ? (
                <div className="list list-plain" style={{ margin: '0 calc(-1 * var(--space-4))' }}>
                  {recent.items.map((t) => <TxRow key={t.id} tx={t} onClick={() => compose({ tx: t })} />)}
                </div>
              ) : (
                <p className="t-subhead secondary">No transactions in {formatMonth(month)}.</p>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
