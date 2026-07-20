'use client';

import { useState, useTransition } from 'react';
import { requestMagicLink } from '../actions';
import { sha256HexClient } from '@/lib/crypto-client';

export default function LoginForm() {
  const [mode, setMode]         = useState<'email' | 'cug'>('email');
  const [email, setEmail]       = useState('');
  const [cug, setCug]           = useState('');
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      sessionStorage.setItem('deoEmail', email);
    } catch {}
    startTransition(async () => {
      const result = await requestMagicLink(email);
      if (result.error) setError(result.error);
      else setSent(true);
    });
  }

  function submitCug(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const cugHash = await sha256HexClient(cug.trim());
      const res = await fetch('/api/auth/verify-cug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cugHash }),
      });
      const data = await res.json() as { redirect?: string; error?: string };
      if (data.redirect) window.location.href = data.redirect;
      else setError(data.error ?? 'Invalid CUG number');
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="card bg-base-100 shadow-xl p-8 w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          {/* tabler:shield-check */}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-primary mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a12 12 0 0 0 8.5 3A12 12 0 0 1 12 21A12 12 0 0 1 3.5 6A12 12 0 0 0 12 3"/><path d="m9 12 2 2 4-4"/></svg>
          <h1 className="text-2xl font-bold">UP Excise Spatial Revenue Optimizer</h1>
          <p className="text-sm text-base-content/80">Department of Excise, Government of Uttar Pradesh</p>
        </div>

        {!sent && (
          <div className="tabs tabs-boxed">
            <button type="button" className={`tab flex-1 ${mode === 'email' ? 'tab-active' : ''}`} onClick={() => { setMode('email'); setError(null); }}>
              Email link
            </button>
            <button type="button" className={`tab flex-1 ${mode === 'cug' ? 'tab-active' : ''}`} onClick={() => { setMode('cug'); setError(null); }}>
              CUG number
            </button>
          </div>
        )}

        {sent ? (
          <div className="alert alert-success">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>
            <div>
              <p className="font-medium">Check your email</p>
              <p className="text-sm">A sign-in link has been sent to <strong>{email}</strong>. The link expires in 15 minutes.</p>
            </div>
          </div>
        ) : mode === 'email' ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="form-control">
              <label className="label" htmlFor="email">
                <span className="label-text font-medium">Email address</span>
              </label>
              <input
                id="email"
                type="email"
                className="input input-bordered w-full"
                placeholder="your.name@example.gov.in"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            {error && (
              <div className="alert alert-warning text-sm py-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={isPending || !email}>
              {isPending ? <span className="loading loading-spinner loading-sm" /> : 'Send sign-in link'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCug} className="space-y-4">
            <div className="form-control">
              <label className="label" htmlFor="cug">
                <span className="label-text font-medium">CUG mobile number</span>
              </label>
              <input
                id="cug"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]{10}"
                maxLength={10}
                className="input input-bordered w-full"
                placeholder="10-digit CUG number"
                value={cug}
                onChange={e => setCug(e.target.value.replace(/\D/g, ''))}
                required
                autoComplete="off"
              />
            </div>

            {error && (
              <div className="alert alert-warning text-sm py-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={isPending || cug.length !== 10}>
              {isPending ? <span className="loading loading-spinner loading-sm" /> : 'Sign in'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-base-content/60">
          Access is restricted to provisioned accounts only.
        </p>
      </div>
    </main>
  );
}
