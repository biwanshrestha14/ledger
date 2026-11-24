import { ArrowRight, Check } from 'lucide-react';
import { useMoney } from '../lib/money';
import type { Transaction } from '../lib/types';
import { Glyph } from './Icon';

export function TxAmount({ tx }: { tx: Pick<Transaction, 'type' | 'amount'> }) {
  const money = useMoney();
  if (tx.type === 'income') return <span className="row-value income">{money(tx.amount, { sign: true })}</span>;
  if (tx.type === 'transfer') return <span className="row-value secondary">{money(tx.amount)}</span>;
  return <span className="row-value">{money(-tx.amount)}</span>;
}

export function TxRow({ tx, onClick, showDate, selected, selectable, onToggle }: {
  tx: Transaction; onClick: () => void; showDate?: string; selected?: boolean; selectable?: boolean; onToggle?: () => void;
}) {
  const title = tx.type === 'transfer' ? (tx.payee || 'Transfer') : tx.payee || tx.categoryName || (tx.type === 'income' ? 'Income' : 'Expense');
  const sub = tx.type === 'transfer'
    ? <>{tx.accountName} <ArrowRight size={11} style={{ display: 'inline', verticalAlign: '-1px' }} aria-label="to" /> {tx.toAccountName}</>
    : [tx.payee && tx.categoryName ? tx.categoryName : !tx.categoryName ? 'Uncategorized' : null, tx.accountName, showDate].filter(Boolean).join(' · ');
  return (
    <div className={`list-row clickable ${selected ? 'selected' : ''}`} role="button" tabIndex={0}
      onClick={selectable ? onToggle : onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (selectable ? onToggle : onClick)?.(); } }}
      aria-label={`${title}, ${tx.type}`}
    >
      {selectable && <span className="check" role="checkbox" aria-checked={!!selected}>{selected && <Check size={14} strokeWidth={3} />}</span>}
      {tx.type === 'transfer'
        ? <span className="glyph outline"><ArrowRight size={18} /></span>
        : <Glyph icon={tx.categoryIcon ?? (tx.categoryName ? undefined : 'circle-help')} color={tx.categoryColor ?? 'var(--gray)'} />}
      <div className="grow">
        <div className="row-title">{title}</div>
        <div className="row-sub">{sub}{tx.note ? ` — ${tx.note}` : ''}</div>
      </div>
      <TxAmount tx={tx} />
    </div>
  );
}
