import { Ellipsis, Share, SquarePlus } from 'lucide-react';
import { Sheet } from './Sheet';

/** Step-by-step Add to Home Screen guide for iPhone/iPad (Safari has no install prompt). */
export function InstallSheet({ onClose }: { onClose: () => void }) {
  const step = (n: number, icon: React.ReactNode, text: React.ReactNode) => (
    <div className="list-row" style={{ minHeight: 64 }}>
      <span className="glyph outline" aria-hidden>{icon}</span>
      <div className="grow"><div className="t-footnote secondary">Step {n}</div><div className="t-body">{text}</div></div>
    </div>
  );
  return (
    <Sheet open onClose={onClose} title="Install Ledger" hideCancel action={<button className="btn btn-plain bold" onClick={onClose}>Done</button>}>
      <div className="stack">
        <p className="t-subhead secondary">Add Ledger to your Home Screen to open it full screen, like any other app.</p>
        <div className="list" style={{ background: 'var(--surface-elevated)', boxShadow: 'none' }}>
          {step(1, <Share size={18} />, <>Tap <b>Share</b> in Safari’s toolbar.{' '}<span className="secondary">(In Chrome, tap <Ellipsis size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> first.)</span></>)}
          {step(2, <SquarePlus size={18} />, <>Choose <b>Add to Home Screen</b>.</>)}
          {step(3, <img src="/icon.svg" alt="" width={20} height={20} />, <>Tap <b>Add</b>. Ledger appears on your Home Screen.</>)}
        </div>
        <p className="t-footnote secondary">The installed app keeps its own sign-in, so you’ll sign in once more the first time you open it.</p>
      </div>
    </Sheet>
  );
}
