'use client';

import { SignIn } from '@clerk/nextjs';

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="card bg-base-100 shadow-xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6">UP Excise Portal</h1>
        <p className="text-sm text-center text-base-content/70 mb-6">
          Department of Excise, Government of Uttar Pradesh
        </p>
        <SignIn
          routing="hash"
          fallbackRedirectUrl="/"
          appearance={{
            elements: {
              rootBox: 'w-full',
              card: 'shadow-none p-0',
            },
          }}
        />
      </div>
    </main>
  );
}
