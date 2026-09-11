'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/hooks/useSession';
import { deputyBasePath } from '@/lib/deputy';
import ProfileMenu from '@/components/ProfileMenu';

const DEPUTY_MANUAL_URL = 'https://raw.githubusercontent.com/SubhanRaj/up-excise-spatial-revenue-optimizer/main/docs/manual/Deputy-User-Manual.pdf';

async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

export default function DeputyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const base = session?.role === 'deputy' || session?.role === 'superadmin'
    ? deputyBasePath(session.division)
    : '/deputy';

  // The URL should carry the division (/deputy-lucknow). A bare /deputy… or a wrong
  // /deputy-<other> (manual entry, old bookmark) is corrected to this deputy's own base.
  // usePathname() returns the browser URL, which middleware's rewrite leaves untouched, so a
  // correct visit already starts with `base` and skips this.
  useEffect(() => {
    if (!session || session.role !== 'deputy' || base === '/deputy') return;
    if (pathname === base || pathname.startsWith(`${base}/`)) return;
    if (!pathname.startsWith('/deputy')) return;
    const rest = pathname.replace(/^\/deputy(-[a-z-]+)?/, '');
    router.replace(base + rest);
  }, [session, pathname, base, router]);

  // Blocking review-responsibility acknowledgment — the deputy counterpart of the DEO's FY
  // reminder modal. Fires once per full page load (this layout stays mounted across client-side
  // nav), logs deputy_reminder_acknowledged to the audit log on "I understand". Fire-and-forget
  // POST: a network hiccup must never block portal use.
  const ackShown = useRef(false);
  useEffect(() => {
    if (ackShown.current || session?.role !== 'deputy') return;
    ackShown.current = true;
    const Swal = (window as unknown as { Swal?: { fire: (o: unknown) => Promise<unknown> } }).Swal;
    Swal?.fire({
      icon: 'info',
      title: 'Your role in this review round',
      width: '66rem',
      html: `<div style="text-align:left;font-size:0.92rem;line-height:1.45">
        <p>The figures in your division are for <b>FY 2025-26</b> (the previous financial year) and must reflect <b>actual lifting (उठान)</b> — what was actually lifted/consumed — not a fixed licence amount or a standard assumed figure. How the round works, end to end:</p>
        <ol style="margin:6px 0 0;padding-left:20px;column-count:2;column-gap:32px">
          <li style="break-inside:avoid;margin-bottom:4px">Each <b>DEO</b> registers their Circles &amp; Sectors, uploads the district Excel file, checks it on Verify, and <b>submits</b> it (typing their name).</li>
          <li style="break-inside:avoid;margin-bottom:4px">Right after submitting, each DEO re-checks their totals and <b>Confirms &amp; Verifies</b> their own district — the district moves to <b>Verified</b>. There is no state-wide round to wait for.</li>
          <li style="break-inside:avoid;margin-bottom:4px"><b>You</b> open each Verified district, check its shop-level figures, and record <b>&ldquo;Looks correct&rdquo;</b> or <b>&ldquo;Flag an issue&rdquo;</b> (a note is required to flag). A flag can send it back to the DEO for a correction and re-verify.</li>
          <li style="break-inside:avoid;margin-bottom:4px">Once <b>every district</b> in your division is Verified and you have signed off &ldquo;Looks correct&rdquo; on each, use <b>&ldquo;Verify &amp; Lock Division&rdquo;</b> on the dashboard and type your name. After that, only state headquarters can reopen the division.</li>
          <li style="break-inside:avoid;margin-bottom:4px">When all 18 divisions are locked, the state's data collection is closed.</li>
        </ol>
        <p style="margin-top:6px;color:#64748b">आपके मंडल के आंकड़े <b>FY 2025-26</b> की <b>वास्तविक उठान (actual lifting)</b> पर आधारित होने चाहिए, न कि किसी निर्धारित license राशि या मानक अनुमानित आंकड़े पर। DEO अपने जिले का डेटा upload कर submit करते हैं → Submit के तुरंत बाद हर DEO कुल आंकड़े जांचकर अपने जिले को Confirm &amp; Verify करता है (कोई राज्य-स्तरीय दौर नहीं) → आप हर Verified जिला खोलकर &ldquo;Looks correct&rdquo; या &ldquo;Flag an issue&rdquo; दर्ज करते हैं → जब हर जिला Verified हो और आपने हर एक पर हस्ताक्षर कर दिया हो, dashboard से नाम दर्ज करके &ldquo;Verify &amp; Lock Division&rdquo; करें → इसके बाद केवल राज्य मुख्यालय ही मंडल दोबारा खोल सकता है।</p>
        <p style="margin-top:12px;text-align:center"><a href="${DEPUTY_MANUAL_URL}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;font-weight:600">Open the Deputy User Manual (PDF)</a></p>
      </div>`,
      confirmButtonText: 'I understand',
      allowOutsideClick: false,
      allowEscapeKey: false,
    }).then(() => {
      fetch('/api/deputy/ack-reminder', { method: 'POST' }).catch(() => {});
    });
  }, [session]);

  const onDistricts = pathname.startsWith(`${base}/districts`) || pathname.startsWith('/deputy/districts');
  const navLinks = [
    { href: base, label: 'Dashboard', active: !onDistricts },
    { href: `${base}/districts`, label: 'Districts', active: onDistricts },
  ];

  const districtMatch = pathname.match(/\/districts\/([^/]+)$/);
  const crumbs: { label: string; href: string | null }[] = districtMatch
    ? [{ label: 'Dashboard', href: base }, { label: 'Districts', href: `${base}/districts` }, { label: decodeURIComponent(districtMatch[1]!), href: null }]
    : onDistricts
      ? [{ label: 'Dashboard', href: base }, { label: 'Districts', href: null }]
      : [{ label: 'Dashboard', href: null }];

  return (
    <div className="min-h-screen bg-base-200">
      {/* z-[1000] — must exceed Leaflet tooltip pane (z-index 650) */}
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
          <Link href={base} className="flex items-center gap-3 group">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-9 h-9 sm:w-10 sm:h-10 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M9 8h1"/><path d="M9 12h1"/><path d="M9 16h1"/><path d="M14 8h1"/><path d="M14 12h1"/><path d="M14 16h1"/><path d="M5 21V6l7-3 7 3v15"/></svg>
            <div className="hidden sm:block">
              <div className="font-bold text-sm leading-tight group-hover:text-primary transition-colors">UP Excise SRO</div>
              <div className="text-xs text-base-content/70 leading-tight">
                Deputy Excise Commissioner{session?.division ? ` · ${session.division} Division` : ''}
              </div>
            </div>
          </Link>
        </div>

        <div className="hidden md:flex flex-none items-center gap-1">
          {navLinks.map((l) => (
            <Link key={l.label} href={l.href} className={`btn btn-ghost btn-sm ${l.active ? 'btn-active' : ''}`}>{l.label}</Link>
          ))}
          <a href={DEPUTY_MANUAL_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">Manual</a>
          {session && <ProfileMenu session={session} />}
        </div>

        <div className="flex md:hidden flex-none items-center gap-1">
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
            {session && (
              <div className="leading-tight border-t border-base-200 pt-3">
                <p className="text-sm font-semibold text-base-content">{session.name}</p>
                <p className="text-xs text-base-content/60">{session.division ? `${session.division} Division` : 'Deputy Excise Commissioner'}</p>
              </div>
            )}
            <ul className="menu menu-sm p-0 gap-1 border-t border-base-200 pt-3">
              {navLinks.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} onClick={() => setDrawerOpen(false)} className={l.active ? 'active' : ''}>{l.label}</Link>
                </li>
              ))}
              <li><a href={DEPUTY_MANUAL_URL} target="_blank" rel="noopener noreferrer" onClick={() => setDrawerOpen(false)}>Manual (PDF)</a></li>
            </ul>
          </div>
        </>
      )}

      {crumbs.length > 0 && (
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
      )}

      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 md:px-8">{children}</main>
    </div>
  );
}
