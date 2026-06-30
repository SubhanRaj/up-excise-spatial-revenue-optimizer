'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '../_components/ThemeToggle';

// ── Search ────────────────────────────────────────────────────────────────────

interface SearchItem { label: string; sub: string | undefined; href: string; kind: 'district' | 'division' }

let searchCache: SearchItem[] | null = null;

async function loadSearchItems(): Promise<SearchItem[]> {
  if (searchCache) return searchCache;
  try {
    const res = await fetch('/api/admin/districts');
    if (!res.ok) return [];
    const data = await res.json() as { districts: { name: string; division?: string }[] };
    const districtItems: SearchItem[] = data.districts.map((d) => ({
      label: d.name,
      sub: d.division ?? undefined,
      href: `/admin/districts/${encodeURIComponent(d.name)}`,
      kind: 'district',
    }));
    const divMap = new Map<string, number>();
    data.districts.forEach((d) => { if (d.division) divMap.set(d.division, (divMap.get(d.division) ?? 0) + 1); });
    const divisionItems: SearchItem[] = Array.from(divMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({
      label: name,
      sub: `${count} districts`,
      href: `/admin/divisions/${encodeURIComponent(name)}`,
      kind: 'division',
    }));
    searchCache = [...divisionItems, ...districtItems];
    return searchCache;
  } catch { return []; }
}

