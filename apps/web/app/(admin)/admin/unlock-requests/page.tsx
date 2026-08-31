'use client';

import { useEffect, useMemo, useState } from 'react';
import HelpPanel from '@/app/_components/HelpPanel';
import { adminUnlockRequestsCache } from '@/lib/db';

interface RequestRow {
  id: number;
  districtName: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  requestType: 'units' | 'data_correction';
  requestedByDeo: string;
  requestedAt: string; // ISO string — Drizzle's `mode: 'timestamp'` columns serialize to this over JSON, not raw epoch seconds
  resolvedAt: string | null;
  resolvedBy: string | null;
  adminNote: string | null;
}

const STATUS_BADGE: Record<RequestRow['status'], string> = {
  pending: 'badge-warning',
  approved: 'badge-success',
  denied: 'badge-error',
};

type Swal = { fire: (o: Record<string, unknown>) => Promise<{ isConfirmed: boolean; value?: string }> };

async function promptNote(action: 'approve' | 'deny', districtName: string, requestType: RequestRow['requestType']): Promise<string | null> {
  const SwalG = (window as unknown as { Swal?: Swal }).Swal;
  const result = await SwalG?.fire({
    icon: action === 'approve' ? 'question' : 'warning',
    title: `${action === 'approve' ? 'Approve' : 'Deny'} ${requestType === 'data_correction' ? 'data-correction' : 'units'} unlock — ${districtName}?`,
    input: 'textarea',
    inputPlaceholder: 'Your note (required)',
    showCancelButton: true,
    confirmButtonText: action === 'approve' ? (requestType === 'data_correction' ? 'Approve & Allow Re-upload' : 'Approve & Unlock') : 'Deny',
    cancelButtonText: 'Cancel',
    confirmButtonColor: action === 'approve' ? '#1d4ed8' : '#dc2626',
    inputValidator: (value: string) => (value && value.trim() ? undefined : 'Please enter a note.'),
  });
  return result?.isConfirmed ? String(result.value ?? '').trim() : null;
}

async function promptBulkNote(action: 'approve' | 'deny', count: number): Promise<string | null> {
  const SwalG = (window as unknown as { Swal?: Swal }).Swal;
  const result = await SwalG?.fire({
    icon: action === 'approve' ? 'question' : 'warning',
    title: `${action === 'approve' ? 'Approve' : 'Deny'} ${count} selected request${count === 1 ? '' : 's'}?`,
    html: '<p style="text-align:left;color:#64748b">This note is applied to every selected request.</p>',
    input: 'textarea',
    inputPlaceholder: 'Your note (required)',
    showCancelButton: true,
    confirmButtonText: action === 'approve' ? 'Approve Selected' : 'Deny Selected',
    cancelButtonText: 'Cancel',
    confirmButtonColor: action === 'approve' ? '#1d4ed8' : '#dc2626',
    inputValidator: (value: string) => (value && value.trim() ? undefined : 'Please enter a note.'),
  });
  return result?.isConfirmed ? String(result.value ?? '').trim() : null;
}

