'use client';

import { useEffect, useMemo, useState } from 'react';
import HelpPanel from '@/app/_components/HelpPanel';
import { useAdminExportData } from '@/hooks/useAdminExportData';
import { priorYearSnapshotCache, fetchFullPriorYearSnapshot, type PriorYearShop } from '@/lib/db';

const rowKey = (district: string, shopId: string) => `${district}::${shopId}`;

interface ComparisonRow {
  district: string;
  shopId: string;
  shopName: string;
  shopType: string;
  priorRevenue: number;
  currentRevenue: number;
  unchanged: boolean;
}

const fmtMoney = (n: number) => `₹${n.toLocaleString('en-IN')}`;

// Cross-checks this year's (FY 2026-27) uploaded shop data against the FY 2025-26 snapshot
// (phase1_prior_year_snapshot — a one-time load from the local pre-cleanup clone, see
// scripts/export-prior-year-snapshot.py) to catch a DEO re-uploading last year's unchanged
// prefilled Excel instead of entering this year's actual lifting revenue (CLAUDE.md's Revenue
// Formulas note). Both datasets are static once fetched, so both are cached in IndexedDB and
// this page never re-fetches either on its own — an admin clicks a button once per dataset.
export default function FyComparisonPage() {
  const { data: current, loading: currentLoading, syncing: currentSyncing, sync: syncCurrent } = useAdminExportData();
  const [prior, setPrior] = useState<PriorYearShop[] | null>(null);
  const [priorLoading, setPriorLoading] = useState(true);
  const [loadingPrior, setLoadingPrior] = useState(false);
  const [district, setDistrict] = useState('all');
  const [onlyUnchanged, setOnlyUnchanged] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    priorYearSnapshotCache.get().then((rows) => {
      setPrior(rows);
      setPriorLoading(false);
    });
  }, []);

  async function loadPriorYearData() {
    setLoadingPrior(true);
    try {
      const rows = await fetchFullPriorYearSnapshot();
      await priorYearSnapshotCache.set(rows);
      setPrior(rows);
    } finally {
      setLoadingPrior(false);
    }
  }

  const priorByKey = useMemo(() => {
    const m = new Map<string, PriorYearShop>();
    if (prior) for (const r of prior) m.set(rowKey(r.districtName, r.shopId), r);
    return m;
  }, [prior]);

  const rows = useMemo((): ComparisonRow[] => {
    if (!current || !prior) return [];
    const out: ComparisonRow[] = [];
    for (const s of current.rows) {
      const district = s.districtName ?? '';
      const p = priorByKey.get(rowKey(district, s.shopId));
      if (!p) continue; // no FY 2025-26 record for this shop_id in this district — nothing to compare
      out.push({
        district,
        shopId: s.shopId,
        shopName: s.shopName,
        shopType: s.shopType,
        priorRevenue: p.totalRevenue,
        currentRevenue: s.totalRevenue,
        unchanged: p.totalRevenue === s.totalRevenue,
      });
    }
    return out;
  }, [current, prior, priorByKey]);

  const districtStats = useMemo(() => {
    const m = new Map<string, { total: number; unchanged: number }>();
    for (const r of rows) {
      const e = m.get(r.district) ?? { total: 0, unchanged: 0 };
      e.total += 1;
      if (r.unchanged) e.unchanged += 1;
      m.set(r.district, e);
    }
    return Array.from(m.entries())
      .map(([district, s]) => ({ district, ...s, pct: s.total ? (s.unchanged / s.total) * 100 : 0 }))
      .sort((a, b) => b.pct - a.pct);
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (district !== 'all' && r.district !== district) return false;
      if (onlyUnchanged && !r.unchanged) return false;
      if (q && !r.shopId.toLowerCase().includes(q) && !r.shopName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, district, onlyUnchanged, search]);

  const totalUnchanged = rows.filter((r) => r.unchanged).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">FY Comparison — 2025-26 vs. 2026-27</h1>
          <p className="text-base-content/70 mt-1">Find shops whose FY 2026-27 revenue exactly matches last year&apos;s figure — a sign of an unchanged, re-uploaded old file</p>
        </div>
        <HelpPanel pageKey="admin_fy_comparison" title="FY Comparison">
          <p>Compares this year&apos;s uploaded revenue per shop against a one-time snapshot of FY 2025-26 data (taken before the M-101 cleanup). A shop whose revenue is <b>identical</b> across both years usually means the DEO reused an old prefilled Excel file instead of entering this year&apos;s actual lifting figures.</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>Both datasets are static once loaded on this device — loading either is a one-time action, never repeated automatically.</li>
            <li>The current-year data comes from the same cache <b>Sync All</b> (navbar) and the Export page populate.</li>
            <li>Sort districts by % unchanged to prioritize who to call.</li>
          </ul>
        </HelpPanel>
      </div>

      {(priorLoading || currentLoading) ? (
        <div className="text-center py-12 text-base-content/50">Loading…</div>
      ) : !prior ? (
        <div className="bg-base-100 rounded-2xl border border-base-200 p-8 text-center space-y-3">
          <p className="text-base-content/70">The FY 2025-26 reference snapshot hasn&apos;t been loaded on this device yet. It&apos;s a one-time load (~30K rows) — after this, it never needs fetching again.</p>
          <button className="btn btn-primary btn-sm" onClick={loadPriorYearData} disabled={loadingPrior}>
            {loadingPrior ? <span className="loading loading-spinner loading-xs" /> : 'Load Prior-Year Data'}
          </button>
        </div>
      ) : !current ? (
        <div className="bg-base-100 rounded-2xl border border-base-200 p-8 text-center space-y-3">
          <p className="text-base-content/70">No current-year shop data cached yet. Click <b>Sync All</b> in the navbar, or sync just this dataset below.</p>
          <button className="btn btn-primary btn-sm" onClick={() => void syncCurrent()} disabled={currentSyncing}>
            {currentSyncing ? <span className="loading loading-spinner loading-xs" /> : 'Sync Current-Year Data'}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="stat bg-base-100 rounded-2xl shadow p-4">
              <div className="stat-title text-xs">Shops comparable</div>
              <div className="stat-value text-2xl">{rows.length.toLocaleString()}</div>
            </div>
            <div className="stat bg-base-100 rounded-2xl shadow p-4">
              <div className="stat-title text-xs">Unchanged revenue</div>
              <div className="stat-value text-2xl text-warning">{totalUnchanged.toLocaleString()}</div>
            </div>
            <div className="stat bg-base-100 rounded-2xl shadow p-4">
              <div className="stat-title text-xs">FY 2025-26 snapshot size</div>
              <div className="stat-value text-2xl">{prior.length.toLocaleString()}</div>
            </div>
          </div>

          <div className="bg-base-100 rounded-2xl border border-base-200 overflow-hidden">
            <p className="text-[11px] uppercase tracking-widest font-medium text-base-content/60 px-4 pt-4">Districts by % unchanged</p>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>District</th>
                    <th className="text-right">Comparable shops</th>
                    <th className="text-right">Unchanged</th>
                    <th className="text-right">% unchanged</th>
                  </tr>
                </thead>
                <tbody>
                  {districtStats.map((d) => (
                    <tr key={d.district} className="cursor-pointer hover:bg-base-200/40" onClick={() => setDistrict(d.district)}>
                      <td className="font-medium">{d.district}</td>
                      <td className="text-right tabular-nums">{d.total}</td>
                      <td className="text-right tabular-nums">{d.unchanged}</td>
                      <td className="text-right tabular-nums">
                        <span className={d.pct >= 50 ? 'text-error font-semibold' : d.pct > 0 ? 'text-warning' : ''}>
                          {d.pct.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {districtStats.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-8 text-base-content/50">No overlapping shops between the two datasets yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-base-100 rounded-2xl border border-base-200 overflow-hidden">
            <div className="flex flex-wrap gap-3 items-center p-4 border-b border-base-200">
              <select className="select select-sm select-bordered bg-base-100" value={district} onChange={(e) => setDistrict(e.target.value)}>
                <option value="all">All Districts</option>
                {districtStats.map((d) => <option key={d.district} value={d.district}>{d.district}</option>)}
              </select>
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                <input type="checkbox" className="toggle toggle-xs toggle-warning" checked={onlyUnchanged} onChange={(e) => setOnlyUnchanged(e.target.checked)} />
                Only unchanged
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search shop ID or name…"
                className="input input-sm input-bordered bg-base-100 flex-1 min-w-[180px]"
              />
            </div>
            <div className="px-4 py-2 bg-base-50 border-b border-base-200 text-xs text-base-content/70">
              Showing <strong>{filtered.length.toLocaleString()}</strong> of <strong>{rows.length.toLocaleString()}</strong> comparable shops
            </div>
            <div className="overflow-auto max-h-[calc(100vh-350px)]">
              <table className="table table-xs table-pin-rows w-full">
                <thead className="bg-base-200 text-[11px] uppercase tracking-wide text-base-content/70">
                  <tr>
                    <th>District</th>
                    <th>Shop ID</th>
                    <th>Shop Name</th>
                    <th className="text-right">FY 2025-26</th>
                    <th className="text-right">FY 2026-27</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 2000).map((r) => (
                    <tr key={rowKey(r.district, r.shopId)} className={r.unchanged ? 'bg-warning/10' : undefined}>
                      <td>{r.district}</td>
                      <td className="font-mono text-xs">{r.shopId}</td>
                      <td className="max-w-[220px] truncate" title={r.shopName}>{r.shopName}</td>
                      <td className="text-right tabular-nums">{fmtMoney(r.priorRevenue)}</td>
                      <td className="text-right tabular-nums">{fmtMoney(r.currentRevenue)}</td>
                      <td>{r.unchanged && <span className="badge badge-warning badge-xs">Unchanged</span>}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-12 text-base-content/50">No shops match your filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {filtered.length > 2000 && (
              <p className="px-4 py-2 text-xs text-base-content/60 border-t border-base-200">Showing first 2,000 rows — narrow with a district or search.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
