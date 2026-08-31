'use client';

import { memo, useMemo, useState } from 'react';
import { RevenueCell, type RevenueShopFields } from '@/components/RevenueCell';
import { ThanaVariantsCard } from '@/components/ThanaVariantsCard';
import { SHOP_TYPE_BADGE_CLASS, SHOP_TYPE_SHORT_LABEL } from '@/lib/shop-type';
import { SHOP_TYPE_LABELS, SHOP_TYPES } from '@excise/schema';
import { useShopAggregates } from '@/hooks/useShopAggregates';

export interface ShopExplorerRow extends RevenueShopFields {
  id: number;
  shopId: string;
  shopName: string;
  circleSectorName: string;
  thanaName: string;
  adjacentThanasRaw: string | null;
  latitudeDecimal: number | null;
  longitudeDecimal: number | null;
  uploadedByDeo: string;
}

const TYPE_BADGE = SHOP_TYPE_BADGE_CLASS;
const TYPE_LABEL: Record<string, string> = SHOP_TYPE_LABELS;
const TYPE_SHORT_LABEL = SHOP_TYPE_SHORT_LABEL;

const fmtCr = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;

type SortKey = 'shopId' | 'shopName' | 'thanaName' | 'totalRevenue' | 'shopType';
type PageSizeVal = 10 | 25 | 50 | 100 | 'all';
const PAGE_SIZES: PageSizeVal[] = [10, 25, 50, 100, 'all'];

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

