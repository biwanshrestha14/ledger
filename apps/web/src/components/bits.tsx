import { ChevronLeft, ChevronRight, LucideIcon } from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { currentMonth, formatMonth, shiftMonth } from '../lib/date';
import { PALETTE } from './Icon';

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  useEffect(() => { document.title = `${title} · Ledger`; }, [title]);
  return (
    <header className="page-header">
      <div>
        <h1 className="t-large-title">{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {children && <div className="header-actions">{children}</div>}
    </header>
  );
}

export function MonthSwitch({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const isCurrent = month >= currentMonth();
  return (
    <div className="month-switch">
      <button className="icon-btn" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft size={18} /></button>
      <span aria-live="polite">{formatMonth(month)}</span>
      <button className="icon-btn" onClick={() => onChange(shiftMonth(month, 1))} disabled={isCurrent} aria-label="Next month"><ChevronRight size={18} /></button>
    </div>
  );
}

export function Empty({ icon: I, color = 'var(--accent)', title, message, children }: { icon: LucideIcon; color?: string; title: string; message?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="glyph lg" style={{ background: color }}><I size={24} /></span>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="list" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div className="list-row" key={i}>
          <Skeleton h={36} w={36} r={10} />
          <div className="grow stack" style={{ gap: 6 }}><Skeleton h={14} w="45%" /><Skeleton h={12} w="25%" /></div>
          <Skeleton h={14} w={64} />
        </div>
      ))}
    </div>
  );
}

export function Progress({ value, color, thin, marker }: { value: number; color: string; thin?: boolean; marker?: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="progress-marker">
      <div className={`progress ${thin ? 'thin' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
        <span style={{ width: `${pct}%`, background: color }} />
      </div>
      {marker !== undefined && <span className="today-mark" style={{ left: `calc(${Math.min(1, marker) * 100}% - 1px)` }} title="Today" />}
    </div>
  );
}

export function Ring({ value, color, size = 64 }: { value: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-tertiary)" strokeWidth={7} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} />
      </svg>
      <b>{Math.round(value * 100)}%</b>
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label="Color">
      {PALETTE.map((c) => (
        <button key={c} type="button" className="swatch" style={{ background: c }} aria-pressed={c === value} aria-label={c} onClick={() => onChange(c)} />
      ))}
    </div>
  );
}

export function Field({ label, error, children, htmlFor }: { label: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function Menu({ trigger, children, align = 'right' }: { trigger: (p: { onClick: () => void; 'aria-expanded': boolean }) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open })}
      {open && <div className={`menu ${align}`} role="menu">{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}
