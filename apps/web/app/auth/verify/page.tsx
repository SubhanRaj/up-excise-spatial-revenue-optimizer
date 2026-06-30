'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get('token');
  const [error, setError] = useState<'expired' | 'no_account' | 'missing' | null>(
    token ? null : 'missing',
  );

  useEffect(() => {
    if (!token) return;
    fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json() as Promise<{ redirect?: string; error?: string }>)
      .then((d) => {
        if (d.redirect) {
          // Hard navigation so cookies from the response are applied
          window.location.href = d.redirect;
        } else {
          setError((d.error as typeof error) ?? 'expired');
        }
      })
      .catch(() => setError('expired'));
  }, [token]);

  const messages: Record<NonNullable<typeof error>, string> = {
    expired: 'Sign-in links expire after 15 minutes and can only be used once.',
    no_account: 'Contact your administrator to have your account provisioned.',
    missing: 'No sign-in token found. Please request a new magic link.',
  };

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="card bg-base-100 shadow-xl p-8 w-full max-w-md text-center space-y-4">
          <p className="text-xl font-semibold text-error">Link invalid or expired</p>
          <p className="text-sm text-base-content/60">{messages[error]}</p>
          <a href="/login" className="btn btn-primary">Request a new link</a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="card bg-base-100 shadow-xl p-8 w-full max-w-md text-center space-y-4">
        <span className="loading loading-spinner loading-lg text-primary" />
        <p className="text-base-content/70">Verifying your sign-in link…</p>
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
