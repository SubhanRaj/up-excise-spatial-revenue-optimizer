'use client';

import { usePathname } from 'next/navigation';
import { SignOutButton } from '@clerk/nextjs';
import { ThemeToggle } from '../_components/ThemeToggle';

const ADMIN_CRUMBS: Record<string, string[]> = {
  '/admin': ['Overview'],
  '/admin/provision': ['Overview', 'Provision DEOs'],
  '/admin/audit': ['Overview', 'Audit Log'],
  '/admin/export': ['Overview', 'Export'],
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Dynamic district path: /admin/districts/:district
  const districtMatch = pathname.match(/^\/admin\/districts\/(.+)$/);
  const crumbs: string[] = districtMatch
    ? ['Overview', 'Districts', decodeURIComponent(districtMatch[1]!)]
    : (ADMIN_CRUMBS[pathname] ?? []);

  return (
    <div className="min-h-screen bg-base-200">
      <nav className="navbar bg-base-100 shadow-sm px-6 sticky top-0 z-50">
        <div className="flex-1 flex items-center gap-3">
          {/* tabler:building-government */}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M9 8h1"/><path d="M9 12h1"/><path d="M9 16h1"/><path d="M14 8h1"/><path d="M14 12h1"/><path d="M14 16h1"/><path d="M5 21V6l7-3 7 3v15"/></svg>
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
          <SignOutButton redirectUrl="/login">
            <button className="btn btn-error btn-sm btn-outline ml-1">Sign out</button>
          </SignOutButton>
        </div>
      </nav>
      {crumbs.length > 0 && (
        <div className="bg-base-100 border-b border-base-200 px-6 py-2">
          <div className="text-xs text-base-content/50 flex items-center gap-1.5">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span>›</span>}
                <span className={i === crumbs.length - 1 ? 'text-base-content/80 font-medium' : ''}>{c}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      <main className="container mx-auto px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
