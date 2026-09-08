'use client';

import { useMemo, useState } from 'react';
import HelpPanel from '@/app/_components/HelpPanel';
import { useAdminDistricts } from '@/hooks/useAdminDistricts';
import { adminDistrictsCache } from '@/lib/db';
import { statusLabel, statusBadgeClass } from '@/lib/status';

type SwalG = {
  fire: (o: Record<string, unknown>) => Promise<{ isConfirmed: boolean; value?: unknown }>;
  showValidationMessage: (m: string) => void;
};

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

export default function FyCleanupPage() {
  const { districts, loading, refresh } = useAdminDistricts();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);

  const cleared = districts.filter((d) => d.fyDataClearedAt != null);
  const clearable = useMemo(
    () => districts.filter((d) => d.fyDataClearedAt == null && d.vendCount > 0),
    [districts],
  );
  const clearableNames = clearable.map((d) => d.name);
  const allSelected = clearableNames.length > 0 && clearableNames.every((n) => selected.has(n));

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(clearableNames));
  }

  async function runClear() {
    const names = clearableNames.filter((n) => selected.has(n));
    if (names.length === 0) return;
    const Swal = (window as unknown as { Swal?: SwalG }).Swal;
    const totalShops = clearable
      .filter((d) => selected.has(d.name))
      .reduce((s, d) => s + d.vendCount, 0);

    const first = await Swal?.fire({
      icon: 'warning',
      title: `Clear FY 2026-27 data for ${names.length} district${names.length > 1 ? 's' : ''}?`,
      html: `<p>This permanently deletes <b>${totalShops.toLocaleString()}</b> uploaded shop record(s) across:</p>
             <p style="margin:6px 0;font-size:0.9em">${names.join(', ')}</p>
             <p>Registered circles/sectors, DEO accounts, and the audit log are kept. Each district resets to <b>Pending</b>, and <b>cannot be cleared again</b> from this page.</p>`,
      showCancelButton: true,
      confirmButtonText: 'Continue',
      confirmButtonColor: '#dc2626',
    });
    if (!first?.isConfirmed) return;

    const second = await Swal?.fire({
      title: 'Type to confirm',
      html: `<p style="text-align:left">Type <b>CLEAR</b> below and give a reason. It is recorded on every district's audit-log entry.</p>
             <input id="fy-confirm-word" class="swal2-input" placeholder="CLEAR" autocomplete="off">
             <textarea id="fy-confirm-reason" class="swal2-textarea" placeholder="Reason (required)"></textarea>`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: `Clear ${names.length} district${names.length > 1 ? 's' : ''}`,
      confirmButtonColor: '#dc2626',
      preConfirm: () => {
        const word = (document.getElementById('fy-confirm-word') as HTMLInputElement | null)?.value.trim() ?? '';
        const reason = (document.getElementById('fy-confirm-reason') as HTMLTextAreaElement | null)?.value.trim() ?? '';
        if (word !== 'CLEAR') { Swal?.showValidationMessage('Type CLEAR exactly.'); return false; }
        if (!reason) { Swal?.showValidationMessage('Please enter a reason.'); return false; }
        return { reason };
      },
    });
    if (!second?.isConfirmed || !second.value) return;
    const { reason } = second.value as { reason: string };

    setRunning(true);
    let ok = 0;
    const failed: string[] = [];
    try {
      for (const name of names) {
        const res = await fetch(`/api/admin/districts/${encodeURIComponent(name)}/clear-fy-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        });
        if (res.ok) ok += 1; else failed.push(name);
      }
      adminDistrictsCache.invalidate();
      await refresh();
      setSelected(new Set());
      await Swal?.fire({
        icon: failed.length ? 'warning' : 'success',
        title: failed.length ? 'Finished with errors' : 'Done',
        html: `<p>Cleared <b>${ok}</b> district${ok === 1 ? '' : 's'}.</p>${
          failed.length ? `<p style="margin-top:6px">Failed: ${failed.join(', ')} — try again.</p>` : ''
        }`,
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">FY 2026-27 Data Cleanup</h1>
          <p className="text-base-content/70 mt-1">Clear shop data entered for the wrong financial year — tick the districts and clear them in one go</p>
        </div>
        <HelpPanel pageKey="admin_fy_cleanup" title="FY 2026-27 Data Cleanup">
          <p>Some districts uploaded shop and revenue data for FY 2026-27 (the current year). Phase 1 collects <b>FY 2025-26</b> — the previous, closed year. This page clears the wrong-year data so those DEOs can re-enter correct figures.</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>Tick one or more districts (or use the header checkbox to select all), then <b>Clear selected</b>. One confirmation and one reason cover the whole batch.</li>
            <li>Clearing deletes only the shop records. Registered circles/sectors, the DEO&apos;s account and CUG, the district and DEO name, and the audit log are all kept.</li>
            <li>Each district resets to <b>Pending</b>. The DEO downloads a fresh validated template on their Upload page and re-enters FY 2025-26 data.</li>
            <li><b>One-time per district.</b> Once cleared, the row greys out so a re-entered dataset can&apos;t be wiped again. For an ordinary bad upload, use &ldquo;Delete Shop Data&rdquo; on the district page instead.</li>
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
          <div className="stat-value text-2xl text-warning">{clearable.length}</div>
        </div>
        <div className="stat bg-base-100 rounded-2xl shadow p-4">
          <div className="stat-title text-xs">Total districts</div>
          <div className="stat-value text-2xl">{districts.length}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="btn btn-sm btn-error"
          disabled={selected.size === 0 || running}
          onClick={runClear}
        >
          {running ? <span className="loading loading-spinner loading-xs" /> : `Clear selected (${selected.size})`}
        </button>
        {selected.size > 0 && !running && (
          <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>Clear selection</button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-base-200 bg-base-100">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={allSelected}
                  disabled={clearableNames.length === 0 || running}
                  onChange={toggleAll}
                  aria-label="Select all clearable districts"
                />
              </th>
              <th>District</th>
              <th>DEO</th>
              <th>Division</th>
              <th className="text-right">Shops</th>
              <th>Status</th>
              <th>FY cleanup</th>
            </tr>
          </thead>
          <tbody>
            {loading && districts.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-base-content/50">Loading…</td></tr>
            ) : districts.map((d) => {
              const isClearable = d.fyDataClearedAt == null && d.vendCount > 0;
              return (
                <tr key={d.name} className={selected.has(d.name) ? 'bg-error/5' : undefined}>
                  <td>
                    {isClearable && (
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={selected.has(d.name)}
                        disabled={running}
                        onChange={() => toggle(d.name)}
                        aria-label={`Select ${d.name}`}
                      />
                    )}
                  </td>
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
                      <span className="text-base-content/60 text-xs">Select to clear</span>
                    ) : (
                      <span className="text-base-content/40 text-xs">No data</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
