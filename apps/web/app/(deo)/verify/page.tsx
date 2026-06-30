'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { stagingDb } from '@/lib/db';
import type { StagedRow } from '@/lib/types';
import { computeRevenue } from '@/lib/revenue';

const WORKER = process.env.NEXT_PUBLIC_WORKER_URL ?? '';
const CHUNK_SIZE = 500;

function formatInr(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)}L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function PillList({ raw, districtThanas, onChange }: {
  raw: string | null;
  districtThanas: Set<string>;
  onChange: (newRaw: string) => void;
}) {
  const pills = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];

  const remove = (pill: string) => {
    const updated = pills.filter((p) => p !== pill).join(',');
    onChange(updated);
  };

  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Adjacent Thanas">
      {pills.map((p) => {
        const isCross = !districtThanas.has(p);
        return (
          <span
            key={p}
            className={`badge gap-1 ${isCross ? 'badge-error' : 'badge-outline'}`}
            title={isCross ? 'Cross-district adjacency — must be removed' : p}
          >
            {p}
            <button
              className="ml-1 text-xs font-bold hover:opacity-70"
              aria-label={`Remove ${p}`}
              onClick={() => remove(p)}
            >×</button>
          </span>
        );
      })}
      {pills.length === 0 && <span className="text-xs text-base-content/40">—</span>}
    </div>
  );
}

