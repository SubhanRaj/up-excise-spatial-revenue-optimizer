'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import HelpPanel from '@/app/_components/HelpPanel';
import { useCircleReorgData } from '@/hooks/useCircleReorgData';
import { useAdminExportData } from '@/hooks/useAdminExportData';
import { generateCircleReorgReport } from '@/lib/excel';

type SortKey = 'district' | 'currentCircleCount' | 'proposedCircleCount' | 'currentDeviation' | 'proposedDeviation' | 'improvement' | 'shopsMoved';

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="text-base-content/40 ml-1">⇅</span>;
  return <span className="text-info ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const improvement = (d: { currentDeviation: number; proposedDeviation: number }) => d.currentDeviation - d.proposedDeviation;

// File-local ambient, not `declare global` — Chart.js is a CDN global (see CLAUDE.md's Frontend
// CDN Stack table); the admin overview page separately declares the same shape as `declare
// global`, but this file follows the same file-local convention its own Leaflet block uses.
declare const Chart: { new (ctx: CanvasRenderingContext2D, config: unknown): { destroy: () => void } };

export default function CircleReorgPage() {
  const { data, loading, syncing, sync } = useCircleReorgData();
  const { data: exportData, sync: syncExport } = useAdminExportData();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('district');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [exporting, setExporting] = useState(false);

  async function exportReport() {
    if (!data) return;
    setExporting(true);
    try {
      const shopData = exportData ?? await syncExport();
      const blob = await generateCircleReorgReport(shopData.rows, data.districts, data.thanas, data.circles);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Circle-Reorganization-Proposal-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  }

  const rows = useMemo(() => {
    if (!data) return [];
    const filtered = data.districts.filter((d) =>
      !search || d.districtName.toLowerCase().includes(search.toLowerCase()));
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'district') cmp = a.districtName.localeCompare(b.districtName);
      else if (sortKey === 'improvement') cmp = improvement(a) - improvement(b);
      else cmp = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [data, search, sortKey, sortDir]);

  const totals = useMemo(() => {
    if (!data) return null;
    return {
      districts: data.districts.length,
      currentCircles: data.districts.reduce((s, d) => s + d.currentCircleCount, 0),
      proposedCircles: data.districts.reduce((s, d) => s + d.proposedCircleCount, 0),
      shopsMoved: data.districts.reduce((s, d) => s + d.shopsMoved, 0),
      optimizedCount: data.districts.filter((d) => d.optimized === 'Yes').length,
    };
  }, [data]);

  const chartRefs = { split: useRef<HTMLCanvasElement>(null), improve: useRef<HTMLCanvasElement>(null) };
  const chartInstances = useRef<{ destroy: () => void }[]>([]);

  useEffect(() => {
    chartInstances.current.forEach((c) => c.destroy());
    chartInstances.current = [];
    if (!data || typeof Chart === 'undefined') return;

    if (chartRefs.split.current) {
      const no = data.districts.length - (totals?.optimizedCount ?? 0);
      chartInstances.current.push(new Chart(chartRefs.split.current.getContext('2d')!, {
        type: 'doughnut',
        data: {
          labels: ['More equitable under the proposal', 'Not improved'],
          datasets: [{ data: [totals?.optimizedCount ?? 0, no], backgroundColor: ['#16a34a', '#94a3b8'] }],
        },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
      }));
    }

    if (chartRefs.improve.current) {
      const top = [...data.districts].sort((a, b) => improvement(b) - improvement(a)).slice(0, 15);
      chartInstances.current.push(new Chart(chartRefs.improve.current.getContext('2d')!, {
        type: 'bar',
        data: {
          labels: top.map((d) => d.districtName),
          datasets: [{
            label: 'Deviation reduced (percentage points)',
            data: top.map((d) => +(improvement(d) * 100).toFixed(1)),
            backgroundColor: top.map((d) => (improvement(d) >= 0 ? '#16a34a' : '#dc2626')),
          }],
        },
        options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } } },
      }));
    }

    return () => { chartInstances.current.forEach((c) => c.destroy()); chartInstances.current = []; };
  }, [data]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Circle Reorganization Proposal</h1>
          <p className="text-sm text-base-content/70 mt-0.5">Additional Excise Commissioner&apos;s proposed circle/sector re-carving — for HQ review only.</p>
        </div>
        <div className="ml-auto">
          <HelpPanel pageKey="admin_circle_reorg" title="Circle Reorganization Proposal">
            <p>This is a proposal. It has not been approved, and nothing here changes any district&apos;s live circles/sectors or shop assignments.</p>
            <p className="mt-2 font-semibold">Conditions the proposal was built against:</p>
            <ol className="list-decimal list-inside space-y-1 mt-1">
              <li>All circles/sectors of a district lie entirely within that district.</li>
              <li>Each circle/sector is a single contiguous area.</li>
              <li>Net creation and deletion of circles across the state is zero.</li>
              <li>A thana lies wholly within one circle; a circle can hold several thanas.</li>
              <li>Circle revenue within a district: target within ±25%, may be relaxed to ±30%.</li>
              <li>Objective: circles as equitable as possible, and more equitable than now.</li>
            </ol>
          </HelpPanel>
        </div>
      </div>

      {!loading && !data ? (
        <div className="bg-base-100 rounded-xl border border-base-200 p-6 text-center text-sm text-base-content/70 space-y-3">
          <p>Proposal data not loaded on this device yet.</p>
          <button className="btn btn-primary btn-sm" onClick={() => void sync()} disabled={syncing}>
            {syncing && <span className="loading loading-spinner loading-xs" />}
            Load Proposal Data
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-2 flex items-center gap-2">
              <span className="text-xs text-base-content/70">Districts</span>
              <span className="font-bold tabular-nums">{totals?.districts}</span>
            </div>
            <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-2 flex items-center gap-2">
              <span className="text-xs text-base-content/70">Circles (current → proposed)</span>
              <span className="font-bold tabular-nums">{totals?.currentCircles} → {totals?.proposedCircles}</span>
            </div>
            <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-2 flex items-center gap-2">
              <span className="text-xs text-base-content/70">Districts more equitable</span>
              <span className="font-bold tabular-nums">{totals?.optimizedCount} / {totals?.districts}</span>
            </div>
            <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-2 flex items-center gap-2">
              <span className="text-xs text-base-content/70">Shops re-assigned statewide</span>
              <span className="font-bold tabular-nums">{totals?.shopsMoved.toLocaleString()}</span>
            </div>
            <button className="btn btn-primary btn-sm gap-1 ml-auto" onClick={() => void exportReport()} disabled={exporting}>
              {exporting && <span className="loading loading-spinner loading-xs" />}
              Export Proposed Excel
            </button>
            <button className="btn btn-ghost btn-xs gap-1" onClick={() => void sync()} disabled={syncing} title="Reload proposal data">
              {syncing ? <span className="loading loading-spinner loading-xs" /> : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
              )}
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-base-100 rounded-xl border border-base-200 p-4">
              <div className="font-semibold text-sm mb-2">Districts More Equitable Under the Proposal</div>
              <div style={{ height: 300 }}>
                <canvas ref={chartRefs.split} aria-label="Districts optimized vs not doughnut chart" />
              </div>
            </div>
            <div className="bg-base-100 rounded-xl border border-base-200 p-4">
              <div className="font-semibold text-sm mb-2">Revenue Deviation Improvement — Top 15 Districts</div>
              <div style={{ height: 450 }}>
                <canvas ref={chartRefs.improve} aria-label="Deviation improvement bar chart" />
              </div>
            </div>
          </div>

          <div className="bg-base-100 rounded-xl border border-base-200 overflow-hidden">
            <div className="p-4 border-b border-base-200">
              <input
                type="text"
                placeholder="Search district…"
                className="input input-sm input-bordered w-full max-w-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="table table-fixed w-full">
                <colgroup>
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="cursor-pointer select-none" onClick={() => toggleSort('district')}>District <SortIcon active={sortKey === 'district'} dir={sortDir} /></th>
                    <th className="cursor-pointer select-none text-right" onClick={() => toggleSort('currentCircleCount')}>Current <SortIcon active={sortKey === 'currentCircleCount'} dir={sortDir} /></th>
                    <th className="cursor-pointer select-none text-right" onClick={() => toggleSort('proposedCircleCount')}>Proposed <SortIcon active={sortKey === 'proposedCircleCount'} dir={sortDir} /></th>
                    <th className="cursor-pointer select-none text-right" onClick={() => toggleSort('currentDeviation')}>Deviation (now) <SortIcon active={sortKey === 'currentDeviation'} dir={sortDir} /></th>
                    <th className="cursor-pointer select-none text-right" onClick={() => toggleSort('proposedDeviation')}>Deviation (proposed) <SortIcon active={sortKey === 'proposedDeviation'} dir={sortDir} /></th>
                    <th className="cursor-pointer select-none text-right" onClick={() => toggleSort('improvement')}>Improvement <SortIcon active={sortKey === 'improvement'} dir={sortDir} /></th>
                    <th className="cursor-pointer select-none text-right" onClick={() => toggleSort('shopsMoved')}>Shops Moved <SortIcon active={sortKey === 'shopsMoved'} dir={sortDir} /></th>
                    <th>More Equitable?</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => {
                    const imp = improvement(d);
                    return (
                      <tr key={d.districtName} className="hover">
                        <td>
                          <Link href={`/admin/circle-reorg/${encodeURIComponent(d.districtName)}`} className="link link-primary font-medium">
                            {d.districtName}
                          </Link>
                        </td>
                        <td className="text-right tabular-nums">{d.currentCircleCount}</td>
                        <td className="text-right tabular-nums">{d.proposedCircleCount}</td>
                        <td className="text-right tabular-nums">{pct(d.currentDeviation)}</td>
                        <td className="text-right tabular-nums">{pct(d.proposedDeviation)}</td>
                        <td className={`text-right tabular-nums font-medium ${imp > 0 ? 'text-success' : imp < 0 ? 'text-error' : ''}`}>
                          {imp > 0 ? '↓ ' : imp < 0 ? '↑ ' : ''}{pct(Math.abs(imp))}
                        </td>
                        <td className="text-right tabular-nums">{d.shopsMoved.toLocaleString()}</td>
                        <td>
                          <span className={`badge badge-sm ${d.optimized === 'Yes' ? 'badge-success' : 'badge-ghost'}`}>{d.optimized}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
