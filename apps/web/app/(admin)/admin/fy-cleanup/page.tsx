'use client';

import { useState } from 'react';
import HelpPanel from '@/app/_components/HelpPanel';
import { useAdminDistricts } from '@/hooks/useAdminDistricts';
import { adminDistrictsCache } from '@/lib/db';
import { statusLabel, statusBadgeClass } from '@/lib/status';

type SwalG = {
  fire: (o: Record<string, unknown>) => Promise<{ isConfirmed: boolean; value?: { reason: string } }>;
  showValidationMessage: (m: string) => void;
};

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

export default function FyCleanupPage() {
  const { districts, loading, refresh } = useAdminDistricts();
  const [busy, setBusy] = useState<string | null>(null);

  const cleared = districts.filter((d) => d.fyDataClearedAt != null);
  const toClear = districts.filter((d) => d.fyDataClearedAt == null && d.vendCount > 0);

  async function clearFyData(name: string, vendCount: number) {
    const Swal = (window as unknown as { Swal?: SwalG }).Swal;
    const first = await Swal?.fire({
      icon: 'warning',
      title: `Clear FY 2026-27 data for ${name}?`,
      html: `<p>This permanently deletes all <b>${vendCount.toLocaleString()}</b> uploaded shop record(s) for <b>${name}</b> so the DEO can re-enter <b>FY 2025-26</b> figures. It does <b>not</b> touch registered circles/sectors, the DEO's account, or the audit log. The district's status resets to <b>Pending</b>.</p>
             <p style="margin-top:8px"><b>This is one-time only</b> — once cleared, this district cannot be cleared again from this page.</p>`,
      showCancelButton: true,
      confirmButtonText: 'Continue',
      confirmButtonColor: '#dc2626',
    });
    if (!first?.isConfirmed) return;

    const second = await Swal?.fire({
      title: 'Type to confirm',
      html: `<p style="text-align:left">Type <b>${name}</b> below and give a reason.</p>
             <input id="fy-confirm-name" class="swal2-input" placeholder="${name}" autocomplete="off">
             <textarea id="fy-confirm-reason" class="swal2-textarea" placeholder="Reason (required)"></textarea>`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Clear FY 2026-27 Data',
      confirmButtonColor: '#dc2626',
      preConfirm: () => {
        const typedName = (document.getElementById('fy-confirm-name') as HTMLInputElement | null)?.value.trim() ?? '';
        const reason = (document.getElementById('fy-confirm-reason') as HTMLTextAreaElement | null)?.value.trim() ?? '';
        if (typedName !== name) { Swal?.showValidationMessage(`Type the district name exactly: ${name}`); return false; }
        if (!reason) { Swal?.showValidationMessage('Please enter a reason.'); return false; }
        return { reason };
      },
    });
    if (!second?.isConfirmed || !second.value) return;

    setBusy(name);
    try {
      const res = await fetch(`/api/admin/districts/${encodeURIComponent(name)}/clear-fy-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: second.value.reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        await Swal?.fire({ icon: 'error', title: 'Could not clear', text: err.error ?? 'Please try again.' });
        return;
      }
      adminDistrictsCache.invalidate();
      await refresh();
      void Swal?.fire({
        toast: true, position: 'top-end', icon: 'success', title: `FY 2026-27 data cleared for ${name}.`,
        showConfirmButton: false, timer: 3000, timerProgressBar: true,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">FY 2026-27 Data Cleanup</h1>
          <p className="text-base-content/70 mt-1">Clear shop data entered for the wrong financial year, one district at a time</p>
        </div>
        <HelpPanel pageKey="admin_fy_cleanup" title="FY 2026-27 Data Cleanup">
          <p>Some districts uploaded shop and revenue data for FY 2026-27 (the current year). Phase 1 collects <b>FY 2025-26</b> — the previous, closed year. This page clears the wrong-year data so those DEOs can re-enter correct figures.</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>Clearing deletes only the shop records. Registered circles/sectors, the DEO&apos;s account and CUG, the district and DEO name, and the audit log are all kept.</li>
            <li>The district resets to <b>Pending</b>. The DEO downloads a fresh validated template on their Upload page and re-enters FY 2025-26 data.</li>
            <li><b>One-time per district.</b> Once cleared, the button greys out so a re-entered dataset can&apos;t be wiped again. For an ordinary bad upload, use &ldquo;Delete Shop Data&rdquo; on the district page instead.</li>
            <li>Every clear is written to the audit log with your name and the reason you give.</li>
          </ul>
        </HelpPanel>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="stat bg-base-100 rounded-2xl shadow p-4">
          <div className="stat-title text-xs">Districts cleared</div>
          <div className="stat-value text-2xl">{cleared.length}</div>
        </div>
        <div className="stat bg-base-100 rounded-2xl shadow p-4">
          <div className="stat-title text-xs">Still holding data</div>
          <div className="stat-value text-2xl text-warning">{toClear.length}</div>
        </div>
        <div className="stat bg-base-100 rounded-2xl shadow p-4">
          <div className="stat-title text-xs">Total districts</div>
          <div className="stat-value text-2xl">{districts.length}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-base-200 bg-base-100">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>District</th>
              <th>DEO</th>
              <th>Division</th>
              <th className="text-right">Shops</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && districts.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-base-content/50">Loading…</td></tr>
            ) : districts.map((d) => (
              <tr key={d.name}>
                <td className="font-medium">{d.name}</td>
                <td className="text-base-content/70">{d.deoName ?? '—'}</td>
                <td className="text-base-content/70">{d.division ?? '—'}</td>
                <td className="text-right tabular-nums">{d.vendCount.toLocaleString()}</td>
                <td><span className={`badge badge-sm ${statusBadgeClass(d.status)}`}>{statusLabel(d.status)}</span></td>
                <td>
                  {d.fyDataClearedAt != null ? (
                    <span className="badge badge-ghost badge-sm gap-1" title={`Cleared ${fmtDate(d.fyDataClearedAt)}`}>
                      Cleared {fmtDate(d.fyDataClearedAt)}
                    </span>
                  ) : d.vendCount > 0 ? (
                    <button
                      className="btn btn-xs btn-outline btn-error"
                      onClick={() => clearFyData(d.name, d.vendCount)}
                      disabled={busy === d.name}
                    >
                      {busy === d.name ? <span className="loading loading-spinner loading-xs" /> : 'Clear FY 2026-27 Data'}
                    </button>
                  ) : (
                    <span className="text-base-content/40 text-xs">No data</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