export default function VerifyPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const district = (user?.publicMetadata as { districtName?: string })?.districtName ?? '';
  const deoId = (user?.publicMetadata as { deoId?: string })?.deoId ?? user?.id ?? '';

  const [rows, setRows] = useState<StagedRow[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [activeUnit, setActiveUnit] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(() => {
    try { return Number(localStorage.getItem('verificationPageSize')) || 50; } catch { return 50; }
  });
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchQ, setSearchQ] = useState('');

  const loadRows = useCallback(async () => {
    const all = await stagingDb.getAll();
    setRows(all);
    const unitNames = [...new Set(all.map((r) => r.circleSectorName))].filter(Boolean);
    setUnits(unitNames);
    if (!activeUnit && unitNames.length > 0) setActiveUnit(unitNames[0]!);
  }, [activeUnit]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  // All Thana names within this district's staged data — used for cross-district pill check
  const districtThanas = useMemo(() => new Set(rows.map((r) => r.thanaName)), [rows]);

  const unitRows = useMemo(() => {
    let filtered = rows.filter((r) => r.circleSectorName === activeUnit);
    if (searchQ) {
      const q = searchQ.toLowerCase();
      filtered = filtered.filter(
        (r) => r.shopName.toLowerCase().includes(q) || r.shopId.toLowerCase().includes(q) || r.thanaName.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [rows, activeUnit, searchQ]);

  const paged = useMemo(() => unitRows.slice((page - 1) * pageSize, page * pageSize), [unitRows, page, pageSize]);
  const totalPages = Math.ceil(unitRows.length / pageSize);

  const canSubmit = units.length > 0 && units.every((u) => rows.some((r) => r.circleSectorName === u && r.status !== 'error'));

  async function updateRow(id: number | undefined, changes: Partial<StagedRow>) {
    if (id == null) return;
    if ('adjacentThanasRaw' in changes || 'totalRevenue' in changes) {
      // Recompute revenue if financial fields changed
      const row = rows.find((r) => r.id === id);
      if (row) {
        const merged = { ...row, ...changes };
        changes.totalRevenue = computeRevenue(merged);
      }
    }
    await stagingDb.updateRow(id, changes);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));
  }

  async function submitDistrict() {
    if (!canSubmit) return;

    const pending = rows.filter((r) => r.status === 'pending');
    if (pending.length === 0) {
      const notyf = (window as unknown as { notyf?: { success: (m: string) => void } }).notyf;
      notyf?.success('All rows already uploaded!');
      return;
    }

    setUploading(true);
    let done = 0;
    const token = await getToken();

    // Group by circle/sector, then chunk each group
    for (const unit of units) {
      const unitPending = pending.filter((r) => r.circleSectorName === unit);
      const chunks = [];
      for (let i = 0; i < unitPending.length; i += CHUNK_SIZE) {
        chunks.push(unitPending.slice(i, i + CHUNK_SIZE));
      }

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci]!;
        const body = {
          rows: chunk,
          deoId,
          districtName: district,
          circleSectorName: unit,
          chunkIndex: ci,
        };

        try {
          const res = await fetch(`${WORKER}/api/upload/chunk`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const data = await res.json() as { accepted: number; rejected: Array<{ rowIndex: number; reason: string }> };

          // Mark accepted rows
          await Promise.all(
            chunk.map(async (r, ri) => {
              const rejected = data.rejected.find((rej) => rej.rowIndex === ri);
              if (rejected) {
                await stagingDb.updateStatus(r.id!, 'error', rejected.reason);
              } else {
                await stagingDb.updateStatus(r.id!, 'uploaded');
              }
            })
          );

          done += data.accepted;
          setUploadProgress(Math.round((done / pending.length) * 100));
        } catch {
          // On network failure, register background sync
          if ('serviceWorker' in navigator && 'SyncManager' in window) {
            const sw = await navigator.serviceWorker.ready;
            await (sw as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register('upload-queue');
          }
          break;
        }
      }
    }

    // Finalize district submission if all uploaded
    const stillPending = await stagingDb.getByStatus('pending');
    if (stillPending.length === 0) {
      await fetch(`${WORKER}/api/districts/${encodeURIComponent(district)}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      const Swal = (window as unknown as { Swal?: { fire: (o: unknown) => Promise<void> } }).Swal;
      await Swal?.fire({ icon: 'success', title: 'District submitted!', text: 'All data has been committed to the system.' });
    }

    await loadRows();
    setUploading(false);
  }

  const unitSummary = units.map((u) => ({
    name: u,
    count: rows.filter((r) => r.circleSectorName === u).length,
    uploaded: rows.filter((r) => r.circleSectorName === u && r.status === 'uploaded').length,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Verify &amp; Submit — {district}</h2>
        <div className="flex gap-2">
          <input
            className="input input-bordered input-sm w-48"
            placeholder="Search shop name / ID / Thana"
            value={searchQ}
            onChange={(e) => { setSearchQ(e.target.value); setPage(1); }}
            aria-label="Search rows"
          />
          <select
            className="select select-bordered select-sm"
            value={pageSize}
            onChange={(e) => {
              const v = Number(e.target.value);
              setPageSize(v);
              localStorage.setItem('verificationPageSize', String(v));
              setPage(1);
            }}
            aria-label="Rows per page"
          >
            <option value={25}>25 rows</option>
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
          </select>
        </div>
      </div>

      {/* Unit summary */}
      <div className="grid md:grid-cols-4 gap-3" aria-label="Unit upload summary">
        {unitSummary.map((u) => (
          <div key={u.name} className={`card p-3 shadow cursor-pointer transition-colors ${activeUnit === u.name ? 'bg-primary text-primary-content' : 'bg-base-100 hover:bg-base-200'}`}
            onClick={() => { setActiveUnit(u.name); setPage(1); }}
            role="button" tabIndex={0} aria-pressed={activeUnit === u.name}
            onKeyDown={(e) => e.key === 'Enter' && setActiveUnit(u.name)}
          >
            <p className="font-semibold text-sm truncate">{u.name}</p>
            <p className="text-xs mt-1">{u.uploaded}/{u.count} uploaded</p>
            {u.count === 0 && <span className="badge badge-error badge-xs mt-1">No data</span>}
          </div>
        ))}
        {units.length === 0 && (
          <div className="col-span-4 text-base-content/60 text-sm">
            No staged data. <a href="/upload" className="link">Upload a file first.</a>
          </div>
        )}
      </div>

      {/* Verification table */}
      {paged.length > 0 && (
        <>
          <div className="overflow-x-auto card bg-base-100 shadow">
            <table className="table table-sm" role="grid" aria-label={`Verification table for ${activeUnit}`}>
              <thead>
                <tr>
                  <th>Shop ID</th><th>Shop Name</th><th>Thana</th><th>Type</th>
                  <th>Adjacent Thanas</th><th>Coords</th><th>Revenue</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((row) => (
                  <tr key={row.id} role="row" className={row.status === 'error' ? 'bg-error/10' : ''}>
                    <td role="gridcell" className="font-mono text-xs">{row.shopId}</td>
                    <td role="gridcell">
                      <input
                        className="input input-ghost input-xs w-full min-w-32"
                        value={row.shopName}
                        aria-label={`Shop name for ${row.shopId}`}
                        onChange={(e) => updateRow(row.id, { shopName: e.target.value })}
                      />
                    </td>
                    <td role="gridcell" className="text-xs">{row.thanaName}</td>
                    <td role="gridcell"><span className="badge badge-xs badge-outline">{row.shopType}</span></td>
                    <td role="gridcell" className="min-w-48">
                      <PillList
                        raw={row.adjacentThanasRaw}
                        districtThanas={districtThanas}
                        onChange={(newRaw) => updateRow(row.id, { adjacentThanasRaw: newRaw })}
                      />
                    </td>
                    <td role="gridcell">
                      {row.latitudeDecimal != null ? (
                        <span
                          className={`text-xs ${row.coordinateWarning ? 'text-warning' : 'text-success'}`}
                          title={row.coordinateWarning ?? 'Valid coordinates'}
                          aria-label={row.coordinateWarning ? `Warning: ${row.coordinateWarning}` : 'Valid coordinates'}
                        >
                          {row.coordinateWarning
                            ? /* tabler:alert-triangle */
                              <svg xmlns="http://www.w3.org/2000/svg" className="inline w-4 h-4 mr-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                            : /* tabler:circle-check */
                              <svg xmlns="http://www.w3.org/2000/svg" className="inline w-4 h-4 mr-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>
                          }
                          {row.latitudeDecimal.toFixed(4)}, {row.longitudeDecimal!.toFixed(4)}
                        </span>
                      ) : (
                        <span className="text-xs text-base-content/40" aria-label="No coordinates">—</span>
                      )}
                    </td>
                    <td role="gridcell" className="text-xs font-mono">{formatInr(row.totalRevenue)}</td>
                    <td role="gridcell">
                      <span className={`badge badge-xs ${row.status === 'uploaded' ? 'badge-success' : row.status === 'error' ? 'badge-error' : 'badge-ghost'}`}>
                        {row.status}
                      </span>
                      {row.errorReason && <p className="text-xs text-error mt-1">{row.errorReason}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between" aria-label="Pagination">
            <span className="text-sm text-base-content/60">
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, unitRows.length)} of {unitRows.length}
            </span>
            <div className="join">
              <button className="join-item btn btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>«</button>
              <button className="join-item btn btn-sm" disabled>{page}/{totalPages}</button>
              <button className="join-item btn btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>»</button>
            </div>
          </div>
        </>
      )}

      {/* Upload progress */}
      {uploading && (
        <div aria-live="polite" aria-label={`Upload progress: ${uploadProgress}%`}>
          <p className="text-sm mb-1">Uploading… {uploadProgress}%</p>
          <progress className="progress progress-primary w-full" value={uploadProgress} max={100} />
        </div>
      )}

      {/* Submit button — gated on completeness */}
      <div className="flex flex-wrap gap-4 items-center">
        <button
          className="btn btn-primary btn-lg"
          onClick={submitDistrict}
          disabled={!canSubmit || uploading}
          aria-disabled={!canSubmit}
          title={!canSubmit ? 'All registered units must have at least one row before submission' : ''}
        >
          {uploading ? <span className="loading loading-spinner" /> : 'Submit District'}
        </button>
        {!canSubmit && units.length > 0 && (
          <p className="text-sm text-warning" role="alert">
            All units must have at least one row to enable submission.
          </p>
        )}
      </div>

      {/* Print stylesheet applies via global CSS */}
      <style>{`@media print{.btn,.join,.select,.input{display:none!important}}`}</style>
    </div>
  );
}
