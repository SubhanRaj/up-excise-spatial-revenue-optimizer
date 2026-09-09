'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import HelpPanel from '@/app/_components/HelpPanel';
import { useAdminDistricts } from '@/hooks/useAdminDistricts';
import { statusLabel, statusBadgeClass, isLocked } from '@/lib/status';

const fmt = (n: number) => n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${n.toLocaleString('en-IN')}`;

export default function DivisionPage({ params }: { params: Promise<{ division: string }> }) {
  const { division } = use(params);
  const divName = decodeURIComponent(division);

  const router = useRouter();
  const { districts: allDistricts, divisionLocks, loading, refresh } = useAdminDistricts();

  const districts = useMemo(() =>
    allDistricts.filter((d) => d.division === divName).sort((a, b) => b.totalRevenue - a.totalRevenue),
    [allDistricts, divName]);

  const lock = divisionLocks.find((l) => l.division === divName) ?? null;

  const totals = useMemo(() => ({
    vends: districts.reduce((s, d) => s + d.vendCount, 0),
    revenue: districts.reduce((s, d) => s + d.totalRevenue, 0),
    submitted: districts.filter((d) => isLocked(d.status)).length,
    inProgress: districts.filter((d) => d.status === 'in_progress').length,
    verified: districts.filter((d) => d.status === 'verified').length,
    signedOff: districts.filter((d) => d.deputyReview?.verdict === 'ok').length,
    flagged: districts.filter((d) => d.deputyReview?.verdict === 'flagged').length,
  }), [districts]);

  async function unlockDivision() {
    const Swal = (window as unknown as { Swal?: { fire: (o: Record<string, unknown>) => Promise<{ isConfirmed: boolean; value?: string }> } }).Swal;
    const res = await Swal?.fire({
      icon: 'warning',
      title: `Unlock the ${divName} division?`,
      html: 'The Deputy Excise Commissioner locked this division. Unlocking lets DEOs in it request corrections again. A note is required.',
      input: 'textarea', inputPlaceholder: 'Reason (required)',
      inputValidator: (v: string) => (!v || !v.trim() ? 'A note is required' : undefined),
      showCancelButton: true, confirmButtonText: 'Unlock division', confirmButtonColor: '#dc2626',
    });
    if (!res?.isConfirmed) return;
    const r = await fetch(`/api/admin/divisions/${encodeURIComponent(divName)}/lock`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: res.value ?? '' }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({})) as { error?: string };
      await Swal?.fire({ icon: 'error', title: 'Could not unlock', text: e.error ?? 'Please try again.' });
      return;
    }
    await refresh();
    void Swal?.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Division unlocked.', showConfirmButton: false, timer: 2500, timerProgressBar: true });
  }

  const fmtDate = (ms: number) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(ms));

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

      {/* Deputy review / division lock */}
      {!loading && (
        <div className={`rounded-xl border p-4 ${lock ? 'bg-info/10 border-info/30' : 'bg-base-100 border-base-200'}`}>
          {lock ? (
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  Locked by the Deputy Excise Commissioner
                </p>
                <p className="text-sm text-base-content/70 mt-1">
                  {fmtDate(lock.lockedAt)} · {lock.lockedBy}
                  {lock.note ? <span className="block mt-0.5">Note: {lock.note}</span> : null}
                </p>
                <p className="text-xs text-base-content/50 mt-1">DEOs in this division cannot self-request corrections while it is locked.</p>
              </div>
              <button className="btn btn-sm btn-outline btn-error" onClick={unlockDivision}>Unlock division</button>
            </div>
          ) : (
            <div>
              <p className="font-semibold text-sm">Deputy review progress</p>
              <p className="text-sm text-base-content/70 mt-1">
                {totals.verified} of {districts.length} DEO-verified · {totals.signedOff} signed off by the Deputy
                {totals.flagged > 0 && <span className="text-error"> · {totals.flagged} flagged</span>}
              </p>
              <p className="text-xs text-base-content/50 mt-1">The Deputy locks this division once every district is verified and signed off.</p>
            </div>
          )}
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
                <th>Deputy Review</th>
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
                <tr><td colSpan={7} className="text-center py-12 text-base-content/60">No districts found for this division.</td></tr>
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
                      <span className={`badge badge-sm ${statusBadgeClass(d.status)}`}>
                        {statusLabel(d.status)}
                      </span>
                    </td>
                    <td>
                      {d.deputyReview ? (
                        <span
                          className={`badge badge-sm ${d.deputyReview.verdict === 'flagged' ? 'badge-error' : 'badge-success'}`}
                          title={d.deputyReview.note || undefined}
                        >
                          {d.deputyReview.verdict === 'flagged' ? 'Flagged' : 'Looks correct'}
                        </span>
                      ) : (
                        <span className="text-base-content/40 text-xs">—</span>
                      )}
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
