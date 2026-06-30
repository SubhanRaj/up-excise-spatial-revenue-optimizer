'use client';

import { memo, use, useEffect, useMemo, useState } from 'react';
import HelpPanel from '@/app/_components/HelpPanel';

const ON_PREMISES_CONSUMPTION_FEE = 300_000;
const BHANG_MGQ_MULTIPLIER = 20;

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

interface DistrictDetail {
  name: string; division?: string; deoName?: string; status: string;
  vendCount: number; totalRevenue: number; units: { name: string; type: string }[];
}

const SHOP_TYPES = ['MODEL_SHOP', 'COMPOSITE_SHOP', 'PRV', 'BHANG_SHOP', 'COUNTRY_LIQUOR'] as const;

const TYPE_LABEL: Record<string, string> = {
  MODEL_SHOP: 'Model Shop',
  COMPOSITE_SHOP: 'Composite Shop (FL + Beer)',
  PRV: 'PRV (Premium Retail Vend)',
  BHANG_SHOP: 'Bhang Shop',
  COUNTRY_LIQUOR: 'Country Liquor',
};

// Distinct, non-purple palette using DaisyUI semantic classes
const TYPE_BADGE: Record<string, string> = {
  MODEL_SHOP: 'badge-info',
  COMPOSITE_SHOP: 'badge-accent',
  PRV: 'badge-success',
  BHANG_SHOP: 'badge-warning',
  COUNTRY_LIQUOR: 'badge-neutral',
};

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const fmtCr = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;

type SortKey = 'shopId' | 'shopName' | 'thanaName' | 'totalRevenue' | 'shopType';

// ── Sub-components ─────────────────────────────────────────────────────────────

