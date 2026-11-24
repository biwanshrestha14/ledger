import { CalendarClock, ChevronRight, Settings, Smartphone, Tags, Target } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { InstallSheet } from '../components/InstallSheet';
import { PageHeader } from '../components/bits';
import { useInstall } from '../lib/install';

const ITEMS = [
  { to: '/goals', label: 'Goals', icon: Target, color: 'var(--pink)' },
  { to: '/bills', label: 'Bills', icon: CalendarClock, color: 'var(--orange)' },
  { to: '/categories', label: 'Categories', icon: Tags, color: 'var(--indigo)' },
  { to: '/settings', label: 'Settings', icon: Settings, color: 'var(--gray)' },
];

export default function More() {
  const install = useInstall();
  const [iosSteps, setIosSteps] = useState(false);
  return (
    <div className="page">
      <PageHeader title="More" />
      {(install.canPrompt || install.needsIOSSteps) && (
        <div className="list" style={{ marginBottom: 'var(--space-6)' }}>
          <button className="list-row" onClick={() => (install.canPrompt ? install.prompt() : setIosSteps(true))}>
            <span className="glyph" style={{ background: 'var(--blue)' }}><Smartphone size={19} /></span>
            <span className="grow"><span className="row-title" style={{ display: 'block' }}>Install App</span><span className="row-sub">Add Ledger to your Home Screen</span></span>
            <ChevronRight size={16} className="row-chevron" />
          </button>
        </div>
      )}
      {iosSteps && <InstallSheet onClose={() => setIosSteps(false)} />}
      <div className="list">
        {ITEMS.map(({ to, label, icon: I, color }) => (
          <Link key={to} to={to} className="list-row">
            <span className="glyph" style={{ background: color }}><I size={19} /></span>
            <span className="grow row-title">{label}</span>
            <ChevronRight size={16} className="row-chevron" />
          </Link>
        ))}
      </div>
    </div>
  );
}
