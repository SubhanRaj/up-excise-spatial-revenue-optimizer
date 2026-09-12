'use client';

import { useEffect, useMemo, useState } from 'react';
import { priorYearSnapshotCache, fetchFullPriorYearSnapshot, type PriorYearShop } from '@/lib/db';
import { buildFyComparisonRows, summarizeFyByType, type FyCurrentShop } from '@/lib/fy-comparison';
import { SHOP_TYPE_LABELS, SHOP_TYPES } from '@excise/schema';

const TYPE_LABEL: Record<string, string> = SHOP_TYPE_LABELS;
const fmtCr = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;

// In-depth FY 2025-26 vs. 2026-27 comparison for one district, collapsed by default on the
// district detail page. Reads the static FY 2025-26 snapshot (phase1_prior_year_snapshot, see
// CLAUDE.md's M-105 note) — cached forever in IndexedDB once loaded, on any district page.
export function FyComparisonCard({
  districtName,
  currentShops,
  excludeHbrPrv = false,
}: {
  districtName: string;
  // Already filtered by the caller when excludeHbrPrv is true — same ShopExplorer toggle, so
  // switching HBR/PRV off up there also drops them from this comparison, in both years.
  currentShops: FyCurrentShop[];
  excludeHbrPrv?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [prior, setPrior] = useState<PriorYearShop[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [onlyUnchanged, setOnlyUnchanged] = useState(false);

  useEffect(() => {
    priorYearSnapshotCache.get().then(setPrior);
  }, []);

  async function loadPriorYearData() {
    setLoading(true);
    try {
      const rows = await fetchFullPriorYearSnapshot();
      await priorYearSnapshotCache.set(rows);
      setPrior(rows);
    } finally {
      setLoading(false);
    }
  }

  // buildFyComparisonRows joins by district + shop_id — attach this page's district name to
  // each current-year row so it matches the snapshot's own districtName column.
  const currentWithDistrict = useMemo(
    () => currentShops.map((s) => ({ ...s, districtName })),
    [currentShops, districtName],
  );
  const rows = useMemo(
    () => (prior ? buildFyComparisonRows(currentWithDistrict, prior) : []),
    [currentWithDistrict, prior],
  );
  const typeStats = useMemo(() => summarizeFyByType(rows), [rows]);

  const totalPrior = rows.reduce((s, r) => s + r.priorRevenue, 0);
  const totalCurrent = rows.reduce((s, r) => s + r.currentRevenue, 0);
  const unchangedCount = rows.filter((r) => r.unchanged).length;
  const displayRows = onlyUnchanged ? rows.filter((r) => r.unchanged) : rows;

  return (
    <div className="bg-base-100 rounded-xl border border-base-200 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between p-4 hover:bg-base-200/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <p className="text-[11px] uppercase tracking-widest font-medium text-base-content/60">
          FY 2025-26 vs. 2026-27 Comparison{prior && ` (${rows.length} comparable shops)`}
          {excludeHbrPrv && <span className="badge badge-warning badge-xs ml-2 align-middle">excl. HBR &amp; PRV</span>}
        </p>
        <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-base-content/50 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>

      {open && (
        <div className="border-t border-base-200 p-4 space-y-4">
          {!prior ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-base-content/70">The FY 2025-26 reference snapshot hasn&apos;t been loaded on this device yet. It&apos;s a one-time load (~30K rows, state-wide) — after this, it never needs fetching again on any district&apos;s page.</p>
              <button className="btn btn-primary btn-sm" onClick={loadPriorYearData} disabled={loading}>
                {loading ? <span className="loading loading-spinner loading-xs" /> : 'Load Prior-Year Data'}
              </button>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-base-content/60 text-center py-4">No FY 2025-26 record for any of this district&apos;s current shop IDs — nothing to compare.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="stat bg-base-200/40 rounded-lg p-3">
                  <div className="stat-title text-[11px]">FY 2025-26 revenue</div>
                  <div className="stat-value text-lg">{fmtCr(totalPrior)}</div>
                </div>
                <div className="stat bg-base-200/40 rounded-lg p-3">
                  <div className="stat-title text-[11px]">FY 2026-27 revenue</div>
                  <div className="stat-value text-lg">{fmtCr(totalCurrent)}</div>
                </div>
                <div className="stat bg-base-200/40 rounded-lg p-3">
                  <div className="stat-title text-[11px]">Revenue change</div>
                  <div className={`stat-value text-lg ${totalCurrent >= totalPrior ? 'text-success' : 'text-error'}`}>
                    {totalCurrent >= totalPrior ? '+' : ''}{fmtCr(totalCurrent - totalPrior)}
                  </div>
                </div>
                <div className="stat bg-base-200/40 rounded-lg p-3">
                  <div className="stat-title text-[11px]">Unchanged shops</div>
                  <div className={`stat-value text-lg ${unchangedCount > 0 ? 'text-warning' : ''}`}>
                    {unchangedCount} / {rows.length}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="table table-xs w-full">
                  <thead>
                    <tr>
                      <th>Shop Type</th>
                      <th className="text-right">Comparable</th>
                      <th className="text-right">Unchanged</th>
                      <th className="text-right">FY 2025-26</th>
                      <th className="text-right">FY 2026-27</th>
                      <th className="text-right">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SHOP_TYPES.map((t) => {
                      const s = typeStats.find((x) => x.shopType === t);
                      if (!s) return null;
                      return (
                        <tr key={t}>
                          <td>{SHOP_TYPE_LABELS[t]}</td>
                          <td className="text-right tabular-nums">{s.comparableShops}</td>
                          <td className="text-right tabular-nums">{s.unchangedShops}</td>
                          <td className="text-right tabular-nums">{fmtCr(s.priorRevenue)}</td>
                          <td className="text-right tabular-nums">{fmtCr(s.currentRevenue)}</td>
                          <td className="text-right tabular-nums">
                            <span className={s.currentRevenue >= s.priorRevenue ? 'text-success' : 'text-error'}>
                              {s.currentRevenue >= s.priorRevenue ? '+' : ''}{fmtCr(s.currentRevenue - s.priorRevenue)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer select-none text-sm w-fit">
                  <input type="checkbox" className="toggle toggle-xs toggle-warning" checked={onlyUnchanged} onChange={(e) => setOnlyUnchanged(e.target.checked)} />
                  Only unchanged shops
                </label>
                <div className="overflow-auto max-h-96 mt-2 border border-base-200 rounded-lg">
                  <table className="table table-xs table-pin-rows w-full">
                    <thead className="bg-base-200 text-[11px] uppercase tracking-wide text-base-content/70">
                      <tr>
                        <th>Shop ID</th>
                        <th>Shop Name</th>
                        <th>Type</th>
                        <th className="text-right">FY 2025-26</th>
                        <th className="text-right">FY 2026-27</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((r) => (
                        <tr key={r.shopId} className={r.unchanged ? 'bg-warning/10' : undefined}>
                          <td className="font-mono">{r.shopId}</td>
                          <td className="max-w-[220px] truncate" title={r.shopName}>{r.shopName}</td>
                          <td>{TYPE_LABEL[r.shopType] ?? r.shopType}</td>
                          <td className="text-right tabular-nums">₹{r.priorRevenue.toLocaleString('en-IN')}</td>
                          <td className="text-right tabular-nums">₹{r.currentRevenue.toLocaleString('en-IN')}</td>
                          <td>{r.unchanged && <span className="badge badge-warning badge-xs">Unchanged</span>}</td>
                        </tr>
                      ))}
                      {displayRows.length === 0 && (
                        <tr><td colSpan={6} className="text-center py-6 text-base-content/50">No shops match this filter.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
