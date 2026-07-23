'use client';

import { useEffect, useMemo, useState } from 'react';
import HelpPanel from '@/app/_components/HelpPanel';
import { adminUnlockRequestsCache } from '@/lib/db';

interface RequestRow {
  id: number;
  districtName: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
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

async function promptNote(action: 'approve' | 'deny', districtName: string): Promise<string | null> {
  const SwalG = (window as unknown as { Swal?: Swal }).Swal;
  const result = await SwalG?.fire({
    icon: action === 'approve' ? 'question' : 'warning',
    title: `${action === 'approve' ? 'Approve' : 'Deny'} unlock request — ${districtName}?`,
    input: 'textarea',
    inputPlaceholder: 'Your note (required)',
    showCancelButton: true,
    confirmButtonText: action === 'approve' ? 'Approve & Unlock' : 'Deny',
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

  async function sync() {
    await adminUnlockRequestsCache.invalidate();
    load(true);
  }

  async function resolve(row: RequestRow, action: 'approve' | 'deny') {
    const note = await promptNote(action, row.districtName);
    if (!note) return;
    setResolvingId(row.id);
    try {
      const res = await fetch('/api/admin/unlock-requests/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, action, note }),
      });
      const SwalG = (window as unknown as { Swal?: Swal }).Swal;
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        await SwalG?.fire({ icon: 'error', title: 'Failed', text: body.error ?? 'Please try again.' });
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

  const visibleRows = useMemo(
    () => (statusFilter === 'pending' ? rows.filter((r) => r.status === 'pending') : rows),
    [rows, statusFilter],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Unlock Requests</h1>
          <p className="text-sm text-base-content/70 mt-0.5">DEO-submitted requests to unlock a locked circles/sectors list.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn btn-sm btn-outline gap-1" onClick={sync} disabled={loading}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
            Sync from Server
          </button>
          <HelpPanel pageKey="admin_unlock_requests" title="Unlock requests">
            <p>A locked-out DEO can submit an in-app request here instead of contacting an Admin outside the portal. Approving deletes that district&apos;s circles/sectors rows — same effect as the manual &quot;Unlock Circles/Sectors&quot; button on the district detail page — letting the DEO re-register from scratch. Denying leaves it locked. Both require you to type your own note.</p>
          </HelpPanel>
        </div>
      </div>

      <div className="bg-base-100 rounded-xl border border-base-200 overflow-hidden">
        <div className={`flex flex-wrap gap-3 items-center p-4 border-b border-base-200 ${loading ? 'pointer-events-none opacity-50' : ''}`}>
          <select className="select select-sm select-bordered bg-base-100 min-w-[10rem]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'pending' | 'all')}>
            <option value="pending">Pending only</option>
            <option value="all">All requests</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="table table-sm w-full" role="grid" aria-label="Unlock requests">
            <thead className="bg-base-50 text-[11px] uppercase tracking-wide text-base-content/70">
              <tr>
                <th>District</th>
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
                    {Array.from({ length: 5 }, (_, j) => (
                      <td key={j}><div className="h-3 bg-base-300 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : visibleRows.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-base-content/60">No unlock requests.</td></tr>
              ) : (
                visibleRows.map((r) => (
                  <tr key={r.id} className="hover:bg-base-50 align-top">
                    <td className="whitespace-nowrap font-medium text-xs">{r.districtName}</td>
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
