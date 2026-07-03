'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import HelpPanel from '@/app/_components/HelpPanel';
import { useAdminDistricts } from '@/hooks/useAdminDistricts';
import type { AdminDistrictRow as DistrictRow } from '@/hooks/useAdminDistricts';

const fmt = (n: number) => n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${n.toLocaleString('en-IN')}`;
const fmtCoord = (n: number) => n.toFixed(4);

type SortKey = 'name' | 'division' | 'status' | 'vendCount' | 'totalRevenue';

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="text-base-content/20 ml-1">⇅</span>;
  return <span className="text-info ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

export default function DistrictsPage() {
  const { districts, loading } = useAdminDistricts();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [divFilter, setDivFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const divisions = useMemo(() =>
    Array.from(new Set(districts.map((d) => d.division).filter(Boolean) as string[])).sort(),
    [districts]);

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    let out = districts.filter((d) => {
      if (q && !d.name.toLowerCase().includes(q) && !(d.division ?? '').toLowerCase().includes(q) && !(d.deoName ?? '').toLowerCase().includes(q) && !(d.deoEmail ?? '').toLowerCase().includes(q)) return false;
      if (divFilter !== 'all' && d.division !== divFilter) return false;
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      const av = a[sortKey] ?? '', bv = b[sortKey] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return out;
  }, [districts, search, divFilter, statusFilter, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const totals = useMemo(() => ({
    vends: rows.reduce((s, r) => s + r.vendCount, 0),
    revenue: rows.reduce((s, r) => s + r.totalRevenue, 0),
    submitted: rows.filter((r) => r.status === 'submitted').length,
  }), [rows]);


  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">All Districts</h1>
          <p className="text-sm text-base-content/50 mt-0.5">Complete registry of all 75 Uttar Pradesh districts. Select a district to view its shop-level records.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn btn-sm btn-outline gap-1" onClick={refresh} disabled={loading}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
            Sync from Server
          </button>
          <HelpPanel pageKey="admin_districts_list" title="All Districts">
            <p>Full list of all 75 UP districts. Filter by division or status. Click a district row to open its shop-level detail view.</p>
            <ul className="list-disc list-inside space-y-1 mt-1">
              <li><strong>Division filter</strong> — narrow to a single division.</li>
              <li><strong>Status filter</strong> — pending, in_progress, or submitted.</li>
              <li><strong>Sort</strong> — click any column header.</li>
            </ul>
          </HelpPanel>
        </div>
      </div>

      {/* Stat chips */}
      {!loading && (
        <div className="flex flex-wrap gap-3">
          <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-2 flex items-center gap-2">
            <span className="text-xs text-base-content/50">Showing</span>
            <span className="font-bold tabular-nums">{rows.length}</span>
            <span className="text-xs text-base-content/50">of 75 districts</span>
          </div>
          <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-2 flex items-center gap-2">
            <span className="text-xs text-base-content/50">Submitted</span>
            <span className="font-bold text-success tabular-nums">{totals.submitted}</span>
          </div>
          <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-2 flex items-center gap-2">
            <span className="text-xs text-base-content/50">Total vends</span>
            <span className="font-bold tabular-nums">{totals.vends.toLocaleString()}</span>
          </div>
          <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-2 flex items-center gap-2">
            <span className="text-xs text-base-content/50">Total revenue</span>
            <span className="font-bold text-primary tabular-nums">{fmt(totals.revenue)}</span>
          </div>
        </div>
      )}

      {/* Table card */}
      <div className="bg-base-100 rounded-xl border border-base-200 overflow-hidden">
        {/* Toolbar */}
        <div className={`flex flex-wrap gap-3 items-center p-4 border-b border-base-200 ${loading ? 'pointer-events-none opacity-50' : ''}`}>
          <div className="relative flex-1 min-w-[200px]">
            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search district, division, DEO name or email…"
              className="input input-sm input-bordered w-full pl-8 bg-base-100"
            />
          </div>
          <select className="select select-sm select-bordered bg-base-100" value={divFilter} onChange={(e) => setDivFilter(e.target.value)}>
            <option value="all">All Divisions</option>
            {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="select select-sm select-bordered bg-base-100" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="submitted">Submitted</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="table table-sm w-full" role="grid">
            <thead className="bg-base-50 text-[11px] uppercase tracking-wide text-base-content/50">
              <tr>
                <th className="cursor-pointer hover:text-base-content" onClick={() => handleSort('name')}>
                  District <SortIcon active={sortKey === 'name'} dir={sortDir} />
                </th>
                <th className="cursor-pointer hover:text-base-content" onClick={() => handleSort('division')}>
                  Division <SortIcon active={sortKey === 'division'} dir={sortDir} />
                </th>
                <th>DEO</th>
                <th>Coords</th>
                <th className="cursor-pointer hover:text-base-content" onClick={() => handleSort('status')}>
                  Status <SortIcon active={sortKey === 'status'} dir={sortDir} />
                </th>
                <th className="cursor-pointer hover:text-base-content text-right" onClick={() => handleSort('vendCount')}>
                  Vends <SortIcon active={sortKey === 'vendCount'} dir={sortDir} />
                </th>
                <th className="cursor-pointer hover:text-base-content text-right" onClick={() => handleSort('totalRevenue')}>
                  Revenue <SortIcon active={sortKey === 'totalRevenue'} dir={sortDir} />
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }, (_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 8 }, (_, j) => (
                      <td key={j}><div className="h-3 bg-base-300 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-base-content/40">No districts match your filters.</td></tr>
              ) : (
                rows.map((d) => (
                  <tr key={d.name} className="hover:bg-base-50 cursor-pointer" onClick={() => router.push(`/admin/districts/${encodeURIComponent(d.name)}`)}>
                    <td className="font-medium">{d.name}</td>
                    <td>
                      {d.division
                        ? <Link href={`/admin/divisions/${encodeURIComponent(d.division)}`} onClick={(e) => e.stopPropagation()} className="badge badge-sm badge-ghost hover:badge-primary transition-colors cursor-pointer">{d.division}</Link>
                        : <span className="text-base-content/30">—</span>}
                    </td>
                    <td>
                      <div className="text-xs font-medium">{d.deoName ?? <span className="text-base-content/30">—</span>}</div>
                    </td>
                    <td className="font-mono text-[11px] text-base-content/50 whitespace-nowrap">
                      {d.centerLat != null && d.centerLon != null
                        ? <>{fmtCoord(d.centerLat)}°N<br />{fmtCoord(d.centerLon)}°E</>
                        : <span className="text-base-content/20">—</span>}
                    </td>
                    <td>
                      <span className={`badge badge-sm ${d.status === 'submitted' ? 'badge-success' : d.status === 'in_progress' ? 'badge-warning' : 'badge-ghost'}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{d.vendCount.toLocaleString()}</td>
                    <td className="text-right font-mono text-xs tabular-nums">{fmt(d.totalRevenue)}</td>
                    <td>
                      <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); router.push(`/admin/districts/${encodeURIComponent(d.name)}`); }}>View →</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
