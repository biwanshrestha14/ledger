import { useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ComposerProvider } from './components/Composer';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { setUnauthorizedHandler } from './lib/api';
import { keys, useMe } from './lib/queries';
import { useTheme } from './lib/theme';
import { Auth } from './pages/Auth';

const Overview = lazy(() => import('./pages/Overview'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Budgets = lazy(() => import('./pages/Budgets'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Goals = lazy(() => import('./pages/Goals'));
const Bills = lazy(() => import('./pages/Bills'));
const Categories = lazy(() => import('./pages/Categories'));
const Settings = lazy(() => import('./pages/Settings'));
const More = lazy(() => import('./pages/More'));

function Splash() {
  return <div style={{ minHeight: '60dvh', display: 'grid', placeItems: 'center' }} aria-label="Loading"><span className="spinner secondary" /></div>;
}

export function App() {
  useTheme();
  const qc = useQueryClient();
  const me = useMe();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      qc.clear();
      qc.setQueryData(keys.me, null);
    });
  }, [qc]);

  if (me.isLoading) return <Splash />;
  if (!me.data) return <ToastProvider><Auth /></ToastProvider>;

  return (
    <BrowserRouter>
      <ToastProvider>
        <ComposerProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Suspense fallback={<Splash />}><Overview /></Suspense>} />
              <Route path="transactions" element={<Suspense fallback={<Splash />}><Transactions /></Suspense>} />
              <Route path="budgets" element={<Suspense fallback={<Splash />}><Budgets /></Suspense>} />
              <Route path="accounts" element={<Suspense fallback={<Splash />}><Accounts /></Suspense>} />
              <Route path="goals" element={<Suspense fallback={<Splash />}><Goals /></Suspense>} />
              <Route path="bills" element={<Suspense fallback={<Splash />}><Bills /></Suspense>} />
              <Route path="categories" element={<Suspense fallback={<Splash />}><Categories /></Suspense>} />
              <Route path="settings" element={<Suspense fallback={<Splash />}><Settings /></Suspense>} />
              <Route path="more" element={<Suspense fallback={<Splash />}><More /></Suspense>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ComposerProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
