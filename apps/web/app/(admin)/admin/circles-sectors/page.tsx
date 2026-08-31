'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import HelpPanel from '@/app/_components/HelpPanel';
import { useAdminDistricts } from '@/hooks/useAdminDistricts';
import { useAdminExportData } from '@/hooks/useAdminExportData';
import { SHOP_TYPE_BADGE_CLASS, SHOP_TYPE_SHORT_LABEL } from '@/lib/shop-type';
import { compareUnitName } from '@/lib/unit-sort';
import { normalizeThanaName } from '@/lib/thana-name';
import { SHOP_TYPES, SHOP_TYPE_LABELS } from '@excise/schema';

const fmt = (n: number) => n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${n.toLocaleString('en-IN')}`;

type SortKey = 'district' | 'name' | 'thanaCount' | 'count' | 'revenue';

interface Row {
  district: string;
  name: string;
  type: string;
  thanas: Set<string>;
  count: number;
  revenue: number;
  byType: Record<string, number>;
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="text-base-content/40 ml-1">⇅</span>;
  return <span className="text-info ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

export default function CirclesSectorsPage() {
  const { districts, loading: districtsLoading } = useAdminDistricts();
  const { data, loading, syncing, sync } = useAdminExportData();

  const [search, setSearch] = useState('');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('district');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Same aggregation shape as the district detail page's own circleStats and the full-state
  // export's Circle-Sector Summary sheet — seeded from the authoritative district_circles_sectors
  // rows first so a registered-but-empty unit still shows a real 0-shop row.
  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const map = new Map<string, Row>();
    for (const u of data.units) {
      map.set(`${u.districtName}::${u.name}`, { district: u.districtName, name: u.name, type: u.type, thanas: new Set(), count: 0, revenue: 0, byType: {} });
    }
    for (const s of data.rows) {
      const district = s.districtName ?? '';
      const key = `${district}::${s.circleSectorName}`;
      let entry = map.get(key);
      if (!entry) {
        entry = { district, name: s.circleSectorName, type: 'unit', thanas: new Set(), count: 0, revenue: 0, byType: {} };
        map.set(key, entry);
      }
      entry.thanas.add(normalizeThanaName(s.thanaName));
      entry.count += 1;
      entry.revenue += s.totalRevenue;
      entry.byType[s.shopType] = (entry.byType[s.shopType] ?? 0) + 1;
    }
    return Array.from(map.values());
  }, [data]);

  const filteredSorted = useMemo(() => {
    const q = search.toLowerCase();
    let out = rows.filter((r) => {
      if (districtFilter !== 'all' && r.district !== districtFilter) return false;
      if (q && !r.district.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      // 'name' is a circle/sector label ("Sector - 1", "Circle 2 - X") — plain string compare
      // sorts it lexicographically ("Sector - 10" before "Sector - 2"); compareUnitName
      // orders sectors before circles, each numerically. Sorting by 'district' also
      // tie-breaks with it so units within the same district land in the same natural order.
      if (sortKey === 'name' || sortKey === 'district') {
        const primary = sortKey === 'district' ? a.district.localeCompare(b.district) : compareUnitName(a.name, b.name);
        const secondary = sortKey === 'district' ? compareUnitName(a.name, b.name) : a.district.localeCompare(b.district);
        const result = primary || secondary;
        return sortDir === 'asc' ? result : -result;
      }
      const av = sortKey === 'thanaCount' ? a.thanas.size : a[sortKey];
      const bv = sortKey === 'thanaCount' ? b.thanas.size : b[sortKey];
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return out;
  }, [rows, search, districtFilter, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  const totals = useMemo(() => ({
    units: filteredSorted.length,
    shops: filteredSorted.reduce((s, r) => s + r.count, 0),
    revenue: filteredSorted.reduce((s, r) => s + r.revenue, 0),
  }), [filteredSorted]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Circle &amp; Sector Master</h1>
          <p className="text-sm text-base-content/70 mt-0.5">Every registered circle/sector across all 75 districts, with its shop count and revenue.</p>
        </div>
        <div className="ml-auto">
          <HelpPanel pageKey="admin_circles_sectors" title="Circle & Sector Master">
            <p>One row per registered circle/sector, across every district.</p>
            <ul className="list-disc list-inside space-y-1 mt-1">
              <li><strong>0-shop rows</strong> — a circle/sector a DEO registered but never uploaded data for still shows, with a 0 shop count.</li>
              <li><strong>Type breakdown</strong> — per-shop-type badge counts for that circle/sector.</li>
            </ul>
          </HelpPanel>
        </div>
      </div>

      {!loading && !data ? (
        <div className="bg-base-100 rounded-xl border border-base-200 p-6 text-center text-sm text-base-content/70">
          No data loaded yet — click <strong>Sync All</strong> at the top of the page.
        </div>
      ) : (
        <>
          {/* Stat chips */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-2 flex items-center gap-2">
              <span className="text-xs text-base-content/70">Circles/Sectors</span>
              <span className="font-bold tabular-nums">{totals.units.toLocaleString()}</span>
            </div>
            <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-2 flex items-center gap-2">
              <span className="text-xs text-base-content/70">Total shops</span>
              <span className="font-bold tabular-nums">{totals.shops.toLocaleString()}</span>
            </div>
            <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-2 flex items-center gap-2">
              <span className="text-xs text-base-content/70">Total revenue</span>
              <span className="font-bold text-primary tabular-nums">{fmt(totals.revenue)}</span>
            </div>
            <button className="btn btn-ghost btn-xs gap-1 ml-auto" onClick={sync} disabled={syncing} title="Refresh this data">
              {syncing ? <span className="loading loading-spinner loading-xs" /> : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
              )}
              Refresh
            </button>
          </div>

          {/* Table card */}
          <div className="bg-base-100 rounded-xl border border-base-200 overflow-hidden">
            <div className="flex flex-wrap gap-3 items-center p-4 border-b border-base-200">
              <div className="relative flex-1 min-w-[200px]">
                <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search district or circle/sector name…"
                  className="input input-sm input-bordered w-full pl-8 bg-base-100"
                />
              </div>
              <select className="select select-sm select-bordered bg-base-100" value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)} disabled={districtsLoading}>
                <option value="all">All Districts</option>
                {districts.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="table table-sm w-full" role="grid">
                <thead className="bg-base-50 text-[11px] uppercase tracking-wide text-base-content/70">
                  <tr>
                    <th className="cursor-pointer hover:text-base-content" onClick={() => handleSort('district')}>District <SortIcon active={sortKey === 'district'} dir={sortDir} /></th>
                    <th className="cursor-pointer hover:text-base-content" onClick={() => handleSort('name')}>Circle / Sector <SortIcon active={sortKey === 'name'} dir={sortDir} /></th>
                    <th>Type</th>
                    <th className="cursor-pointer hover:text-base-content text-right" onClick={() => handleSort('thanaCount')}>Thanas <SortIcon active={sortKey === 'thanaCount'} dir={sortDir} /></th>
                    <th className="cursor-pointer hover:text-base-content text-right" onClick={() => handleSort('count')}>Shops <SortIcon active={sortKey === 'count'} dir={sortDir} /></th>
                    <th className="cursor-pointer hover:text-base-content text-right" onClick={() => handleSort('revenue')}>Revenue <SortIcon active={sortKey === 'revenue'} dir={sortDir} /></th>
                    <th>Type Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 10 }, (_, i) => (
                      <tr key={i} className="animate-pulse">
                        {Array.from({ length: 7 }, (_, j) => <td key={j}><div className="h-3 bg-base-300 rounded" /></td>)}
                      </tr>
                    ))
                  ) : filteredSorted.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-base-content/60">No circles/sectors match your filters.</td></tr>
                  ) : (
                    filteredSorted.map((r) => (
                      <tr key={`${r.district}::${r.name}`} className="hover:bg-base-50">
                        <td>
                          <Link href={`/admin/districts/${encodeURIComponent(r.district)}`} className="link link-hover font-medium">{r.district}</Link>
                        </td>
                        <td className="font-medium">{r.name}</td>
                        <td><span className="badge badge-xs badge-ghost capitalize">{r.type}</span></td>
                        <td className="text-right tabular-nums">{r.thanas.size}</td>
                        <td className="text-right tabular-nums">{r.count}</td>
                        <td className="text-right font-mono text-xs tabular-nums">{fmt(r.revenue)}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {SHOP_TYPES.map((t) => r.byType[t] ? (
                              <span key={t} className={`badge badge-xs ${SHOP_TYPE_BADGE_CLASS[t]}`} title={SHOP_TYPE_LABELS[t]}>
                                {SHOP_TYPE_SHORT_LABEL[t]}: {r.byType[t]}
                              </span>
                            ) : null)}
                            {r.count === 0 && <span className="text-xs text-base-content/50">No shops yet</span>}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
