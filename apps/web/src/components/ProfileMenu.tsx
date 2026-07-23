'use client';

import { useEffect, useRef, useState } from 'react';
import type { SessionInfo } from '@/hooks/useSession';

async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

// Desktop-only profile pill + dropdown, modeled on the sibling excise-revenue-recovery-portal
// project's ProfileMenu.tsx — replaces the separate identity block + standalone "Sign out"
// button that used to sit side by side in the desktop nav row.
export default function ProfileMenu({ session }: { session: SessionInfo }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const isDeo = session.role === 'deo';
  const roleLabel = isDeo
    ? 'District Excise Officer'
    : (session.designation ?? (session.role === 'superadmin' ? 'Superadmin' : 'Admin'));
  const pillLabel = isDeo
    ? (session.districtName ? `DEO ${session.districtName}` : 'DEO')
    : roleLabel;

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account details"
        className="flex items-center gap-1.5 rounded-full pl-3 pr-2 py-1.5 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
      >
        <span className="whitespace-nowrap">{pillLabel}</span>
        <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-[1050] mt-2 w-64 space-y-2 rounded-lg border border-base-200 bg-base-100 p-3 text-sm shadow-xl">
          <div className="flex items-center gap-1.5 text-base-content/70">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a12 12 0 0 0 8.5 3A12 12 0 0 1 12 21A12 12 0 0 1 3.5 6A12 12 0 0 0 12 3"/><path d="m9 12 2 2 4-4"/></svg>
            <span className="font-medium">{roleLabel}</span>
          </div>
          {session.districtName && (
            <div className="flex items-center gap-1.5 text-base-content">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 text-base-content/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
              {session.districtName}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-base-content">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 text-base-content/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
            <span className="truncate">{session.name}</span>
          </div>
          <button
            type="button"
            onClick={() => { setOpen(false); void signOut(); }}
            className="flex w-full items-center gap-1.5 rounded-md border-t border-base-200 px-0 pt-2 text-error hover:text-error/80"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
