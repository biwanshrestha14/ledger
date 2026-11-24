import { ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Trailing header action, e.g. a Save button. */
  action?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Prevent closing by scrim click/Escape while e.g. a save is in flight. */
  locked?: boolean;
  /** Informational sheets show only Done (trailing), no Cancel. */
  hideCancel?: boolean;
}

export function Sheet({ open, onClose, title, children, action, footer, wide, locked, hideCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    const focusable = () => el.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])');
    requestAnimationFrame(() => {
      const auto = el.querySelector<HTMLElement>('[data-autofocus]');
      (auto ?? el).focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const f = Array.from(focusable());
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose, locked]);

  if (!open) return null;
  return createPortal(
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !locked) onClose(); }}>
      <div ref={ref} className={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="sheet-header">
          {hideCancel ? <span /> : <button className="btn btn-plain" onClick={onClose} disabled={locked}>Cancel</button>}
          <h2 id={titleId} className="sheet-title">{title}</h2>
          <div>{action}</div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

interface AlertProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

export function Alert({ open, title, message, confirmLabel, destructive, busy, onConfirm, onCancel, children }: AlertProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => (ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current)?.focus());
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return createPortal(
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div ref={ref} className="sheet alert" role="alertdialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="sheet-body">
          <h2 id={titleId} className="t-headline">{title}</h2>
          {message && <p className="t-subhead secondary mt-2">{message}</p>}
          {children}
        </div>
        <div className="sheet-footer">
          <button className={`btn btn-block ${destructive ? 'btn-destructive-solid' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? <span className="spinner" /> : confirmLabel}
          </button>
          <button className="btn btn-block btn-gray" onClick={onCancel} data-autofocus>Cancel</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
