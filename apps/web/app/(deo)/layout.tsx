'use client';

import { useClerk } from '@clerk/nextjs';
import { ThemeToggle } from '../_components/ThemeToggle';

export default function DeoLayout({ children }: { children: React.ReactNode }) {
  const { signOut } = useClerk();

  return (
    <div className="min-h-screen bg-base-200">
      <nav className="navbar bg-base-100 shadow-sm px-6 sticky top-0 z-50">
        <div className="flex-1 gap-3">
          {/* tabler:shield-check */}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a12 12 0 0 0 8.5 3A12 12 0 0 1 12 21A12 12 0 0 1 3.5 6A12 12 0 0 0 12 3"/><path d="m9 12 2 2 4-4"/></svg>
          <div className="hidden md:block">
            <div className="font-bold text-sm leading-tight">UP Excise Portal</div>
            <div className="text-xs text-base-content/50 leading-tight">Data Entry Officer</div>
          </div>
        </div>
        <div className="flex-none gap-1">
          <a href="/home" className="btn btn-ghost btn-sm">Dashboard</a>
          <a href="/units" className="btn btn-ghost btn-sm">Circles</a>
          <a href="/upload" className="btn btn-ghost btn-sm">Upload</a>
          <a href="/verify" className="btn btn-ghost btn-sm">Verify</a>
          <ThemeToggle />
          <button
            onClick={() => signOut({ redirectUrl: '/login' })}
            className="btn btn-error btn-sm btn-outline ml-1"
          >
            Sign out
          </button>
        </div>
      </nav>
      <main className="container mx-auto px-4 py-8 md:px-8">
        {children}
      </main>
    </div>
  );
}