export default function UnlockRequestsPage() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all'>('pending');
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  function load(forceRefresh = false) {
    setLoading(true);
    (async () => {
      if (!forceRefresh) {
        const cached = await adminUnlockRequestsCache.get();
        if (cached) {
          setRows((cached as { rows: RequestRow[] }).rows ?? []);
          setLoading(false);
          return;
        }
      }
      const res = await fetch('/api/admin/unlock-requests');
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json() as { rows: RequestRow[] };
      adminUnlockRequestsCache.set(data);
      setRows(data.rows ?? []);
      setLoading(false);
    })();
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function resolveOne(id: number, action: 'approve' | 'deny', note: string): Promise<boolean> {
    const res = await fetch('/api/admin/unlock-requests/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, note }),
    });
    return res.ok;
  }

  async function resolve(row: RequestRow, action: 'approve' | 'deny') {
    const note = await promptNote(action, row.districtName, row.requestType);
    if (!note) return;
    setResolvingId(row.id);
    try {
      const ok = await resolveOne(row.id, action, note);
      const SwalG = (window as unknown as { Swal?: Swal }).Swal;
      if (!ok) {
        await SwalG?.fire({ icon: 'error', title: 'Failed', text: 'Please try again.' });
        return;
      }
      void SwalG?.fire({
        toast: true, position: 'top-end', icon: 'success',
        title: action === 'approve' ? 'District unlocked' : 'Request denied',
        showConfirmButton: false, timer: 3000, timerProgressBar: true,
      });
      await adminUnlockRequestsCache.invalidate();
      load(true);
    } finally {
      setResolvingId(null);
    }
  }

  async function resolveBulk(action: 'approve' | 'deny') {
    const ids = [...selected];
    if (ids.length === 0) return;
    const note = await promptBulkNote(action, ids.length);
    if (!note) return;
    setBulkBusy(true);
    try {
      const results = await Promise.all(ids.map((id) => resolveOne(id, action, note)));
      const failed = results.filter((ok) => !ok).length;
      const SwalG = (window as unknown as { Swal?: Swal }).Swal;
      if (failed > 0) {
        await SwalG?.fire({
          icon: 'warning', title: 'Some requests failed',
          text: `${ids.length - failed} of ${ids.length} succeeded. Refresh and retry the rest — a request already resolved by someone else is a common cause.`,
        });
      } else {
        void SwalG?.fire({
          toast: true, position: 'top-end', icon: 'success',
          title: `${ids.length} request${ids.length === 1 ? '' : 's'} ${action === 'approve' ? 'unlocked' : 'denied'}`,
          showConfirmButton: false, timer: 3000, timerProgressBar: true,
        });
      }
      setSelected(new Set());
      await adminUnlockRequestsCache.invalidate();
      load(true);
    } finally {
      setBulkBusy(false);
    }
  }

  const visibleRows = useMemo(
    () => (statusFilter === 'pending' ? rows.filter((r) => r.status === 'pending') : rows),
    [rows, statusFilter],
  );
  const selectablePendingRows = useMemo(() => visibleRows.filter((r) => r.status === 'pending'), [visibleRows]);
  const allSelected = selectablePendingRows.length > 0 && selectablePendingRows.every((r) => selected.has(r.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      if (allSelected) return new Set();
      return new Set(selectablePendingRows.map((r) => r.id));
    });
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Unlock Requests</h1>
          <p className="text-sm text-base-content/70 mt-0.5">DEO-submitted requests to unlock a locked circles/sectors list.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <HelpPanel pageKey="admin_unlock_requests" title="Unlock requests">
            <p>A locked-out DEO can submit an in-app request here instead of contacting an Admin outside the portal. Two request types exist: <strong>Circles/Sectors</strong> — approving deletes that district&apos;s circles/sectors rows (same as the manual &quot;Unlock Circles/Sectors&quot; button on the district detail page), letting the DEO re-register from scratch. <strong>Data Correction</strong> — for a district already submitted with a shop-level data error; approving only re-opens the district for re-upload, it never deletes any submitted data. Denying leaves it as-is. Both require you to type your own note. Tick the checkbox on multiple pending rows to approve or deny them together with one shared note.</p>
          </HelpPanel>
        </div>
      </div>

      <div className="bg-base-100 rounded-xl border border-base-200 overflow-hidden">
        <div className={`flex flex-wrap gap-3 items-center p-4 border-b border-base-200 ${loading ? 'pointer-events-none opacity-50' : ''}`}>
          <select className="select select-sm select-bordered bg-base-100 min-w-[10rem]" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as 'pending' | 'all'); setSelected(new Set()); }}>
            <option value="pending">Pending only</option>
            <option value="all">All requests</option>
          </select>
          {selected.size > 0 && (
            <div className={`ml-auto flex items-center gap-2 ${bulkBusy ? 'pointer-events-none opacity-50' : ''}`}>
              <span className="text-xs text-base-content/70">{selected.size} selected</span>
              <button className="btn btn-xs btn-success" onClick={() => resolveBulk('approve')}>
                {bulkBusy ? <span className="loading loading-spinner loading-xs" /> : 'Approve Selected'}
              </button>
              <button className="btn btn-xs btn-error btn-outline" onClick={() => resolveBulk('deny')}>Deny Selected</button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="table table-sm w-full" role="grid" aria-label="Unlock requests">
            <thead className="bg-base-50 text-[11px] uppercase tracking-wide text-base-content/70">
              <tr>
                <th className="w-8">
                  {selectablePendingRows.length > 0 && (
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all pending requests"
                    />
                  )}
                </th>
                <th>District</th>
                <th>Type</th>
                <th>Requested</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 7 }, (_, j) => (
                      <td key={j}><div className="h-3 bg-base-300 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : visibleRows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-base-content/60">No unlock requests.</td></tr>
              ) : (
                visibleRows.map((r) => (
                  <tr key={r.id} className="hover:bg-base-50 align-top">
                    <td>
                      {r.status === 'pending' && (
                        <input
                          type="checkbox"
                          className="checkbox checkbox-xs"
                          checked={selected.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                          aria-label={`Select request for ${r.districtName}`}
                        />
                      )}
                    </td>
                    <td className="whitespace-nowrap font-medium text-xs">{r.districtName}</td>
                    <td className="whitespace-nowrap">
                      <span className={`badge badge-sm ${r.requestType === 'data_correction' ? 'badge-info' : 'badge-ghost'}`}>
                        {r.requestType === 'data_correction' ? 'Data Correction' : 'Circles/Sectors'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-xs">{new Date(r.requestedAt).toLocaleString('en-IN')}</td>
                    <td className="text-xs max-w-sm">
                      {r.reason}
                      {r.status !== 'pending' && r.adminNote && (
                        <p className="mt-1 text-[11px] text-base-content/60">
                          Admin note: {r.adminNote} ({r.resolvedBy}, {r.resolvedAt ? new Date(r.resolvedAt).toLocaleString('en-IN') : ''})
                        </p>
                      )}
                    </td>
                    <td><span className={`badge badge-sm ${STATUS_BADGE[r.status]}`}>{r.status}</span></td>
                    <td className="whitespace-nowrap">
                      {r.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button className="btn btn-xs btn-success" disabled={resolvingId === r.id} onClick={() => resolve(r, 'approve')}>Approve</button>
                          <button className="btn btn-xs btn-error btn-outline" disabled={resolvingId === r.id} onClick={() => resolve(r, 'deny')}>Deny</button>
                        </div>
                      ) : <span className="text-base-content/40 text-xs">—</span>}
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
