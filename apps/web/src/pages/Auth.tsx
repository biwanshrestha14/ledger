import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Field } from '../components/bits';
import { api } from '../lib/api';
import { keys } from '../lib/queries';
import type { User } from '../lib/types';


export function Auth() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = mode === 'login' ? 'Sign In · Ledger' : 'Create Account · Ledger'; }, [mode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'register' && password.length < 8) return setError('Choose a password with at least 8 characters.');
    setBusy(true);
    try {
      const user = await api<User>(`/auth/${mode}`, {
        method: 'POST',
        json: mode === 'login' ? { email, password } : { name, email, password, currency: 'NPR' },
      });
      qc.setQueryData(keys.me, user);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <img className="auth-logo" src="/icon.svg" alt="" />
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your Ledger'}</h1>
        <p className="lead">{mode === 'login' ? 'Sign in to see where your money is going.' : 'A calm, private place for your spending, budgets and goals.'}</p>
        <form onSubmit={submit} noValidate>
          {mode === 'register' && (
            <Field label="Name" htmlFor="name">
              <input id="name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </Field>
          )}
          <Field label="Email" htmlFor="email">
            <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={mode === 'login'} />
          </Field>
          <Field label="Password" htmlFor="password">
            <div className="pw-wrap">
              <input id="password" className="input" type={show ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : undefined}
                aria-describedby={mode === 'register' ? 'pw-hint' : undefined} />
              <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {mode === 'register' && <span id="pw-hint" className="t-footnote secondary" style={{ paddingLeft: 4 }}>At least 8 characters.</span>}
          </Field>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy || !email || !password || (mode === 'register' && !name)}>
            {busy ? <span className="spinner" /> : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
        <p className="switch-mode">
          {mode === 'login' ? 'New to Ledger? ' : 'Already have an account? '}
          <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