const ShopTableRow = memo(function ShopTableRow({ s }: { s: ShopExplorerRow }) {  // ponytail: memo prevents re-render of stable rows when toolbar state changes
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

const SKELETON_COLS = 9;

/** Shared, filterable/sortable/groupable shop browser — type breakdown bar, circle/sector
 * breakdown table, and the shop table itself, with per-district and per-circle/sector XLSX
 * export. Used by both the admin district detail page and the DEO final-verification screen
 * so the two never drift apart from each other (see roadmap: prior versions were hand-copied
 * and fell out of sync). `storageKeyPrefix` namespaces localStorage keys per portal — pass
 * `'admin'` to keep the admin portal's existing keys (see CLAUDE.md's localStorage registry). */
export function ShopExplorer({
  shops,
  units,
  districtName,
  loading = false,
  storageKeyPrefix,
}: {
  shops: ShopExplorerRow[];
  units: { name: string; type: string }[];
  districtName: string;
  loading?: boolean;
  storageKeyPrefix: string;
}) {
  const { typeCounts, cl5ccCount, circles, circleStats, thanaVariants } = useShopAggregates(shops, units);

  const [showCircleStats, setShowCircleStats] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [cl5ccFilter, setCl5ccFilter] = useState(false);
  const [circleFilter, setCircleFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('shopId');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [groupByType, setGroupByType] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(`${storageKeyPrefix}-group-by-type`) === 'true';
  });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem(`${storageKeyPrefix}-group-${districtName}`);
      if (stored) return new Set(JSON.parse(stored) as string[]);
    } catch { }
    return new Set(); // default: all collapsed
  });
  const [groupPages, setGroupPages] = useState<Record<string, number>>({});
  const [pageSize, setPageSize] = useState<PageSizeVal>(() => {
    if (typeof window === 'undefined') return 100;
    const s = localStorage.getItem(`${storageKeyPrefix}-page-size`);
    return (PAGE_SIZES as PageSizeVal[]).includes(s as PageSizeVal) ? (s as PageSizeVal) : 100;
  });
  const [page, setPage] = useState(1);

  const filteredSorted = useMemo(() => {
    const q = search.toLowerCase();
    let rows = shops.filter((s) => {
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
  }, [shops, search, typeFilter, cl5ccFilter, circleFilter, sortKey, sortDir]);

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
    if (v !== 'all' && v !== 'COUNTRY_LIQUOR') setCl5ccFilter(false);
    setPage(1);
  }
  function handleCl5ccFilter(v: boolean) {
    setCl5ccFilter(v);
    if (v) setTypeFilter('COUNTRY_LIQUOR');
    setPage(1);
  }
  function handleCircleFilter(v: string) { setCircleFilter(v); setPage(1); }
  function handlePageSize(v: PageSizeVal) { setPageSize(v); setPage(1); localStorage.setItem(`${storageKeyPrefix}-page-size`, String(v)); }
  function handleGroupByType(checked: boolean) {
    setGroupByType(checked);
    setPage(1);
    try { localStorage.setItem(`${storageKeyPrefix}-group-by-type`, String(checked)); } catch { }
    if (checked) setTypeFilter('all');
  }
  function toggleGroup(type: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      try { localStorage.setItem(`${storageKeyPrefix}-group-${districtName}`, JSON.stringify(Array.from(next))); } catch { }
      return next;
    });
  }

  async function exportXlsx() {
    const { exportShopsToXlsx } = await import('@/lib/excel');
    await exportShopsToXlsx(shops, {
      title: `District: ${districtName.toUpperCase()}`,
      sheetName: districtName,
      filename: `${districtName}-shops.xlsx`,
    });
  }

  async function exportCircleSectorXlsx(circleSectorName: string) {
    const { exportShopsToXlsx } = await import('@/lib/excel');
    const rows = shops.filter((s) => s.circleSectorName === circleSectorName);
    await exportShopsToXlsx(rows, {
      title: `District: ${districtName.toUpperCase()}  |  ${circleSectorName}`,
      sheetName: circleSectorName,
      filename: `${districtName}-${circleSectorName}.xlsx`.replace(/[\\/:*?"<>|]/g, '-'),
    });
  }

  const grouped = useMemo(() => {
    if (!groupByType) return null;
    const map = new Map<string, ShopExplorerRow[]>();
    for (const s of filteredSorted) {
      if (!map.has(s.shopType)) map.set(s.shopType, []);
      map.get(s.shopType)!.push(s);
    }
    return map;
  }, [filteredSorted, groupByType]);

  return (
    <div className="space-y-5">
      {/* Per-type breakdown bar */}
      {!loading && shops.length > 0 && (
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

      {/* Possible Thana name spelling variants — not auto-merged, a human confirms these are
          really the same place before anything changes (see findThanaNameVariants). */}
      {!loading && <ThanaVariantsCard clusters={thanaVariants} />}

      {/* Table card */}
      <div className="bg-base-100 rounded-xl border border-base-200 overflow-hidden">

        {/* Toolbar */}
        <div className={`flex flex-wrap gap-3 items-center p-4 border-b border-base-200 ${loading ? 'pointer-events-none opacity-50' : ''}`}>
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

          <select
            className="select select-sm select-bordered bg-base-100"
            value={typeFilter}
            onChange={(e) => handleTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            {SHOP_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>

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

          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-base-content/90">
            <input
              type="checkbox"
              className="toggle toggle-xs toggle-info"
              checked={groupByType}
              onChange={(e) => handleGroupByType(e.target.checked)}
            />
            Group by type
          </label>

          <button className="btn btn-sm btn-outline gap-2" onClick={exportXlsx} disabled={shops.length === 0}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 11 12 16 17 11"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
            Export XLSX
          </button>

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
              {filteredSorted.length !== shops.length && ` (filtered from ${shops.length.toLocaleString()} total)`}
            </>
          )}
        </div>

        {/* Table */}
        <div className="overflow-auto max-h-[calc(100vh-250px)] rounded-xl border border-base-200">
          <table className="table table-xs table-pin-rows table-fixed w-full" role="grid">
            <colgroup>
              <col className="w-[9%]" />
              <col className="w-[16%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[18%]" />
              <col className="w-[9%]" />
              <col className="w-[12%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead className="bg-base-200 text-[11px] uppercase tracking-wide text-base-content/70 z-10">
              <tr>
                <th className="cursor-pointer hover:text-base-content whitespace-nowrap" onClick={() => handleSort('shopId')}>
                  Shop ID <SortIcon active={sortKey === 'shopId'} dir={sortDir} />
                </th>
                <th className="cursor-pointer hover:text-base-content" onClick={() => handleSort('shopName')}>
                  Shop Name <SortIcon active={sortKey === 'shopName'} dir={sortDir} />
                </th>
                <th>Circle / Sector</th>
                <th className="cursor-pointer hover:text-base-content" onClick={() => handleSort('thanaName')}>
                  Thana <SortIcon active={sortKey === 'thanaName'} dir={sortDir} />
                </th>
                <th>Adjacent Thanas</th>
                <th className="cursor-pointer hover:text-base-content" onClick={() => handleSort('shopType')}>
                  Type <SortIcon active={sortKey === 'shopType'} dir={sortDir} />
                </th>
                <th>Coordinates</th>
                <th className="cursor-pointer hover:text-base-content text-right" onClick={() => handleSort('totalRevenue')}>
                  Revenue <SortIcon active={sortKey === 'totalRevenue'} dir={sortDir} />
                </th>
                <th>Uploaded By</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 15 }, (_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: SKELETON_COLS }, (_, j) => (
                      <td key={j}><div className="h-3 bg-base-300 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : grouped ? (
                Array.from(grouped.entries()).flatMap(([type, allGroupRows]) => {
                  const isExpanded = expandedGroups.has(type);
                  const gPage = groupPages[type] ?? 1;
                  const gTotalPages = Math.ceil(allGroupRows.length / effectivePageSize);
                  const gRows = allGroupRows.slice((gPage - 1) * effectivePageSize, gPage * effectivePageSize);
                  function setGPage(p: number) { setGroupPages((prev) => ({ ...prev, [type]: p })); }

                  return [
                    <tr key={`hdr-${type}`} className="bg-base-200/60 border-t-2 border-base-300">
                      <td colSpan={SKELETON_COLS} className="py-2 px-3">
                        <div className="flex items-center gap-3">
                          <button onClick={() => toggleGroup(type)} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
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
                          <td colSpan={SKELETON_COLS} className="py-1.5 px-4 bg-base-50">
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
                displayRows.length === 0
                  ? (
                    <tr>
                      <td colSpan={SKELETON_COLS} className="text-center py-12 text-base-content/60">
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
            <button className="btn btn-sm btn-ghost" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Previous</button>
            <span className="text-xs text-base-content/70">Page <strong>{page}</strong> of <strong>{totalPages}</strong></span>
            <button className="btn btn-sm btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
