'use client';

import { useEffect, useState } from 'react';

const WORKER = process.env.NEXT_PUBLIC_WORKER_URL ?? '';
interface AuditRow { id: number; eventType: string; deoId: string; districtName?: string; ipAddress?: string; createdAt: number }

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      const token = await (window as unknown as { Clerk?: { session?: { getToken: () => Promise<string> } } }).Clerk?.session?.getToken();
      const res = await fetch(`${WORKER}/api/admin/audit-log?page=${page}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json() as { rows: AuditRow[] };
      setRows(data.rows);
    })();
  }, [page]);

  return (
    <div className="card bg-base-100 shadow p-6 space-y-4">
      <h2 className="text-xl font-bold">Audit Log (last 45 days)</h2>
      <div className="overflow-x-auto">
        <table className="table table-sm w-full" role="grid" aria-label="Audit log">
          <thead><tr><th>Event</th><th>DEO ID</th><th>District</th><th>IP</th><th>Time</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} role="row">
                <td role="gridcell"><span className="badge badge-outline badge-sm">{r.eventType}</span></td>
                <td role="gridcell" className="font-mono text-xs">{r.deoId}</td>
                <td role="gridcell" className="text-xs">{r.districtName ?? '—'}</td>
                <td role="gridcell" className="text-xs font-mono">{r.ipAddress ?? '—'}</td>
                <td role="gridcell" className="text-xs">{new Date(r.createdAt * 1000).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>«</button>
        <button className="btn btn-sm" disabled>{page}</button>
        <button className="btn btn-sm" disabled={rows.length < 100} onClick={() => setPage(p => p + 1)}>»</button>
      </div>
    </div>
  );
}
