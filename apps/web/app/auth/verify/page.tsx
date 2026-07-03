'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<'idle' | 'verifying' | 'error'>('idle');
  const [error, setError] = useState<'expired' | 'no_account' | 'missing' | null>(
    token ? null : 'missing',
  );

  function verifyToken() {
    if (!token) return;
    setStatus('verifying');
    fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json() as Promise<{ redirect?: string; error?: string }>)
      .then((d) => {
        if (d.redirect) {
          window.location.href = d.redirect;
        } else {
          setError((d.error as typeof error) ?? 'expired');
          setStatus('error');
        }
      })
      .catch(() => {
        setError('expired');
        setStatus('error');
      });
  }

  const messages: Record<NonNullable<typeof error>, string> = {
    expired: 'Sign-in links expire after 15 minutes and can only be used once.',
    no_account: 'Contact your administrator to have your account provisioned.',
    missing: 'No sign-in token found. Please request a new magic link.',
  };

  if (status === 'error' || error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="card bg-base-100 shadow-xl p-8 w-full max-w-md text-center space-y-4">
          <p className="text-xl font-semibold text-error">Link invalid or expired</p>
          <p className="text-sm text-base-content/80">{error ? messages[error] : messages.expired}</p>
          <a href="/login" className="btn btn-primary">Request a new link</a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="card bg-base-100 shadow-xl p-8 w-full max-w-md text-center space-y-6">
        <h2 className="text-2xl font-bold text-base-content">Complete Sign In</h2>
        <p className="text-sm text-base-content/90">Click the button below to verify your login and access the portal securely.</p>
        <button
          className="btn btn-primary w-full"
          onClick={verifyToken}
          disabled={status === 'verifying'}
        >
          {status === 'verifying' ? (
            <><span className="loading loading-spinner" /> Verifying...</>
          ) : (
            'Verify & Continue'
          )}
        </button>
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-base-200">
        <span className="loading loading-spinner loading-lg text-primary" />
      </main>
    }>
      <VerifyInner />
    </Suspense>
  );
}