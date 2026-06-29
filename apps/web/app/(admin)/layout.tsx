'use client';

import { useClerk } from '@clerk/nextjs';
import { ThemeToggle } from '../_components/ThemeToggle';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { signOut } = useClerk();

  return (
    <div className="min-h-screen bg-base-200">
      <nav className="navbar bg-base-100 shadow-sm px-6 sticky top-0 z-50">
        <div className="flex-1 gap-3">
          {/* tabler:building-government */}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M9 8h1"/><path d="M9 12h1"/><path d="M9 16h1"/><path d="M14 8h1"/><path d="M14 12h1"/><path d="M14 16h1"/><path d="M5 21V6l7-3 7 3v15"/></svg>
          <div className="hidden md:block">
            <div className="font-bold text-sm leading-tight">UP Excise Portal</div>
            <div className="text-xs text-base-content/50 leading-tight">Headquarters Dashboard</div>
          </div>
        </div>
        {/* District search — admin only */}
        <div className="flex-none hidden lg:flex mx-4">
          <label className="input input-sm input-bordered flex items-center gap-2 w-56">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 opacity-50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="search" placeholder="Search district…" className="grow bg-transparent outline-none text-sm" id="admin-district-search" />
          </label>
        </div>
        <div className="flex-none gap-1">
          <a href="/admin" className="btn btn-ghost btn-sm">Overview</a>
          <a href="/admin/provision" className="btn btn-ghost btn-sm">Provision</a>
          <a href="/admin/audit" className="btn btn-ghost btn-sm">Audit</a>
          <a href="/admin/export" className="btn btn-ghost btn-sm">Export</a>
          <ThemeToggle />
          <button
            onClick={() => signOut({ redirectUrl: '/login' })}
            className="btn btn-error btn-sm btn-outline ml-1"
          >
            Sign out
          </button>
        </div>
      </nav>
      <main className="container mx-auto px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
