'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/hooks/useSession';

async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

export default function DeputyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session } = useSession();

  const districtMatch = pathname.match(/^\/deputy\/districts\/(.+)$/);
  const crumbs: { label: string; href: string | null }[] = districtMatch
    ? [{ label: 'Dashboard', href: '/deputy' }, { label: decodeURIComponent(districtMatch[1]!), href: null }]
    : [{ label: 'Dashboard', href: null }];

  return (
    <div className="min-h-screen bg-base-200">
      {/* z-[1000] — must exceed Leaflet tooltip pane (z-index 650) */}
      <nav className="navbar bg-base-100 shadow-sm px-3 sm:px-6 sticky top-0 z-[1000]">
        <div className="flex-1 flex items-center gap-3">
          <Link href="/deputy" className="flex items-center gap-3 group">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-9 h-9 sm:w-10 sm:h-10 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M9 8h1"/><path d="M9 12h1"/><path d="M9 16h1"/><path d="M14 8h1"/><path d="M14 12h1"/><path d="M14 16h1"/><path d="M5 21V6l7-3 7 3v15"/></svg>
            <div className="hidden sm:block">
              <div className="font-bold text-sm leading-tight group-hover:text-primary transition-colors">UP Excise SRO</div>
              <div className="text-xs text-base-content/70 leading-tight">
                Deputy Commissioner{session?.division ? ` · ${session.division} Division` : ''}
              </div>
            </div>
          </Link>
        </div>

        <div className="flex-none flex items-center gap-1">
          <Link href="/deputy" className={`btn btn-ghost btn-sm ${pathname === '/deputy' ? 'btn-active' : ''}`}>Dashboard</Link>
          {session && (
            <span className="hidden sm:inline text-xs font-semibold bg-primary/10 text-primary rounded-full px-3 py-1.5 whitespace-nowrap">
              {session.name}
            </span>
          )}
          <button className="btn btn-ghost btn-sm btn-square" onClick={signOut} aria-label="Sign out">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
          </button>
        </div>
      </nav>

      <div className="bg-base-100 border-b border-base-200 px-3 sm:px-6 py-2 overflow-x-auto">
        <nav aria-label="Breadcrumb" className="text-xs text-base-content/70 flex items-center gap-1.5 whitespace-nowrap">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden>›</span>}
              {c.href
                ? <Link href={c.href} className="hover:text-base-content hover:underline underline-offset-2 transition-colors">{c.label}</Link>
                : <span className={i === crumbs.length - 1 ? 'text-base-content font-medium' : ''}>{c.label}</span>}
            </span>
          ))}
        </nav>
      </div>

      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 md:px-8">{children}</main>
    </div>
  );
}