function SearchBar() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SearchItem[]>([]);
  const [results, setResults] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { void loadSearchItems().then(setItems); }, []);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) { setResults([]); setOpen(false); return; }
    const filtered = items.filter((it) =>
      it.label.toLowerCase().includes(q) || it.sub?.toLowerCase().includes(q)
    ).slice(0, 10);
    setResults(filtered);
    setOpen(filtered.length > 0);
    setActiveIdx(0);
  }, [query, items]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { if (results[activeIdx]) { window.location.href = results[activeIdx]!.href; setOpen(false); } }
    else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative hidden lg:flex mx-4">
      <label className="input input-sm input-bordered flex items-center gap-2 w-64 cursor-text focus-within:border-primary transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-base-content/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input
          type="text"
          placeholder="Search districts, divisions…"
          className="grow bg-transparent outline-none text-sm min-w-0 placeholder:text-base-content/30"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setOpen(false); }}
            className="shrink-0 text-base-content/30 hover:text-base-content cursor-pointer transition-colors"
            tabIndex={-1}
            aria-label="Clear search"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        )}
      </label>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-base-100 border border-base-200 rounded-xl shadow-2xl z-[60] overflow-hidden min-w-[300px]">
          {results.some((r) => r.kind === 'division') && (
            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest font-medium text-base-content/30">Divisions</div>
          )}
          {results.filter((r) => r.kind === 'division').map((r, i) => {
            const globalIdx = i;
            return (
              <a
                key={r.href}
                href={r.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${activeIdx === globalIdx ? 'bg-base-200' : 'hover:bg-base-50'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.label}</div>
                  {r.sub && <div className="text-xs text-base-content/40">{r.sub}</div>}
                </div>
                <span className="badge badge-xs badge-primary shrink-0">Division</span>
              </a>
            );
          })}
          {results.some((r) => r.kind === 'district') && (
            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest font-medium text-base-content/30 border-t border-base-100">Districts</div>
          )}
          {results.filter((r) => r.kind === 'district').map((r, i) => {
            const globalIdx = results.filter((x) => x.kind === 'division').length + i;
            return (
              <a
                key={r.href}
                href={r.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${activeIdx === globalIdx ? 'bg-base-200' : 'hover:bg-base-50'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-base-content/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M9 8h1"/><path d="M9 12h1"/><path d="M9 16h1"/><path d="M14 8h1"/><path d="M14 12h1"/><path d="M14 16h1"/><path d="M5 21V6l7-3 7 3v15"/></svg>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.label}</div>
                  {r.sub && <div className="text-xs text-base-content/40">{r.sub}</div>}
                </div>
                <span className="badge badge-xs badge-ghost shrink-0">District</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Breadcrumbs ───────────────────────────────────────────────────────────────

function getBreadcrumbs(pathname: string): { label: string; href: string | null }[] {
  const districtMatch = pathname.match(/^\/admin\/districts\/(.+)$/);
  const divisionMatch = pathname.match(/^\/admin\/divisions\/(.+)$/);

  if (districtMatch) return [
    { label: 'Overview', href: '/admin' },
    { label: 'Districts', href: '/admin/districts' },
    { label: decodeURIComponent(districtMatch[1]!), href: null },
  ];

  if (divisionMatch) return [
    { label: 'Overview', href: '/admin' },
    { label: 'Divisions', href: null },
    { label: decodeURIComponent(divisionMatch[1]!), href: null },
  ];

  const MAP: Record<string, { label: string; href: string | null }[]> = {
    '/admin': [{ label: 'Overview', href: null }],
    '/admin/districts': [{ label: 'Overview', href: '/admin' }, { label: 'Districts', href: null }],
    '/admin/divisions': [{ label: 'Overview', href: '/admin' }, { label: 'Divisions', href: null }],
    '/admin/provision': [{ label: 'Overview', href: '/admin' }, { label: 'Provision DEOs', href: null }],
    '/admin/audit': [{ label: 'Overview', href: '/admin' }, { label: 'Audit Log', href: null }],
    '/admin/export': [{ label: 'Overview', href: '/admin' }, { label: 'Export', href: null }],
  };
  return MAP[pathname] ?? [];
}

// ── Layout ────────────────────────────────────────────────────────────────────

async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const crumbs = getBreadcrumbs(pathname);

  return (
    <div className="min-h-screen bg-base-200">
      <nav className="navbar bg-base-100 shadow-sm px-6 sticky top-0 z-50">
        <div className="flex-1 flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M9 8h1"/><path d="M9 12h1"/><path d="M9 16h1"/><path d="M14 8h1"/><path d="M14 12h1"/><path d="M14 16h1"/><path d="M5 21V6l7-3 7 3v15"/></svg>
          <div className="hidden md:block">
            <div className="font-bold text-sm leading-tight">UP Excise SRO</div>
            <div className="text-xs text-base-content/50 leading-tight">Headquarters Dashboard</div>
          </div>
        </div>

        <SearchBar />

        <div className="flex-none gap-1">
          <a href="/admin" className={`btn btn-ghost btn-sm ${pathname === '/admin' ? 'btn-active' : ''}`}>Overview</a>
          <a href="/admin/districts" className={`btn btn-ghost btn-sm ${pathname.startsWith('/admin/districts') ? 'btn-active' : ''}`}>Districts</a>
          <a href="/admin/divisions" className={`btn btn-ghost btn-sm ${pathname.startsWith('/admin/divisions') ? 'btn-active' : ''}`}>Divisions</a>
          <a href="/admin/provision" className={`btn btn-ghost btn-sm ${pathname === '/admin/provision' ? 'btn-active' : ''}`}>Provision</a>
          <a href="/admin/audit" className={`btn btn-ghost btn-sm ${pathname === '/admin/audit' ? 'btn-active' : ''}`}>Audit</a>
          <a href="/admin/export" className={`btn btn-ghost btn-sm ${pathname === '/admin/export' ? 'btn-active' : ''}`}>Export</a>
          <ThemeToggle />
          <button className="btn btn-error btn-sm btn-outline ml-1" onClick={signOut}>Sign out</button>
        </div>
      </nav>

      {crumbs.length > 0 && (
        <div className="bg-base-100 border-b border-base-200 px-6 py-2">
          <nav aria-label="Breadcrumb" className="text-xs text-base-content/50 flex items-center gap-1.5">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>›</span>}
                {c.href
                  ? <a href={c.href} className="hover:text-base-content hover:underline underline-offset-2 transition-colors cursor-pointer">{c.label}</a>
                  : <span className={i === crumbs.length - 1 ? 'text-base-content/80 font-medium' : ''}>{c.label}</span>
                }
              </span>
            ))}
          </nav>
        </div>
      )}

      <main className="admin-content container mx-auto px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
