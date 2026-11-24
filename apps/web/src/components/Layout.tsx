import { CalendarClock, CreditCard, Ellipsis, LayoutGrid, List, PieChart, Plus, Settings, Tags, Target } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useMe } from '../lib/queries';
import { useComposer } from './Composer';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/transactions', label: 'Transactions', icon: List },
  { to: '/budgets', label: 'Budgets', icon: PieChart },
  { to: '/accounts', label: 'Accounts', icon: CreditCard },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/bills', label: 'Bills', icon: CalendarClock },
  { to: '/categories', label: 'Categories', icon: Tags },
];

const TABS = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/transactions', label: 'Activity', icon: List },
  { to: '/budgets', label: 'Budgets', icon: PieChart },
  { to: '/accounts', label: 'Accounts', icon: CreditCard },
  { to: '/more', label: 'More', icon: Ellipsis },
];

export function Layout() {
  const { data: me } = useMe();
  const compose = useComposer();
  const initials = (me?.name ?? '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="shell">
      <a href="#main" className="sr-only">Skip to content</a>
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand"><img src="/icon.svg" alt="" /> Ledger</div>
        <button className="btn btn-primary" onClick={() => compose()}>
          <Plus size={18} strokeWidth={2.5} /> New Transaction <span className="kbd" style={{ background: 'rgb(255 255 255 / 0.2)', color: 'inherit' }}>N</span>
        </button>
        <nav className="stack" style={{ gap: 2 }}>
          {NAV.map(({ to, label, icon: I, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <I size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="nav-spacer" />
        <NavLink to="/settings" className={({ isActive }) => `nav-user ${isActive ? 'nav-item active' : ''}`}>
          <span className="avatar" aria-hidden>{initials}</span>
          <span className="grow">
            <span className="t-subhead" style={{ display: 'block', fontWeight: 600 }}>{me?.name}</span>
            <span className="t-caption secondary">Settings</span>
          </span>
          <Settings size={16} className="secondary" />
        </NavLink>
      </aside>

      <main id="main" className="main">
        <Outlet />
      </main>

      <button className="fab" onClick={() => compose()} aria-label="New transaction"><Plus size={26} strokeWidth={2.5} /></button>
      <nav className="tabbar" aria-label="Tabs">
        {TABS.map(({ to, label, icon: I, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            <I size={22} /> {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
