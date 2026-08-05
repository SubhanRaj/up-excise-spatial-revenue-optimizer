'use client';

import { memo, use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import HelpPanel from '@/app/_components/HelpPanel';
import { adminShopsCache, adminUnlockRequestsCache } from '@/lib/db';
import { useSession } from '@/hooks/useSession';
import { EditDistrictDrawer } from '@/app/_components/EditDistrictDrawer';
import { RevenueCell } from '@/components/RevenueCell';
import { statusLabel, statusBadgeClass } from '@/lib/status';

interface ShopRow {
  id: number;
  shopId: string;
  shopName: string;
  circleSectorName: string;
  thanaName: string;
  adjacentThanasRaw: string | null;
  shopType: string;
  hasCl5cc: boolean;
  latitudeDecimal: number | null;
  longitudeDecimal: number | null;
  licenseFeeLf: number;
  basicLicenseFeeBlf: number;
  mgrAmount: number;
  compositeLfFl: number;
  compositeLfBeer: number;
  compositeMgrFl: number;
  compositeMgrBeer: number;
  mgqQuantity: number;
  considerationFee: number;
  specialBeerLf: number;
  specialBeerMgr: number;
  totalRevenue: number;
  uploadedByDeo: string;
}

interface UnlockRequestRow {
  id: number;
  districtName: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  requestType: 'units' | 'data_correction';
  requestedByDeo: string;
}

interface DistrictDetail {
  name: string; division: string | null; deoName: string | null; deoEmail: string | null;
  deoId: string | null; expectedVendCount: number | null; status: string;
  bboxMinLat: number | null; bboxMaxLat: number | null; bboxMinLon: number | null; bboxMaxLon: number | null;
  vendCount: number; totalRevenue: number; units: { name: string; type: string }[];
}

const SHOP_TYPES = ['MODEL_SHOP', 'COMPOSITE_SHOP', 'PRV', 'BHANG_SHOP', 'COUNTRY_LIQUOR', 'HBR'] as const;

const TYPE_LABEL: Record<string, string> = {
  MODEL_SHOP: 'Model Shop',
  COMPOSITE_SHOP: 'Composite Shop (FL + Beer)',
  PRV: 'PRV (Premium Retail Vend)',
  BHANG_SHOP: 'Bhang Shop',
  COUNTRY_LIQUOR: 'Country Liquor',
  HBR: 'Hotel / Bar / Restaurants',
};

// Short form for tight spaces (circle/sector breakdown badges) — HBR stays verbatim, never
// truncated from TYPE_LABEL's spelled-out prose form (CLAUDE.md: "HBR is shown verbatim
// everywhere... never spelled out").
const TYPE_SHORT_LABEL: Record<string, string> = {
  MODEL_SHOP: 'Model',
  COMPOSITE_SHOP: 'Composite',
  PRV: 'PRV',
  BHANG_SHOP: 'Bhang',
  COUNTRY_LIQUOR: 'Country Liquor',
  HBR: 'HBR',
};

// Distinct, non-purple palette using DaisyUI semantic classes
const TYPE_BADGE: Record<string, string> = {
  MODEL_SHOP: 'badge-info',
  COMPOSITE_SHOP: 'badge-accent',
  PRV: 'badge-success',
  BHANG_SHOP: 'badge-warning',
  COUNTRY_LIQUOR: 'badge-neutral',
  HBR: 'badge-secondary',
};

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const fmtCr = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;

type SortKey = 'shopId' | 'shopName' | 'thanaName' | 'totalRevenue' | 'shopType';

// ── Sub-components ─────────────────────────────────────────────────────────────

function AdjThanas({ raw }: { raw: string | null }) {
  if (!raw) return <span className="text-base-content/50">—</span>;
  const thanas = raw.split(',').map((t) => t.trim()).filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1 min-w-[140px]">
      {thanas.map((t) => (
        <span key={t} className="badge badge-xs badge-ghost font-normal">{t}</span>
      ))}
    </div>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="text-base-content/40 ml-1">⇅</span>;
  return <span className="text-info ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

function TypeBadge({ type, cl5cc }: { type: string; cl5cc: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 items-start">
      <span className={`badge badge-sm h-auto py-1 px-2 font-medium text-center ${TYPE_BADGE[type] ?? 'badge-ghost'}`}>
        {TYPE_LABEL[type] ?? type}
      </span>
      {cl5cc && <span className="badge badge-xs badge-outline text-[10px]">CL5CC</span>}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, href, onClick }: { label: string; value: string; sub?: string; href?: string; onClick?: () => void }) {
  const inner = (
    <>
      <p className="text-[11px] uppercase tracking-widest font-medium text-base-content/60">{label}</p>
      {href
        ? <Link href={href} className="block text-xl font-bold text-primary tabular-nums hover:underline underline-offset-2">{value}</Link>
        : <p className={`text-xl font-bold tabular-nums ${onClick ? 'text-primary' : 'text-base-content'}`}>{value}</p>}
      {sub && <p className="text-xs text-base-content/70">{sub}</p>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="bg-base-100 rounded-xl border border-base-200 p-4 space-y-1 text-left cursor-pointer hover:border-primary/50 hover:shadow-md transition-all">
        {inner}
      </button>
    );
  }
  return <div className="bg-base-100 rounded-xl border border-base-200 p-4 space-y-1">{inner}</div>;
}

function splitUnitName(name: string): { label: string; area: string } {
  const idx = name.indexOf(' - ');
  return idx === -1 ? { label: name, area: '' } : { label: name.slice(0, idx), area: name.slice(idx + 3) };
}

function UnitsModal({ units, districtName, onClose }: { units: { name: string; type: string }[]; districtName: string; onClose: () => void }) {
  const sectors = units.filter((u) => u.type === 'sector');
  const circles = units.filter((u) => u.type === 'circle');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-[fadeIn_0.15s_ease-out]" onClick={onClose}>
      <div
        className="bg-base-100 rounded-2xl border border-base-200 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-[modalIn_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-primary/10 to-transparent border-b border-base-200">
          <div>
            <h3 className="font-bold text-base">{districtName}</h3>
            <p className="text-xs text-base-content/60">{units.length} unit{units.length === 1 ? '' : 's'} registered · {sectors.length} sector{sectors.length === 1 ? '' : 's'} · {circles.length} circle{circles.length === 1 ? '' : 's'}</p>
          </div>
          <button className="btn btn-sm btn-ghost btn-circle" onClick={onClose} aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="overflow-y-auto p-5 space-y-6">
          {units.length === 0 && (
            <p className="text-sm text-base-content/60 text-center py-8">No circles or sectors registered yet.</p>
          )}
          {sectors.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-widest font-semibold text-secondary mb-2.5">Sectors</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {sectors.map((u) => (
                  // Sectors carry no area name — "Sector - N" is the whole unit label
                  // (splitUnitName's dash-split is circle-only, see the Circles block below).
                  <div key={u.name} className="flex items-center gap-2.5 rounded-lg border border-base-200 bg-base-200/40 px-3 py-2">
                    <span className="badge badge-secondary badge-sm h-auto py-1 px-2 shrink-0 whitespace-nowrap font-semibold">{u.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {circles.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-widest font-semibold text-accent mb-2.5">Circles</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {circles.map((u) => {
                  const { label, area } = splitUnitName(u.name);
                  return (
                    <div key={u.name} className="flex items-center gap-2.5 rounded-lg border border-base-200 bg-base-200/40 px-3 py-2">
                      <span className="badge badge-accent badge-sm h-auto py-1 px-2 shrink-0 whitespace-nowrap font-semibold">{label}</span>
                      <span className="text-sm truncate">{area || '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page size selector ─────────────────────────────────────────────────────────

type PageSizeVal = 10 | 25 | 50 | 100 | 'all';
const PAGE_SIZES: PageSizeVal[] = [10, 25, 50, 100, 'all'];

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DistrictDetailPage({ params }: { params: Promise<{ district: string }> }) {
  const { district } = use(params);
  const name = decodeURIComponent(district);
  const { session } = useSession();

  const [detail, setDetail] = useState<DistrictDetail | null>(null);
  const [allShops, setAllShops] = useState<ShopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingUnlockRequest, setPendingUnlockRequest] = useState<UnlockRequestRow | null>(null);
  const [showUnitsModal, setShowUnitsModal] = useState(false);
  const [showCircleStats, setShowCircleStats] = useState(true);
  const [editing, setEditing] = useState(false);

  // Toolbar state
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [cl5ccFilter, setCl5ccFilter] = useState(false);
  const [circleFilter, setCircleFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('shopId');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [groupByType, setGroupByType] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('admin-group-by-type') === 'true';
  });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem(`admin-group-${name}`);
      if (stored) return new Set(JSON.parse(stored) as string[]);
    } catch { }
    return new Set(); // default: all collapsed
  });
  const [groupPages, setGroupPages] = useState<Record<string, number>>({});
  const [pageSize, setPageSize] = useState<PageSizeVal>(() => {
    if (typeof window === 'undefined') return 100;
    const s = localStorage.getItem('admin-page-size');
    return ([10, 25, 50, 100, 'all'] as PageSizeVal[]).includes(s as PageSizeVal) ? (s as PageSizeVal) : 100;
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const cached = await adminShopsCache.get(name);
      if (cached) {
        const { d, s } = cached as { d: DistrictDetail, s: { rows: ShopRow[] } };
        setDetail(d);
        setAllShops(s.rows);
        setLoading(false);
        return;
      }
      const [d, s] = await Promise.all([
        fetch(`/api/admin/districts/${encodeURIComponent(name)}`).then((r) => r.json()),
        fetch(`/api/admin/districts/${encodeURIComponent(name)}/shops?pageSize=all`).then((r) => r.json()),
      ]);
      adminShopsCache.set(name, { d, s });
      setDetail(d as DistrictDetail);
      setAllShops((s as { rows: ShopRow[] }).rows);
      setLoading(false);
    }
    void load();
  }, [name]);

  // The unlock button only ever appears for a district with an actual pending unlock request
  // from its DEO — there is no "unlock on a whim" path. See POST /api/admin/unlock-requests/resolve.
  useEffect(() => {
    async function loadPendingRequest() {
      const cached = await adminUnlockRequestsCache.get();
      let rows: UnlockRequestRow[] | null = (cached as { rows: UnlockRequestRow[] } | null)?.rows ?? null;
      if (!rows) {
        const data = await fetch('/api/admin/unlock-requests').then((r) => r.json()) as { rows: UnlockRequestRow[] };
        rows = data.rows;
        adminUnlockRequestsCache.set({ rows });
      }
      setPendingUnlockRequest(rows.find((r) => r.districtName === name && r.status === 'pending') ?? null);
    }
    void loadPendingRequest();
  }, [name]);

  const [unlocking, setUnlocking] = useState(false);

  async function unlockUnits() {
    const request = pendingUnlockRequest;
    if (!request) return;

    const isCorrection = request.requestType === 'data_correction';
    const SwalG = (window as unknown as { Swal?: { fire: (o: Record<string, unknown>) => Promise<{ isConfirmed: boolean; value?: string }> } }).Swal;
    const confirm = await SwalG?.fire({
      icon: 'warning',
      title: isCorrection ? 'Approve data-correction unlock?' : 'Approve unlock request?',
      html: isCorrection
        ? `<p>The DEO requested: <em>"${request.reason.replace(/</g, '&lt;')}"</em></p>
           <p style="margin-top:8px">Approving lets the DEO re-upload a corrected Excel file for <b>${name}</b> — it does <b>not</b> delete any submitted shop data or circles/sectors. Re-uploading only updates the shop(s) whose data changed; the district returns to "submitted" once they resubmit.</p>`
        : `<p>The DEO requested: <em>"${request.reason.replace(/</g, '&lt;')}"</em></p>
           <p style="margin-top:8px">Approving deletes all <b>${detail?.units.length ?? 0} circle/sector</b> entries for <b>${name}</b> and lets the DEO re-register them from scratch. This does not affect any already-uploaded shop data.</p>`,
      input: 'textarea',
      inputPlaceholder: 'Your note (required)',
      showCancelButton: true,
      confirmButtonText: isCorrection ? 'Approve & Allow Re-upload' : 'Approve & Unlock',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#1d4ed8',
      inputValidator: (value: string) => (value && value.trim() ? undefined : 'Please enter a note.'),
    });
    if (!confirm?.isConfirmed) return;
    const note = String(confirm.value ?? '').trim();

    setUnlocking(true);
    try {
      const res = await fetch('/api/admin/unlock-requests/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: request.id, action: 'approve', note }),
      });
      if (!res.ok) {
        await SwalG?.fire({ icon: 'error', title: 'Could not unlock', text: 'Please try again.' });
        return;
      }
      adminUnlockRequestsCache.invalidate();
      setPendingUnlockRequest(null);
      await refreshShops();
      void SwalG?.fire({
        toast: true, position: 'top-end', icon: 'success',
        title: isCorrection ? 'District re-opened for correction.' : 'Circles & sectors unlocked.',
        showConfirmButton: false, timer: 3000, timerProgressBar: true,
      });
    } finally {
      setUnlocking(false);
    }
  }

  async function refreshShops() {
    setLoading(true);
    const [d, s] = await Promise.all([
      fetch(`/api/admin/districts/${encodeURIComponent(name)}`).then((r) => r.json()),
      fetch(`/api/admin/districts/${encodeURIComponent(name)}/shops?pageSize=all`).then((r) => r.json()),
    ]);
    adminShopsCache.set(name, { d, s });
    setDetail(d as DistrictDetail);
    setAllShops((s as { rows: ShopRow[] }).rows);
    setLoading(false);
  }

  // ── Client-side derived data ──────────────────────────────────────────────

  const filteredSorted = useMemo(() => {
    const q = search.toLowerCase();
    let rows = allShops.filter((s) => {
      if (typeFilter !== 'all' && s.shopType !== typeFilter) return false;
      if (q && !s.shopId.toLowerCase().includes(q) && !s.shopName.toLowerCase().includes(q) && !s.thanaName.toLowerCase().includes(q)) return false;
      if (cl5ccFilter && !s.hasCl5cc) return false;
      if (circleFilter !== 'all' && s.circleSectorName !== circleFilter) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [allShops, search, typeFilter, cl5ccFilter, circleFilter, sortKey, sortDir]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, { count: number; revenue: number }> = {};
    for (const s of allShops) {
      if (!counts[s.shopType]) counts[s.shopType] = { count: 0, revenue: 0 };
      const entry = counts[s.shopType]!;
      entry.count++;
      entry.revenue += s.totalRevenue;
    }
    return counts;
  }, [allShops]);

  const cl5ccCount = useMemo(() => allShops.filter((s) => s.hasCl5cc).length, [allShops]);

  const circles = useMemo(
    () => Array.from(new Set(allShops.map((s) => s.circleSectorName).filter(Boolean))).sort(),
    [allShops],
  );

  // Seeded from detail.units first (the authoritative district_circles_sectors rows) so a
  // registered-but-empty unit still shows up with a real 0-shop row — a useful signal that a
  // DEO registered a circle/sector but never uploaded anything for it. Any shop whose
  // circleSectorName doesn't match a registered unit (shouldn't happen given the upload
  // template's dropdown gate, but not database-enforced) still gets its own row.
  const circleStats = useMemo(() => {
    const map = new Map<string, { name: string; type: string; thanas: Set<string>; count: number; revenue: number; byType: Record<string, number> }>();
    for (const u of detail?.units ?? []) {
      map.set(u.name, { name: u.name, type: u.type, thanas: new Set(), count: 0, revenue: 0, byType: {} });
    }
    for (const s of allShops) {
      let entry = map.get(s.circleSectorName);
      if (!entry) {
        entry = { name: s.circleSectorName, type: 'unit', thanas: new Set(), count: 0, revenue: 0, byType: {} };
        map.set(s.circleSectorName, entry);
      }
      entry.thanas.add(s.thanaName);
      entry.count += 1;
      entry.revenue += s.totalRevenue;
      entry.byType[s.shopType] = (entry.byType[s.shopType] ?? 0) + 1;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allShops, detail]);

  const effectivePageSize = pageSize === 'all' ? filteredSorted.length || 1 : pageSize;
  const totalPages = Math.ceil(filteredSorted.length / effectivePageSize);
  const displayRows = useMemo(
    () => filteredSorted.slice((page - 1) * effectivePageSize, page * effectivePageSize),
    [filteredSorted, page, effectivePageSize],
  );

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  }

  function handleSearch(v: string) { setSearch(v); setPage(1); }
  function handleTypeFilter(v: string) {
    setTypeFilter(v);
    // CL5CC only applies within Country Liquor — clear it when switching to any other type
    if (v !== 'all' && v !== 'COUNTRY_LIQUOR') setCl5ccFilter(false);
    setPage(1);
  }
  function handleCl5ccFilter(v: boolean) {
    setCl5ccFilter(v);
    // Selecting CL5CC filter implicitly scopes to Country Liquor
    if (v) setTypeFilter('COUNTRY_LIQUOR');
    setPage(1);
  }
  function handleCircleFilter(v: string) { setCircleFilter(v); setPage(1); }
  function handlePageSize(v: PageSizeVal) { setPageSize(v); setPage(1); localStorage.setItem('admin-page-size', String(v)); }
  function handleGroupByType(checked: boolean) {
    setGroupByType(checked);
    setPage(1);
    try { localStorage.setItem('admin-group-by-type', String(checked)); } catch { }
    if (checked) setTypeFilter('all'); // deselect any active type filter
    // expandedGroups intentionally not reset — lazy-init reads localStorage, toggleGroup persists it
  }
  function toggleGroup(type: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      try { localStorage.setItem(`admin-group-${name}`, JSON.stringify(Array.from(next))); } catch { }
      return next;
    });
  }

  async function exportXlsx() {
    const { exportShopsToXlsx } = await import('@/lib/excel');
    await exportShopsToXlsx(allShops, {
      title: `District: ${name.toUpperCase()}`,
      sheetName: name,
      filename: `${name}-shops.xlsx`,
    });
  }

  async function exportCircleSectorXlsx(circleSectorName: string) {
    const { exportShopsToXlsx } = await import('@/lib/excel');
    const shops = allShops.filter((s) => s.circleSectorName === circleSectorName);
    await exportShopsToXlsx(shops, {
      title: `District: ${name.toUpperCase()}  |  ${circleSectorName}`,
      sheetName: circleSectorName,
      filename: `${name}-${circleSectorName}.xlsx`.replace(/[\\/:*?"<>|]/g, '-'),
    });
  }

  // Group rows by type for grouped view
  const grouped = useMemo(() => {
    if (!groupByType) return null;
    const map = new Map<string, ShopRow[]>();
    for (const s of filteredSorted) {
      if (!map.has(s.shopType)) map.set(s.shopType, []);
      map.get(s.shopType)!.push(s);
    }
    return map;
  }, [filteredSorted, groupByType]);

  const skeletonCols = 9;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="flex gap-3 items-center flex-wrap">
        <Link href="/admin/districts" className="btn btn-ghost btn-sm gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Districts
        </Link>
        <span className="text-base-content/50">/</span>
        <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
        {session?.role === 'superadmin' && detail && (
          <button className="btn btn-ghost btn-xs btn-circle" onClick={() => setEditing(true)} aria-label={`Edit ${name}`} title="Edit district">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
          </button>
        )}
        {detail && (
          <span className={`badge badge-sm font-medium ${statusBadgeClass(detail.status)}`}>
            {statusLabel(detail.status)}
          </span>
        )}
        <div className="ml-auto flex gap-2 items-center">
          <HelpPanel pageKey="admin_district_detail" title="District Detail — How to use this page">
            <ul className="list-disc list-inside space-y-1">
              <li><strong>All fields</strong> — every Phase 1 data field is shown: shop ID, name, circle/sector, thana, adjacent thanas, type, coordinates, and revenue.</li>
              <li><strong>Revenue breakdown</strong> — click any revenue figure to expand the fee component breakdown for that shop.</li>
              <li><strong>CL5CC</strong> — shown as a sub-badge under the shop type. CL5CC is Country Liquor with the special beer licence flag enabled.</li>
              <li><strong>Search</strong> — filters by shop ID, name, or thana as you type (client-side, no extra network call).</li>
              <li><strong>Sort</strong> — click any underlined column header to sort ascending/descending.</li>
              <li><strong>Type filter</strong> — use the dropdown or click a type card in the breakdown bar above to filter by shop type.</li>
              <li><strong>Group by type</strong> — toggle to cluster rows under shop type headings with per-group subtotals.</li>
              <li><strong>Rows per page</strong> — 10 / 25 / 50 / 100 / All. Your preference is remembered across pages.</li>
              <li><strong>Export XLSX</strong> — downloads this district&apos;s shops as an Excel file. All columns are correctly formatted — no CSV comma-quoting issues.</li>
            </ul>
          </HelpPanel>
          <button className="btn btn-sm btn-outline gap-2" onClick={exportXlsx} disabled={allShops.length === 0}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 11 12 16 17 11"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
            Export XLSX
          </button>
          {detail && detail.units.length > 0 && pendingUnlockRequest && (
            <button className="btn btn-sm btn-outline btn-error gap-2" onClick={unlockUnits} disabled={unlocking} title="The DEO has requested an unlock — review and approve">
              {unlocking ? <span className="loading loading-spinner loading-xs" /> : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0"/></svg>
              )}
              {pendingUnlockRequest.requestType === 'data_correction' ? 'Correction Requested' : 'Unlock Requested'}
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {loading ? (
        <div className="grid md:grid-cols-4 gap-3 animate-pulse">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-20 rounded-xl bg-base-300" />
          ))}
        </div>
      ) : detail && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="District Excise Officer (DEO)" value={detail.deoName ?? '—'} />
          <StatCard
            label="Division"
            value={detail.division ?? '—'}
            {...(detail.division ? { href: `/admin/divisions/${encodeURIComponent(detail.division)}` } : {})}
          />
          <StatCard
            label="Circles & Sectors"
            value={detail.units.length.toLocaleString()}
            sub={`${detail.units.filter((u) => u.type === 'sector').length} sectors · ${detail.units.filter((u) => u.type === 'circle').length} circles`}
            {...(detail.units.length > 0 ? { onClick: () => setShowUnitsModal(true) } : {})}
          />
          <StatCard
            label="Total Vends"
            value={detail.vendCount.toLocaleString()}
            sub={SHOP_TYPES.map((t) => typeCounts[t] ? `${TYPE_LABEL[t]}: ${typeCounts[t].count}` : null).filter(Boolean).join(' · ')}
          />
          <StatCard label="Total Revenue" value={fmtCr(detail.totalRevenue)} sub={`across ${detail.vendCount.toLocaleString()} vends`} />
        </div>
      )}
      {showUnitsModal && detail && (
        <UnitsModal units={detail.units} districtName={detail.name} onClose={() => setShowUnitsModal(false)} />
      )}
      {editing && detail && (
        <EditDistrictDrawer
          district={{ ...detail, unitCount: detail.units.length }}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); void refreshShops(); }}
        />
      )}

      {/* Per-type breakdown bar */}
      {!loading && allShops.length > 0 && (
        <div className="bg-base-100 rounded-xl border border-base-200 p-4">
          <p className="text-[11px] uppercase tracking-widest font-medium text-base-content/60 mb-3">Shop Type Breakdown</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {SHOP_TYPES.map((t) => {
              const c = typeCounts[t];
              if (!c) return null;
              return (
                <button
                  key={t}
                  onClick={() => handleTypeFilter(typeFilter === t ? 'all' : t)}
                  className={`rounded-lg border p-3 text-left transition-colors cursor-pointer hover:bg-base-300 ${typeFilter === t ? 'border-info bg-info/5' : 'border-base-200'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`badge badge-xs ${TYPE_BADGE[t]}`}>{' '}</span>
                    <span className="text-xs font-medium text-base-content/90">{TYPE_LABEL[t]}</span>
                  </div>
                  <p className="text-lg font-bold tabular-nums">{c.count}</p>
                  <p className="text-[11px] text-base-content/60 tabular-nums">{fmtCr(c.revenue)}</p>
                </button>
              );
            })}
            {cl5ccCount > 0 && (() => {
              const cl5ccDisabled = typeFilter !== 'all' && typeFilter !== 'COUNTRY_LIQUOR';
              return (
                <button
                  onClick={() => !cl5ccDisabled && handleCl5ccFilter(!cl5ccFilter)}
                  disabled={cl5ccDisabled}
                  title={cl5ccDisabled ? 'CL5CC only applies within Country Liquor' : undefined}
                  className={`rounded-lg border p-3 text-left transition-colors ${cl5ccDisabled ? 'opacity-30 cursor-not-allowed border-base-300' : `cursor-pointer hover:bg-base-200 ${cl5ccFilter ? 'border-info bg-info/5' : 'border-base-300'}`}`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="badge badge-xs badge-outline text-[10px]">CL5CC</span>
                    <span className="text-xs font-medium text-base-content/90">Country Liquor w/ Beer</span>
                  </div>
                  <p className="text-lg font-bold tabular-nums">{cl5ccCount}</p>
                  <p className="text-[11px] text-base-content/60">of Country Liquor</p>
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* Circle/Sector breakdown */}
      {!loading && circleStats.length > 0 && (
        <div className="bg-base-100 rounded-xl border border-base-200 overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between p-4 hover:bg-base-200/50 transition-colors"
            onClick={() => setShowCircleStats((v) => !v)}
            aria-expanded={showCircleStats}
          >
            <p className="text-[11px] uppercase tracking-widest font-medium text-base-content/60">
              Circle / Sector Breakdown ({circleStats.length})
            </p>
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-base-content/50 transition-transform ${showCircleStats ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          {showCircleStats && (
            <div className="overflow-x-auto border-t border-base-200">
              <table className="table table-sm w-full" role="grid" aria-label="Circle and sector breakdown">
                <thead>
                  <tr>
                    <th>Circle / Sector</th>
                    <th>Type</th>
                    <th>Thanas</th>
                    <th>Shops</th>
                    <th>Revenue</th>
                    <th>Type Breakdown</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {circleStats.map((c) => (
                    <tr key={c.name} role="row">
                      <td className="font-medium">{c.name}</td>
                      <td><span className="badge badge-xs badge-ghost capitalize">{c.type}</span></td>
                      <td className="tabular-nums">{c.thanas.size}</td>
                      <td className="tabular-nums">{c.count}</td>
                      <td className="tabular-nums">{fmtCr(c.revenue)}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {SHOP_TYPES.map((t) => c.byType[t] ? (
                            <span key={t} className={`badge badge-xs ${TYPE_BADGE[t]}`} title={TYPE_LABEL[t]}>
                              {TYPE_SHORT_LABEL[t]}: {c.byType[t]}
                            </span>
                          ) : null)}
                          {c.count === 0 && <span className="text-xs text-base-content/50">No shops yet</span>}
                        </div>
                      </td>
                      <td>
                        {c.count > 0 && (
                          <button
                            className="btn btn-ghost btn-xs btn-circle"
                            onClick={() => exportCircleSectorXlsx(c.name)}
                            aria-label={`Download ${c.name} as Excel`}
                            title="Download this circle/sector's shops as Excel"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 11 12 16 17 11"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Table card */}
      <div className="bg-base-100 rounded-xl border border-base-200 overflow-hidden">

        {/* Toolbar */}
        <div className={`flex flex-wrap gap-3 items-center p-4 border-b border-base-200 ${loading ? 'pointer-events-none opacity-50' : ''}`}>
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search shop ID, name, thana…"
              className="input input-sm input-bordered w-full pl-8 bg-base-100"
            />
          </div>

          {/* Type filter */}
          <select
            className="select select-sm select-bordered bg-base-100"
            value={typeFilter}
            onChange={(e) => handleTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            {SHOP_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>

          {/* Circle / Sector filter */}
          {circles.length > 0 && (
            <select
              className="select select-sm select-bordered bg-base-100"
              value={circleFilter}
              onChange={(e) => handleCircleFilter(e.target.value)}
            >
              <option value="all">All Circles / Sectors</option>
              {circles.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          {/* Group by type toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-base-content/90">
            <input
              type="checkbox"
              className="toggle toggle-xs toggle-info"
              checked={groupByType}
              onChange={(e) => handleGroupByType(e.target.checked)}
            />
            Group by type
          </label>

          {/* Page size */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-base-content/60 whitespace-nowrap">Rows per page</span>
            <div className="join">
              {PAGE_SIZES.map((ps) => (
                <button
                  key={ps}
                  className={`join-item btn btn-xs ${pageSize === ps ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                  onClick={() => handlePageSize(ps)}
                >
                  {ps === 'all' ? 'All' : ps}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Result count */}
        <div className="px-4 py-2 bg-base-50 border-b border-base-200 text-xs text-base-content/70">
          {loading ? 'Loading…' : (
            <>
              Showing <strong>{displayRows.length.toLocaleString()}</strong> of{' '}
              <strong>{filteredSorted.length.toLocaleString()}</strong> shops
              {filteredSorted.length !== allShops.length && ` (filtered from ${allShops.length.toLocaleString()} total)`}
            </>
          )}
        </div>

        {/* Table */}
        <div className="overflow-auto max-h-[calc(100vh-250px)] rounded-xl border border-base-200">
          <table className="table table-xs table-pin-rows w-full" role="grid">
            <thead className="bg-base-200 text-[11px] uppercase tracking-wide text-base-content/70 z-10">
              <tr>
                <th
                  className="cursor-pointer hover:text-base-content whitespace-nowrap"
                  onClick={() => handleSort('shopId')}
                >
                  Shop ID <SortIcon active={sortKey === 'shopId'} dir={sortDir} />
                </th>
                <th
                  className="cursor-pointer hover:text-base-content"
                  onClick={() => handleSort('shopName')}
                >
                  Shop Name <SortIcon active={sortKey === 'shopName'} dir={sortDir} />
                </th>
                <th>Circle / Sector</th>
                <th
                  className="cursor-pointer hover:text-base-content"
                  onClick={() => handleSort('thanaName')}
                >
                  Thana <SortIcon active={sortKey === 'thanaName'} dir={sortDir} />
                </th>
                <th>Adjacent Thanas</th>
                <th
                  className="cursor-pointer hover:text-base-content"
                  onClick={() => handleSort('shopType')}
                >
                  Type <SortIcon active={sortKey === 'shopType'} dir={sortDir} />
                </th>
                <th>Coordinates</th>
                <th
                  className="cursor-pointer hover:text-base-content text-right"
                  onClick={() => handleSort('totalRevenue')}
                >
                  Revenue <SortIcon active={sortKey === 'totalRevenue'} dir={sortDir} />
                </th>
                <th>Uploaded By</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 15 }, (_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: skeletonCols }, (_, j) => (
                      <td key={j}><div className="h-3 bg-base-300 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : grouped ? (
                // ── Grouped view ──────────────────────────────────────────────
                Array.from(grouped.entries()).flatMap(([type, allGroupRows]) => {
                  const isExpanded = expandedGroups.has(type);
                  const gPage = groupPages[type] ?? 1;
                  const gTotalPages = Math.ceil(allGroupRows.length / effectivePageSize);
                  const gRows = allGroupRows.slice((gPage - 1) * effectivePageSize, gPage * effectivePageSize);
                  function setGPage(p: number) { setGroupPages((prev) => ({ ...prev, [type]: p })); }

                  return [
                    <tr key={`hdr-${type}`} className="bg-base-200/60 border-t-2 border-base-300">
                      <td colSpan={skeletonCols} className="py-2 px-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleGroup(type)}
                            className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                          >
                            <span className="text-base-content/70 text-xs">{isExpanded ? '▾' : '▸'}</span>
                            <span className={`badge badge-sm font-semibold ${TYPE_BADGE[type] ?? 'badge-ghost'}`}>
                              {TYPE_LABEL[type] ?? type}
                            </span>
                          </button>
                          <span className="text-xs text-base-content/70">
                            {allGroupRows.length} shops · {fmtCr(allGroupRows.reduce((s, r) => s + r.totalRevenue, 0))}
                          </span>
                        </div>
                      </td>
                    </tr>,
                    ...(isExpanded ? [
                      ...gRows.map((s) => <ShopTableRow key={s.id} s={s} />),
                      ...(gTotalPages > 1 ? [
                        <tr key={`pgn-${type}`}>
                          <td colSpan={skeletonCols} className="py-1.5 px-4 bg-base-50">
                            <div className="flex items-center gap-2 text-xs text-base-content/80">
                              <button className="btn btn-ghost btn-xs" disabled={gPage === 1} onClick={() => setGPage(gPage - 1)}>← Prev</button>
                              <span>Page {gPage} of {gTotalPages}</span>
                              <button className="btn btn-ghost btn-xs" disabled={gPage >= gTotalPages} onClick={() => setGPage(gPage + 1)}>Next →</button>
                            </div>
                          </td>
                        </tr>,
                      ] : []),
                    ] : []),
                  ];
                })
              ) : (
                // ── Flat view ─────────────────────────────────────────────────
                displayRows.length === 0
                  ? (
                    <tr>
                      <td colSpan={skeletonCols} className="text-center py-12 text-base-content/60">
                        No shops match your filters.
                      </td>
                    </tr>
                  )
                  : displayRows.map((s) => <ShopTableRow key={s.id} s={s} />)
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {!loading && totalPages > 1 && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-base-200 bg-base-50">
            <button
              className="btn btn-sm btn-ghost"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Previous
            </button>
            <span className="text-xs text-base-content/70">
              Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            </span>
            <button
              className="btn btn-sm btn-ghost"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Extracted row so JSX stays readable
const ShopTableRow = memo(function ShopTableRow({ s }: { s: ShopRow }) {  // ponytail: memo prevents re-render of stable rows when toolbar state changes
  return (
    <tr className="hover:bg-base-50 border-b border-base-100 last:border-0">
      <td className="font-mono text-xs text-base-content/90 whitespace-nowrap">{s.shopId}</td>
      <td className="max-w-[200px]">
        <span className="block truncate text-sm font-medium" title={s.shopName}>{s.shopName}</span>
      </td>
      <td className="text-xs text-base-content/80 max-w-[120px] truncate" title={s.circleSectorName}>
        {s.circleSectorName}
      </td>
      <td className="text-xs text-base-content/90 whitespace-nowrap">{s.thanaName}</td>
      <td><AdjThanas raw={s.adjacentThanasRaw} /></td>
      <td><TypeBadge type={s.shopType} cl5cc={s.hasCl5cc} /></td>
      <td className="font-mono text-xs text-base-content/70 whitespace-nowrap">
        {s.latitudeDecimal != null && s.longitudeDecimal != null
          ? `${s.latitudeDecimal.toFixed(4)}, ${s.longitudeDecimal.toFixed(4)}`
          : <span className="text-base-content/45">—</span>}
      </td>
      <td className="text-right relative">
        <RevenueCell s={s} />
      </td>
      <td className="text-xs text-base-content/60">{s.uploadedByDeo}</td>
    </tr>
  );
});
