'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

export default function DeoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const crumbMap: Record<string, string> = {
    '/home': 'Dashboard',
    '/units': 'Circles & Sectors',
    '/upload': 'Upload',
    '/verify': 'Verify & Submit',
  };
  const crumb = crumbMap[pathname] ?? '';

  const [hasUnits, setHasUnits] = useState(true);

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.ok ? r.json() : {}).then((session: any) => {
      if (session.districtName) {
        fetch(`/api/districts/${encodeURIComponent(session.districtName)}/units`)
          .then(r => r.ok ? r.json() : [])
          .then(units => setHasUnits(units.length > 0));
      }
    });
  }, [pathname]);

  return (
    <div className="min-h-screen bg-base-200">
      {/* z-[1000] — above Leaflet tooltip pane (650) */}
      <nav className="navbar bg-base-100 shadow-sm px-6 sticky top-0 z-[1000]">
        <div className="flex-1 flex items-center gap-3">
          <Link href="/home" className="flex items-center gap-3 group">
            {/* tabler:shield-check */}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a12 12 0 0 0 8.5 3A12 12 0 0 1 12 21A12 12 0 0 1 3.5 6A12 12 0 0 0 12 3"/><path d="m9 12 2 2 4-4"/></svg>
            <div className="hidden md:block">
              <div className="font-bold text-sm leading-tight group-hover:text-primary transition-colors">UP Excise SRO</div>
              <div className="text-xs text-base-content/70 leading-tight">District Excise Officer / जिला आबकारी अधिकारी</div>
            </div>
          </Link>
        </div>
        <div className="flex-none gap-1">
          <Link href="/home" className={`btn btn-ghost btn-sm ${pathname === '/home' ? 'btn-active' : ''}`}>Dashboard</Link>
          <Link href="/units" className={`btn btn-ghost btn-sm ${pathname === '/units' ? 'btn-active' : ''}`}>Circles</Link>

          {hasUnits && (
            <>
              <Link href="/upload" className={`btn btn-ghost btn-sm ${pathname === '/upload' ? 'btn-active' : ''}`}>Upload</Link>
              <Link href="/verify" className={`btn btn-ghost btn-sm ${pathname === '/verify' ? 'btn-active' : ''}`}>Verify</Link>
            </>
          )}

          <Link href="/admin" className="btn btn-outline btn-secondary btn-sm ml-1">HQ Admin</Link>
          <button className="btn btn-ghost btn-sm ml-1" onClick={signOut}>Sign out</button>
        </div>
      </nav>

      {crumb && (
        <div className="bg-base-100 border-b border-base-200 px-6 py-2">
          <div className="text-xs text-base-content/70 flex items-center gap-1.5">
            <Link href="/home" className="hover:text-base-content hover:underline underline-offset-2 transition-colors">UP Excise DEO Portal</Link>
            <span>›</span>
            <span className="text-base-content font-medium">{crumb}</span>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-8 md:px-8">
        {children}
      </main>
    </div>
  );
}
