'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import HelpPanel from '@/app/_components/HelpPanel';
import { useSession } from '@/hooks/useSession';
import { deputyBasePath } from '@/lib/deputy';
import { STATUS_LABEL, statusLabel, statusBadgeClass, isLocked } from '@/lib/status';

interface DistrictRow {
  name: string; division: string | null; deoName: string | null; status: string;
  vendCount: number; totalRevenue: number; unitCount: number;
}
interface ReviewRow { verdict: string; note: string; at: number; actorName: string | null }

const fmtInr = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${n.toLocaleString('en-IN')}`;

type SortKey = 'name' | 'status' | 'unitCount' | 'vendCount' | 'totalRevenue';

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="text-base-content/40 ml-1">⇅</span>;
  return <span className="text-info ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

export default function DeputyDistrictsPage() {
  const { session } = useSession();
  const base = deputyBasePath(session?.division);
  const [districts, setDistricts] = useState<DistrictRow[]>([]);
  const [reviews, setReviews] = useState<Record<string, ReviewRow>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    let alive = true;
    (async () => {
      const [dRes, rRes] = await Promise.all([
        fetch('/api/admin/districts'),      // server-scoped to this deputy's division
        fetch('/api/deputy/reviews'),
      ]);
      if (!alive) return;
      if (dRes.ok) {
        const d = await dRes.json() as { districts: DistrictRow[] };
        setDistricts(d.districts ?? []);
      }
      if (rRes.ok) {
        const r = await rRes.json() as { reviews: Record<string, ReviewRow> };
        setReviews(r.reviews ?? {});
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'name' || k === 'status' ? 'asc' : 'desc'); }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = districts;
    if (q) r = r.filter((d) => d.name.toLowerCase().includes(q) || (d.deoName ?? '').toLowerCase().includes(q));
    if (statusFilter !== 'all') r = r.filter((d) => d.status === statusFilter);
    return [...r].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'status') cmp = a.status.localeCompare(b.status);
      else cmp = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [districts, search, statusFilter, sortKey, sortDir]);

  const division = districts[0]?.division ?? '';
  const submitted = districts.filter((d) => isLocked(d.status)).length;
  const reviewed = districts.filter((d) => reviews[d.name]).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Districts{division ? ` — ${division} Division` : ''}</h1>
          <p className="text-base-content/70 mt-1">All districts you supervise. Open one to see its shop-level figures.</p>
        </div>
        <HelpPanel pageKey="deputy_districts_list" title="Districts">
          <p>Every district in your division. The dashboard shows the same list with a map; this page adds search, a status filter, and sortable columns.</p>
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li><strong>Search</strong> — match a district or DEO name.</li>
            <li><strong>Status filter</strong> — pending, in progress, submitted, or verified.</li>
            <li><strong>Sort</strong> — click any column header.</li>
            <li><strong>Review</strong> — shows whether you have recorded a &ldquo;looks correct&rdquo; or &ldquo;flagged&rdquo; sign-off. Record one on the district page.</li>
          </ul>
        </HelpPanel>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-2 flex items-center gap-2">
          <span className="text-xs text-base-content/70">Districts</span>
          <span className="font-bold tabular-nums">{districts.length}</span>
        </div>
        <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-2 flex items-center gap-2">
          <span className="text-xs text-base-content/70">Submitted</span>
          <span className="font-bold tabular-nums text-success">{submitted}</span>
        </div>
        <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-2 flex items-center gap-2">
          <span className="text-xs text-base-content/70">Reviewed by you</span>
          <span className="font-bold tabular-nums">{reviewed}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          className="input input-bordered input-sm w-full sm:w-72"
          placeholder="Search district or DEO…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="select select-bordered select-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-base-200 bg-base-100">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('name')}>District<SortIcon active={sortKey === 'name'} dir={sortDir} /></th>
              <th>DEO</th>
              <th className="cursor-pointer select-none" onClick={() => toggleSort('status')}>Status<SortIcon active={sortKey === 'status'} dir={sortDir} /></th>
              <th className="text-right cursor-pointer select-none" onClick={() => toggleSort('unitCount')}>Circles/Sectors<SortIcon active={sortKey === 'unitCount'} dir={sortDir} /></th>
              <th className="text-right cursor-pointer select-none" onClick={() => toggleSort('vendCount')}>Shops<SortIcon active={sortKey === 'vendCount'} dir={sortDir} /></th>
              <th className="text-right cursor-pointer select-none" onClick={() => toggleSort('totalRevenue')}>Revenue<SortIcon active={sortKey === 'totalRevenue'} dir={sortDir} /></th>
              <th>Review</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && districts.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-base-content/50">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-base-content/50">No matching districts.</td></tr>
            ) : rows.map((d) => {
              const rev = reviews[d.name];
              return (
                <tr key={d.name} className="hover">
                  <td className="font-medium">{d.name}</td>
                  <td className="text-base-content/70">{d.deoName ?? '—'}</td>
                  <td><span className={`badge badge-sm ${statusBadgeClass(d.status)}`}>{statusLabel(d.status)}</span></td>
                  <td className="text-right tabular-nums">{(d.unitCount ?? 0).toLocaleString()}</td>
                  <td className="text-right tabular-nums">{d.vendCount.toLocaleString()}</td>
                  <td className="text-right font-mono text-xs">{fmtInr(d.totalRevenue)}</td>
                  <td>
                    {rev
                      ? <span className={`badge badge-sm ${rev.verdict === 'flagged' ? 'badge-error' : 'badge-success'}`}>{rev.verdict === 'flagged' ? 'Flagged' : 'Reviewed'}</span>
                      : <span className="text-base-content/40 text-xs">—</span>}
                  </td>
                  <td><Link href={`${base}/districts/${encodeURIComponent(d.name)}`} className="btn btn-ghost btn-xs">View →</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
