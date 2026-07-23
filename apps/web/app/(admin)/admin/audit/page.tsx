'use client';

import { useEffect, useMemo, useState } from 'react';
import HelpPanel from '@/app/_components/HelpPanel';
import { adminAuditCache } from '@/lib/db';

interface AuditRow {
  id: number;
  eventType: string;
  deoId: string;
  districtName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: string | null;
  actorName?: string | null;
  actorDesignation?: string | null;
  createdAt: string; // ISO string — Drizzle's `mode: 'timestamp'` columns serialize to this over JSON, not raw epoch seconds
}

// All event types written across apps/web/app/api/** — see grep for `eventType:`.
const EVENT_LABELS: Record<string, string> = {
  login: 'Login (magic link)',
  login_cug: 'Login (CUG)',
  logout: 'Logout',
  upload_chunk: 'Upload chunk',
  district_submitted: 'District submitted',
  unit_registered: 'Circles/Sectors registered',
  units_unlocked: 'Circles/Sectors unlocked',
  district_master_updated: 'District Master updated',
  bulk_provision: 'Bulk DEO provisioning',
  unlock_requested: 'Unlock requested',
  unlock_request_denied: 'Unlock request denied',
};

// Raw metadata JSON keys, as actually written across every auditLog insert — human labels
// for display, falling back to the raw key for anything not yet mapped.
const METADATA_KEY_LABELS: Record<string, string> = {
  circles: 'Circles',
  sectors: 'Sectors',
  chunkIndex: 'Chunk #',
  accepted: 'Accepted',
  rejected: 'Rejected',
  submittedAt: 'Submitted at',
  fields: 'Fields changed',
  emailChanged: 'Email changed',
  total: 'Total rows',
  provisioned: 'Provisioned',
  failed: 'Failed',
  reason: 'Reason',
  note: 'Note',
};

// Admin-actor events carry actorName/actorDesignation (captured at write time). DEO-actor
// events don't — deoId already identifies those (e.g. "DEO-AGRA").
function describeActor(row: AuditRow): string {
  if (row.actorName) return row.actorDesignation ? `${row.actorName} (${row.actorDesignation})` : row.actorName;
  return row.deoId || '—';
}

function describeMetadata(row: AuditRow): string {
  const parts: string[] = [];
  if (row.metadata) {
    try {
      const m = JSON.parse(row.metadata) as Record<string, unknown>;
      parts.push(...Object.entries(m).map(([k, v]) => `${METADATA_KEY_LABELS[k] ?? k}: ${v}`));
    } catch {
      parts.push(row.metadata);
    }
  }
  if (row.ipAddress) parts.push(`IP: ${row.ipAddress}`);
  return parts.length ? parts.join(' · ') : '—';
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="text-base-content/40 ml-1">⇅</span>;
  return <span className="text-info ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

const PAGE_SIZE = 100;

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState('all');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function load(p: number, forceRefresh = false) {
    setLoading(true);
    (async () => {
      if (!forceRefresh) {
        const cached = await adminAuditCache.get(String(p));
        if (cached) {
          setRows((cached as { rows: AuditRow[] }).rows ?? []);
          setLoading(false);
          return;
        }
      }
      const res = await fetch(`/api/admin/audit-log?page=${p}`);
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json() as { rows: AuditRow[] };
      adminAuditCache.set(String(p), data);
      setRows(data.rows ?? []);
      setLoading(false);
    })();
  }

  useEffect(() => { load(page); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page]);

  async function sync() {
    await adminAuditCache.invalidate();
    load(page, true);
  }

  // Filters + re-sorts only the currently-loaded page — the log is already newest-first and
  // server-paginated, so a true global filter/sort would need a server-side query; not worth
  // it for a 45-day-retention, single-reader table.
  const visibleRows = useMemo(() => {
    const filtered = eventFilter === 'all' ? rows : rows.filter((r) => r.eventType === eventFilter);
    const sorted = [...filtered].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return sortDir === 'desc' ? sorted.reverse() : sorted;
  }, [rows, eventFilter, sortDir]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-sm text-base-content/70 mt-0.5">Every login, upload, and district/unit lifecycle event, newest first. Entries older than 45 days are removed automatically.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn btn-sm btn-outline gap-1" onClick={sync} disabled={loading}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
            Sync from Server
          </button>
          <HelpPanel pageKey="admin_audit" title="Reading the audit log">
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Event types</strong> — magic-link/CUG login, circle-sector registration and unlock, Excel chunk uploads, district submission.</li>
              <li><strong>Retention</strong> — 45 days rolling. Older rows are purged automatically the next time this page loads.</li>
              <li><strong>Filter by event</strong> and the <strong>sort</strong> toggle both apply only to the currently loaded page of 100 entries.</li>
              <li><strong>Details</strong> — event-specific metadata (e.g. rows accepted/rejected on an upload) plus the originating IP address, useful for spotting unusual login locations.</li>
            </ul>
          </HelpPanel>
        </div>
      </div>

      <div className="bg-base-100 rounded-xl border border-base-200 overflow-hidden">
        <div className={`flex flex-wrap gap-3 items-center p-4 border-b border-base-200 ${loading ? 'pointer-events-none opacity-50' : ''}`}>
          <select className="select select-sm select-bordered bg-base-100 min-w-[12rem]" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
            <option value="all">All events</option>
            {Object.entries(EVENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => d === 'desc' ? 'asc' : 'desc')}
            title={sortDir === 'desc' ? 'Newest first — click for oldest first' : 'Oldest first — click for newest first'}
            className="btn btn-sm btn-outline gap-1"
          >
            {sortDir === 'desc' ? 'Newest first' : 'Oldest first'} <SortIcon active dir={sortDir} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="table table-sm w-full" role="grid" aria-label="Audit log">
            <thead className="bg-base-50 text-[11px] uppercase tracking-wide text-base-content/70">
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Actor</th>
                <th>District</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }, (_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 5 }, (_, j) => (
                      <td key={j}><div className="h-3 bg-base-300 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : visibleRows.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-base-content/60">No matching activity in the last 45 days.</td></tr>
              ) : (
                visibleRows.map((r) => (
                  <tr key={r.id} className="hover:bg-base-50">
                    <td className="whitespace-nowrap text-xs">{new Date(r.createdAt).toLocaleString('en-IN')}</td>
                    <td><span className="badge badge-outline badge-sm h-auto py-1 px-2 whitespace-nowrap">{EVENT_LABELS[r.eventType] ?? r.eventType}</span></td>
                    <td className="font-mono text-xs">{describeActor(r)}</td>
                    <td className="text-xs">{r.districtName ?? <span className="text-base-content/50">—</span>}</td>
                    <td className="text-xs text-base-content/70">{describeMetadata(r)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm text-base-content/70 px-4 py-3 border-t border-base-200">
          <button className="btn btn-sm btn-outline" disabled={page === 1 || loading} onClick={() => setPage((p) => p - 1)}>«</button>
          <span>Page {page}</span>
          <button className="btn btn-sm btn-outline" disabled={rows.length < PAGE_SIZE || loading} onClick={() => setPage((p) => p + 1)}>»</button>
        </div>
      </div>
    </div>
  );
}
