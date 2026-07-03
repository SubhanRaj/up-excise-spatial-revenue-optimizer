'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import HelpPanel from '@/app/_components/HelpPanel';
import { useAdminDistricts } from '@/hooks/useAdminDistricts';

const fmt = (n: number) => n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${n.toLocaleString('en-IN')}`;

export default function DivisionPage({ params }: { params: Promise<{ division: string }> }) {
  const { division } = use(params);
  const divName = decodeURIComponent(division);

  const router = useRouter();
  const { districts: allDistricts, loading } = useAdminDistricts();

  const districts = useMemo(() =>
    allDistricts.filter((d) => d.division === divName).sort((a, b) => b.totalRevenue - a.totalRevenue),
    [allDistricts, divName]);

  const totals = useMemo(() => ({
    vends: districts.reduce((s, d) => s + d.vendCount, 0),
    revenue: districts.reduce((s, d) => s + d.totalRevenue, 0),
    submitted: districts.filter((d) => d.status === 'submitted').length,
    inProgress: districts.filter((d) => d.status === 'in_progress').length,
  }), [districts]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex gap-3 items-center flex-wrap">
        <Link href="/admin/districts" className="btn btn-ghost btn-sm gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Districts
        </Link>
        <span className="text-base-content/50">/</span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{divName} Division</h1>
          {!loading && <p className="text-sm text-base-content/70 mt-0.5">{districts.length} districts</p>}
        </div>
        <div className="ml-auto">
          <HelpPanel pageKey={`admin_division_${divName}`} title={`${divName} Division`}>
            <p>Shows all districts that belong to the <strong>{divName}</strong> division. Click a district row to drill into its shop records.</p>
          </HelpPanel>
        </div>
      </div>

      {/* Summary cards */}
      {loading ? (
        <div className="grid md:grid-cols-4 gap-3 animate-pulse">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-20 rounded-xl bg-base-300" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Districts', value: String(districts.length) },
            { label: 'Submitted', value: `${totals.submitted} / ${districts.length}`, cls: 'text-success' },
            { label: 'Total Vends', value: totals.vends.toLocaleString() },
            { label: 'Total Revenue', value: fmt(totals.revenue), cls: 'text-primary' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-base-100 rounded-xl border border-base-200 p-4 space-y-1">
              <p className="text-[11px] uppercase tracking-widest font-medium text-base-content/60">{label}</p>
              <p className={`text-xl font-bold tabular-nums ${cls ?? 'text-base-content'}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Districts table */}
      <div className="bg-base-100 rounded-xl border border-base-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-base-200">
          <h2 className="font-semibold text-sm">Districts in {divName} Division</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="table table-sm w-full" role="grid">
            <thead className="bg-base-50 text-[11px] uppercase tracking-wide text-base-content/70">
              <tr>
                <th>District</th>
                <th>DEO</th>
                <th>Status</th>
                <th className="text-right">Vends</th>
                <th className="text-right">Revenue</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 6 }, (_, j) => <td key={j}><div className="h-3 bg-base-300 rounded" /></td>)}
                  </tr>
                ))
              ) : districts.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-base-content/60">No districts found for this division.</td></tr>
              ) : (
                districts.map((d) => (
                  <tr
                    key={d.name}
                    className="hover:bg-base-50 cursor-pointer"
                    onClick={() => router.push(`/admin/districts/${encodeURIComponent(d.name)}`)}
                  >
                    <td className="font-medium">{d.name}</td>
                    <td className="text-xs text-base-content/80">{d.deoName ?? '—'}</td>
                    <td>
                      <span className={`badge badge-sm ${d.status === 'submitted' ? 'badge-success' : d.status === 'in_progress' ? 'badge-warning' : 'badge-ghost'}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{d.vendCount.toLocaleString()}</td>
                    <td className="text-right font-mono text-xs tabular-nums">{fmt(d.totalRevenue)}</td>
                    <td><span className="btn btn-ghost btn-xs">View →</span></td>
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
