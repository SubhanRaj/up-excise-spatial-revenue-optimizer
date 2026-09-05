'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useSession } from '@/hooks/useSession';
import { stagingDb } from '@/lib/db';
import ProfileMenu from '@/components/ProfileMenu';

async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

export default function DeoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session } = useSession();

  const crumbMap: Record<string, string> = {
    '/home': 'Dashboard',
    '/units': 'Circles & Sectors',
    '/upload': 'Upload',
    '/verify': 'Verify & Submit',
  };
  const crumb = crumbMap[pathname] ?? '';

  // Defaults closed — Upload/Verify must not flash into view before the units check resolves.
  const [hasUnits, setHasUnits] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [districtStatus, setDistrictStatus] = useState('pending');
  const [finalScreenMode, setFinalScreenMode] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fires once per full page load/refresh (this layout stays mounted across client-side nav
  // between /home, /units, /upload, /verify — only a hard reload or first visit remounts it),
  // not on every navigation. No dismiss-forever flag — a DEO who dismisses it mentally forgets
  // it exists within days, so it must survive being ignored once and reappear next reload.
  const fyReminderShown = useRef(false);
  useEffect(() => {
    if (fyReminderShown.current || !session?.districtName) return;
    fyReminderShown.current = true;
    const Swal = (window as unknown as { Swal?: { fire: (o: unknown) => void } }).Swal;
    Swal?.fire({
      icon: 'warning',
      title: 'Enter FY 2025-26 data only',
      html: `<div style="text-align:left">
        <p>All figures in this district's Excel file must be for <b>FY 2025-26</b> (1 April 2025 – 31 March 2026) — the <b>previous</b> financial year, not the current one.</p>
        <p style="margin-top:8px">Every revenue field is in <b>rupees (₹)</b>, except <b>MGQ Quantity</b> on Bhang Shop rows — that one is a quantity (units/kg), not rupees. The portal multiplies it by ₹20/unit to get the revenue figure; do not enter a pre-calculated rupee amount there.</p>
        <p style="margin-top:10px;color:#64748b">सभी आंकड़े <b>FY 2025-26</b> (1 अप्रैल 2025 – 31 मार्च 2026), यानी <b>पिछले</b> वित्तीय वर्ष के होने चाहिए, चालू वर्ष के नहीं। हर राजस्व field <b>रुपये (₹)</b> में है, सिवाय Bhang Shop की <b>MGQ Quantity</b> के — वह एक मात्रा (यूनिट/किलोग्राम) है, रुपये नहीं। पोर्टल इसे ₹20 प्रति यूनिट से गुणा करके राजस्व निकालता है; वहां सीधे रुपये की गणना करके न भरें।</p>
      </div>`,
      confirmButtonText: 'Understood',
    } as unknown);
  }, [session]);

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.ok ? r.json() : {}).then((session: any) => {
      if (session.districtName) {
        fetch(`/api/districts/${encodeURIComponent(session.districtName)}/units`)
          .then(r => r.ok ? r.json() : [])
          .then(units => setHasUnits(units.length > 0));
        fetch(`/api/districts/${encodeURIComponent(session.districtName)}/status`)
          .then(r => r.ok ? r.json() : { districtStatus: 'pending', verificationPhaseOpen: false })
          .then((s: { districtStatus: string; verificationPhaseOpen: boolean }) => {
            setSubmitted(s.districtStatus === 'submitted' || s.districtStatus === 'verified');
            setDistrictStatus(s.districtStatus);
            // Once verified, the DEO sees only Dashboard + District Data — this holds even if
            // the admin later closes the state-wide round, since verification is final per
            // district, not tied to the round staying open. While merely 'submitted', the
            // reduced nav only applies for the duration of an open round (the interactive
            // confirm/unlock screen at /verify).
            setFinalScreenMode(s.districtStatus === 'verified' || (s.verificationPhaseOpen && s.districtStatus === 'submitted'));
          });
      }
    });
    stagingDb.getByStatus('uploaded').then((rows) => setUploadedCount(rows.length)).catch(() => setUploadedCount(0));
  }, [pathname]);

  const navLinks = finalScreenMode
    ? [
        { href: '/home', label: 'Dashboard' },
        { href: '/verify', label: districtStatus === 'verified' ? 'District Data' : 'Verify' },
      ]
    : [
        { href: '/home', label: 'Dashboard' },
        { href: '/units', label: 'Circles' },
        // /upload stays reachable even once submitted — it shows its own locked view with the
        // data-correction unlock request. /verify's staged-review workflow (Clear Staged Data,
        // Submit District) no longer makes sense once submitted, so it drops from the nav —
        // the read-only Uploaded Data link (below) is the only "verify" surface left.
        ...(hasUnits ? [{ href: '/upload', label: 'Upload' }] : []),
        // Direct shortcut to the uploaded-data view (same destination as the Home dashboard's
        // "Shops Uploaded" stat card) — only once locked units exist and something has actually
        // been uploaded, so it never appears as a dead link.
        ...(hasUnits && uploadedCount > 0 ? [{ href: '/verify?view=uploaded', label: 'Uploaded Data' }] : []),
        // Verify is last — it's the final step in the flow (submit to headquarters), so it
        // reads left-to-right as Circles → Upload → Uploaded Data → Verify.
        ...(hasUnits && !submitted ? [{ href: '/verify', label: 'Verify' }] : []),
      ];

  return (
    <div className="min-h-screen bg-base-200">
      {/* z-[1000] — above Leaflet tooltip pane (650) */}
      <nav className="navbar bg-base-100 shadow-sm px-3 sm:px-6 sticky top-0 z-[1000]">
        <div className="flex-1 flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square md:hidden"
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <Link href="/home" className="flex items-center gap-3 group">
            {/* tabler:shield-check */}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-9 h-9 sm:w-10 sm:h-10 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a12 12 0 0 0 8.5 3A12 12 0 0 1 12 21A12 12 0 0 1 3.5 6A12 12 0 0 0 12 3"/><path d="m9 12 2 2 4-4"/></svg>
            <div className="hidden md:block">
              <div className="font-bold text-sm leading-tight group-hover:text-primary transition-colors">UP Excise SRO</div>
              <div className="text-xs text-base-content/70 leading-tight">District Excise Officer / जिला आबकारी अधिकारी</div>
            </div>
          </Link>
        </div>
        <div className="hidden md:flex flex-none items-center flex-wrap justify-end gap-1">
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} className={`btn btn-ghost btn-sm ${pathname === l.href ? 'btn-active' : ''}`}>{l.label}</Link>
          ))}
          {session && <ProfileMenu session={session} />}
        </div>
        <div className="flex md:hidden flex-none">
          <button className="btn btn-ghost btn-sm btn-square" onClick={signOut} aria-label="Sign out">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
          </button>
        </div>
      </nav>

      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-[1100] bg-black/40 md:hidden" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div className="fixed inset-y-0 left-0 z-[1101] w-72 max-w-[85vw] bg-base-100 shadow-xl p-4 flex flex-col gap-4 overflow-y-auto md:hidden">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">Menu</span>
              <button className="btn btn-ghost btn-sm btn-square" onClick={() => setDrawerOpen(false)} aria-label="Close navigation menu">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <ul className="menu menu-sm p-0 gap-1">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} onClick={() => setDrawerOpen(false)} className={pathname === l.href ? 'active' : ''}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {crumb && (
        <div className="bg-base-100 border-b border-base-200 px-3 sm:px-6 py-2">
          <div className="text-xs text-base-content/70 flex items-center gap-1.5">
            <Link href="/home" className="hover:text-base-content hover:underline underline-offset-2 transition-colors">UP Excise DEO Portal</Link>
            <span>›</span>
            <span className="text-base-content font-medium">{crumb}</span>
          </div>
        </div>
      )}

      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 md:px-8">
        {children}
      </main>
    </div>
  );
}