function RevenueCell({ s }: { s: ShopRow }) {
  const lines: [string, number][] = [];
  if (s.shopType === 'MODEL_SHOP') {
    lines.push(
      ['License Fee (LF)', s.licenseFeeLf],
      ['MGR Amount', s.mgrAmount],
      ['On-Premises Consumption Fee', ON_PREMISES_CONSUMPTION_FEE],
    );
  } else if (s.shopType === 'COMPOSITE_SHOP') {
    lines.push(
      ['LF – FL', s.compositeLfFl],
      ['LF – Beer', s.compositeLfBeer],
      ['MGR – FL', s.compositeMgrFl],
      ['MGR – Beer', s.compositeMgrBeer],
    );
  } else if (s.shopType === 'PRV') {
    lines.push(['License Fee (LF)', s.licenseFeeLf], ['MGR Amount', s.mgrAmount]);
  } else if (s.shopType === 'BHANG_SHOP') {
    lines.push(
      ['License Fee (LF)', s.licenseFeeLf],
      [`MGQ (${s.mgqQuantity} × ₹${BHANG_MGQ_MULTIPLIER})`, s.mgqQuantity * BHANG_MGQ_MULTIPLIER],
    );
  } else if (s.shopType === 'COUNTRY_LIQUOR') {
    lines.push(
      ['Basic License Fee (BLF)', s.basicLicenseFeeBlf],
      ['Consideration Fee', s.considerationFee],
    );
    if (s.hasCl5cc)
      lines.push(['Special Beer LF', s.specialBeerLf], ['Special Beer MGR', s.specialBeerMgr]);
  }

  return (
    <details className="group cursor-pointer">
      <summary className="list-none select-none font-mono text-xs font-medium tabular-nums hover:underline decoration-dotted underline-offset-2">
        {fmt(s.totalRevenue)}
        <span className="ml-1 text-base-content/30 group-open:hidden">▾</span>
      </summary>
      <div className="absolute z-10 mt-1 w-56 rounded-lg border border-base-300 bg-base-100 p-3 shadow-lg text-xs">
        <p className="text-base-content/50 font-medium uppercase tracking-wide text-[10px] mb-2">Revenue Breakdown</p>
        <div className="space-y-1">
          {lines.map(([label, val]) => (
            <div key={label} className="flex justify-between gap-3">
              <span className="text-base-content/60 truncate">{label}</span>
              <span className="font-mono tabular-nums shrink-0">{fmt(val)}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between gap-3 border-t border-base-200 pt-2 font-semibold">
          <span>Total</span>
          <span className="font-mono tabular-nums">{fmt(s.totalRevenue)}</span>
        </div>
      </div>
    </details>
  );
}

function AdjThanas({ raw }: { raw: string | null }) {
  if (!raw) return <span className="text-base-content/30">—</span>;
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
  if (!active) return <span className="text-base-content/20 ml-1">⇅</span>;
  return <span className="text-info ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

function TypeBadge({ type, cl5cc }: { type: string; cl5cc: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 items-start">
      <span className={`badge badge-xs font-medium ${TYPE_BADGE[type] ?? 'badge-ghost'}`}>
        {TYPE_LABEL[type] ?? type}
      </span>
      {cl5cc && <span className="badge badge-xs badge-outline text-[10px]">CL5CC</span>}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-base-100 rounded-xl border border-base-200 p-4 space-y-1">
      <p className="text-[11px] uppercase tracking-widest font-medium text-base-content/40">{label}</p>
      <p className="text-xl font-bold text-base-content tabular-nums">{value}</p>
      {sub && <p className="text-xs text-base-content/50">{sub}</p>}
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

  const [detail, setDetail] = useState<DistrictDetail | null>(null);
  const [allShops, setAllShops] = useState<ShopRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Toolbar state
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [cl5ccFilter, setCl5ccFilter] = useState(false);
  const [circleFilter, setCircleFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('shopId');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [groupByType, setGroupByType] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(SHOP_TYPES));
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
      const [d, s] = await Promise.all([
        fetch(`/api/admin/districts/${encodeURIComponent(name)}`).then((r) => r.json()),
        fetch(`/api/admin/districts/${encodeURIComponent(name)}/shops?pageSize=all`).then((r) => r.json()),
      ]);
      setDetail(d as DistrictDetail);
      setAllShops((s as { rows: ShopRow[] }).rows);
      setLoading(false);
    }
    void load();
  }, [name]);

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

  async function exportCsv() {
    const res = await fetch(`/api/admin/districts/${encodeURIComponent(name)}/export`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${name}-shops.csv`; a.click();
    URL.revokeObjectURL(url);
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
        <a href="/admin" className="btn btn-outline btn-sm gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Districts
        </a>
        <span className="text-base-content/30">/</span>
        <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
        {detail && (
          <span className={`badge badge-sm font-medium ${detail.status === 'submitted' ? 'badge-success' : detail.status === 'in_progress' ? 'badge-warning' : 'badge-ghost'}`}>
            {detail.status === 'submitted' ? 'Submitted' : detail.status === 'in_progress' ? 'In Progress' : 'Pending'}
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
              <li><strong>Export CSV</strong> — downloads this district&apos;s shops only as a CSV file.</li>
            </ul>
          </HelpPanel>
          <button className="btn btn-sm btn-outline gap-2" onClick={exportCsv}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 11 12 16 17 11"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
            Export CSV
          </button>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="DEO Officer" value={detail.deoName ?? '—'} />
          <StatCard label="Division" value={detail.division ?? '—'} />
          <StatCard
            label="Total Vends"
            value={detail.vendCount.toLocaleString()}
            sub={SHOP_TYPES.map((t) => typeCounts[t] ? `${TYPE_LABEL[t]}: ${typeCounts[t].count}` : null).filter(Boolean).join(' · ')}
          />
          <StatCard label="Total Revenue" value={fmtCr(detail.totalRevenue)} sub={`across ${detail.vendCount.toLocaleString()} vends`} />
        </div>
      )}

      {/* Per-type breakdown bar */}
      {!loading && allShops.length > 0 && (
        <div className="bg-base-100 rounded-xl border border-base-200 p-4">
          <p className="text-[11px] uppercase tracking-widest font-medium text-base-content/40 mb-3">Shop Type Breakdown</p>
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
                    <span className="text-xs font-medium text-base-content/70">{TYPE_LABEL[t]}</span>
                  </div>
                  <p className="text-lg font-bold tabular-nums">{c.count}</p>
                  <p className="text-[11px] text-base-content/40 tabular-nums">{fmtCr(c.revenue)}</p>
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
                    <span className="text-xs font-medium text-base-content/70">Country Liquor w/ Beer</span>
                  </div>
                  <p className="text-lg font-bold tabular-nums">{cl5ccCount}</p>
                  <p className="text-[11px] text-base-content/40">of Country Liquor</p>
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* Table card */}
      <div className="bg-base-100 rounded-xl border border-base-200 overflow-hidden">

        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-center p-4 border-b border-base-200">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
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
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-base-content/70">
            <input
              type="checkbox"
              className="toggle toggle-xs toggle-info"
              checked={groupByType}
              onChange={(e) => { setGroupByType(e.target.checked); setPage(1); }}
            />
            Group by type
          </label>

          {/* Page size */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-base-content/40 whitespace-nowrap">Rows per page</span>
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
        <div className="px-4 py-2 bg-base-50 border-b border-base-200 text-xs text-base-content/50">
          {loading ? 'Loading…' : (
            <>
              Showing <strong>{displayRows.length.toLocaleString()}</strong> of{' '}
              <strong>{filteredSorted.length.toLocaleString()}</strong> shops
              {filteredSorted.length !== allShops.length && ` (filtered from ${allShops.length.toLocaleString()} total)`}
            </>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="table table-xs w-full" role="grid">
            <thead className="bg-base-50 text-[11px] uppercase tracking-wide text-base-content/50">
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
                            onClick={() => setExpandedGroups((prev) => {
                              const next = new Set(prev);
                              if (next.has(type)) next.delete(type); else next.add(type);
                              return next;
                            })}
                            className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                          >
                            <span className="text-base-content/50 text-xs">{isExpanded ? '▾' : '▸'}</span>
                            <span className={`badge badge-sm font-semibold ${TYPE_BADGE[type] ?? 'badge-ghost'}`}>
                              {TYPE_LABEL[type] ?? type}
                            </span>
                          </button>
                          <span className="text-xs text-base-content/50">
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
                            <div className="flex items-center gap-2 text-xs text-base-content/60">
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
                      <td colSpan={skeletonCols} className="text-center py-12 text-base-content/40">
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
            <span className="text-xs text-base-content/50">
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
      <td className="font-mono text-xs text-base-content/70 whitespace-nowrap">{s.shopId}</td>
      <td className="max-w-[200px]">
        <span className="block truncate text-sm font-medium" title={s.shopName}>{s.shopName}</span>
      </td>
      <td className="text-xs text-base-content/60 max-w-[120px] truncate" title={s.circleSectorName}>
        {s.circleSectorName}
      </td>
      <td className="text-xs text-base-content/70 whitespace-nowrap">{s.thanaName}</td>
      <td><AdjThanas raw={s.adjacentThanasRaw} /></td>
      <td><TypeBadge type={s.shopType} cl5cc={s.hasCl5cc} /></td>
      <td className="font-mono text-xs text-base-content/50 whitespace-nowrap">
        {s.latitudeDecimal != null && s.longitudeDecimal != null
          ? `${s.latitudeDecimal.toFixed(4)}, ${s.longitudeDecimal.toFixed(4)}`
          : <span className="text-base-content/25">—</span>}
      </td>
      <td className="text-right relative">
        <RevenueCell s={s} />
      </td>
      <td className="text-xs text-base-content/40">{s.uploadedByDeo}</td>
    </tr>
  );
});
