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
  const [fyDataReset, setFyDataReset] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Same manual URL as (deo)/home/page.tsx's DEO_MANUAL_URL — not shared into a constants
  // file for one string; keep both in sync if the manual ever moves.
  const DEO_MANUAL_URL = 'https://raw.githubusercontent.com/SubhanRaj/up-excise-spatial-revenue-optimizer/main/docs/manual/DEO-User-Manual.pdf';

  // Fires once per full page load/refresh (this layout stays mounted across client-side nav
  // between /home, /units, /upload, /verify — only a hard reload or first visit remounts it),
  // not on every navigation. No dismiss-forever flag — a DEO who dismisses it mentally forgets
  // it exists within days, so it must survive being ignored once and reappear next reload.
  // Blocking (allowOutsideClick/allowEscapeKey: false) so a DEO can't click past it without
  // reading it — the only way through is the "I understand" button, which also logs an
  // acknowledgment to D1 (audit_log, event fy_reminder_acknowledged) for accountability. The
  // POST is fire-and-forget: a DEO offline or mid-connectivity-drop still gets to proceed
  // (see CLAUDE.md's "PWA & Offline" — a network hiccup must never block portal use), it just
  // won't have a logged row for this particular showing.
  const fyReminderShown = useRef(false);
  useEffect(() => {
    if (fyReminderShown.current || !session?.districtName) return;
    fyReminderShown.current = true;
    const districtName = session.districtName;
    const Swal = (window as unknown as { Swal?: { fire: (o: unknown) => Promise<unknown> } }).Swal;
    Swal?.fire({
      icon: 'warning',
      title: 'Enter FY 2025-26 data only',
      width: '74rem',
      html: `<div style="text-align:left;font-size:0.92rem;line-height:1.4">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:4px 28px">
          <div>
            <p>All figures in this district's Excel file must be for <b>FY 2025-26</b> (1 April 2025 – 31 March 2026) — the <b>previous</b> financial year, not the current one.</p>
            <p style="margin-top:6px">Every revenue field is in <b>rupees (₹)</b>, except <b>MGQ Quantity</b> on Bhang Shop rows — that one is a quantity (units/kg), not rupees. The portal multiplies it by ₹20/unit to get the revenue figure; do not enter a pre-calculated rupee amount there.</p>
            <p style="margin-top:6px">For a Model Shop, the fixed <b>₹3,00,000 On Premises Consumption Fee</b> is added automatically by the portal to that shop's Total Revenue — it is not a field you fill in. Do not enter it yourself anywhere in the Excel file.</p>
          </div>
          <div style="color:#64748b">
            <p>सभी आंकड़े <b>FY 2025-26</b> (1 अप्रैल 2025 – 31 मार्च 2026), यानी <b>पिछले</b> वित्तीय वर्ष के होने चाहिए, चालू वर्ष के नहीं। हर राजस्व field <b>रुपये (₹)</b> में है, सिवाय Bhang Shop की <b>MGQ Quantity</b> के — वह एक मात्रा (यूनिट/किलोग्राम) है, रुपये नहीं। पोर्टल इसे ₹20 प्रति यूनिट से गुणा करके राजस्व निकालता है; वहां सीधे रुपये की गणना करके न भरें।</p>
            <p style="margin-top:6px">Model Shop के लिए, स्थिर <b>₹3,00,000 On Premises Consumption Fee</b> पोर्टल द्वारा उस दुकान के Total Revenue में अपने-आप जोड़ दिया जाता है — यह कोई ऐसा field नहीं है जिसे आपको भरना है। इसे Excel फ़ाइल में कहीं भी खुद दर्ज न करें।</p>
          </div>
        </div>
        <div style="margin-top:14px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
          <p style="font-weight:600;margin-bottom:4px">The full process for your district:</p>
          <ol style="margin:0;padding-left:20px;column-count:2;column-gap:32px">
            <li style="break-inside:avoid;margin-bottom:4px">Register your <b>Circles &amp; Sectors</b> (one-time, then locked).</li>
            <li style="break-inside:avoid;margin-bottom:4px">Download the district template, get your Inspectors to fill it, consolidate into one file, and <b>Upload</b> it.</li>
            <li style="break-inside:avoid;margin-bottom:4px">On <b>Verify</b>, check every row, then <b>Submit District</b> — you type your name to lock the submission (you are personally responsible for the figures).</li>
            <li style="break-inside:avoid;margin-bottom:4px">Right after submitting, your Verify page shows your district totals once more: re-check them and tap <b>Confirm &amp; Verify</b> (name again). Your district moves to <b>Verified</b> — you do this straight away, no waiting for headquarters or for other districts.</li>
            <li style="break-inside:avoid;margin-bottom:4px">Your <b>Deputy Excise Commissioner</b> then reviews the district — &ldquo;Looks correct&rdquo;, or &ldquo;Flag an issue&rdquo; which can open a correction so you fix the shop(s) and re-verify.</li>
            <li style="break-inside:avoid;margin-bottom:4px">Once every district in the division is verified and signed off, the Deputy <b>locks the division</b>. After that, corrections go through state headquarters.</li>
          </ol>
          <p style="margin-top:6px;color:#64748b">प्रक्रिया: Circles/Sectors पंजीकृत करें → template भरकर Upload करें → Verify पर हर row जांचें और नाम दर्ज करके Submit करें → Submit के तुरंत बाद कुल आंकड़े दोबारा जांचकर Confirm &amp; Verify करें (मुख्यालय या अन्य जिलों की प्रतीक्षा नहीं) → आपके उप आबकारी आयुक्त जिले की समीक्षा करते हैं (सही, या सुधार के लिए flag) → हर जिला verify होने पर वे मंडल lock कर देते हैं, फिर सुधार राज्य मुख्यालय से होते हैं।</p>
        </div>
        <p style="margin-top:12px;text-align:center;font-size:1rem"><a href="${DEO_MANUAL_URL}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;font-weight:600">Open the DEO User Manual (PDF)</a> for the full explanation, with every revenue formula.</p>
      </div>`,
      confirmButtonText: 'I understand',
      allowOutsideClick: false,
      allowEscapeKey: false,
    } as unknown).then(() => {
      fetch(`/api/districts/${encodeURIComponent(districtName)}/ack-fy-reminder`, { method: 'POST' }).catch(() => {});
    });
  }, [session]);

  useEffect(() => {
    fetch('/api/auth/session').then(r => r.ok ? r.json() : {}).then((session: any) => {
      if (session.districtName) {
        fetch(`/api/districts/${encodeURIComponent(session.districtName)}/units`)
          .then(r => r.ok ? r.json() : [])
          .then(units => setHasUnits(units.length > 0));
        fetch(`/api/districts/${encodeURIComponent(session.districtName)}/status`)
          .then(r => r.ok ? r.json() : { districtStatus: 'pending' })
          .then(async (s: { districtStatus: string; fyDataClearedAt: number | null }) => {
            // HQ cleared this district's data (FY-year cleanup or a bad-upload reset) while this
            // device still holds the old rows — a mid-workflow DEO device is never legitimately at
            // 'pending' with 'uploaded' rows staged (submit -> 'submitted', correction unlock ->
            // 'in_progress', both keep the rows). Wipe local staging so the DEO re-enters clean.
            if (s.districtStatus === 'pending') {
              const stale = await stagingDb.getByStatus('uploaded').catch(() => []);
              if (stale.length > 0) await stagingDb.clearAll(session.districtName);
            }
            setSubmitted(s.districtStatus === 'submitted' || s.districtStatus === 'verified');
            setDistrictStatus(s.districtStatus);
            // Cleared for FY-year re-entry and not yet re-submitted — show the re-entry banner.
            // Clears itself once the DEO re-uploads and resubmits (status back to submitted/verified).
            setFyDataReset(s.fyDataClearedAt != null && (s.districtStatus === 'pending' || s.districtStatus === 'in_progress'));
            // As soon as a district is submitted the DEO's nav collapses to Dashboard + Verify
            // (the interactive Confirm & Verify / request-unlock screen), and stays collapsed
            // through 'verified' (where the second link reads "District Data"). M-104 dropped
            // the old state-wide round gate — no waiting for HQ, no waiting for other districts.
            setFinalScreenMode(s.districtStatus === 'submitted' || s.districtStatus === 'verified');
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
          <a href={DEO_MANUAL_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">Manual</a>
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
              <li><a href={DEO_MANUAL_URL} target="_blank" rel="noopener noreferrer" onClick={() => setDrawerOpen(false)}>Manual (PDF)</a></li>
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

      {fyDataReset && (
        <div className="bg-warning/15 border-b border-warning/40 px-3 sm:px-6 py-2.5">
          <p className="text-sm text-base-content/90 max-w-4xl">
            <b>Your district&apos;s shop data was reset for re-entry.</b> Go to <b>Upload</b>, click
            &ldquo;Download District Template&rdquo; for a fresh validated file, and enter <b>FY 2025-26</b> figures.
            If old rows still show on the Verify page, use <b>Clear Staged Data</b> there first.
            <span className="block text-base-content/70 mt-1">
              आपके जिले का दुकान डेटा दोबारा भरने के लिए हटा दिया गया है। <b>Upload</b> पर जाकर &ldquo;Download District
              Template&rdquo; से नई फ़ाइल लें और <b>FY 2025-26</b> के आंकड़े भरें। अगर Verify पेज पर पुरानी पंक्तियाँ दिखें तो
              पहले वहाँ <b>Clear Staged Data</b> दबाएँ।
            </span>
          </p>
        </div>
      )}

      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 md:px-8">
        {children}
      </main>
    </div>
  );
}
