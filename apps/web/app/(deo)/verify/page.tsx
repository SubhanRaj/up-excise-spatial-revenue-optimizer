'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/hooks/useSession';
import { stagingDb } from '@/lib/db';

import type { StagedRow } from '@/lib/types';
import { computeRevenue } from '@/lib/revenue';
import HelpPanel from '@/app/_components/HelpPanel';

const CHUNK_SIZE = 500;

function formatInr(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)}L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function PillList({ raw, districtThanas, onChange, readOnly = false }: {
  raw: string | null;
  districtThanas: Set<string>;
  onChange: (newRaw: string) => void;
  readOnly?: boolean;
}) {
  const pills = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];

  const remove = (pill: string) => {
    const updated = pills.filter((p) => p !== pill).join(',');
    onChange(updated);
  };

  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Adjacent Thanas">
      {pills.map((p) => {
        // Not a real cross-district check — there is no state-wide Thana master list, and
        // districtThanas is built only from this DEO's own district's own rows (staged or
        // uploaded), never other districts' or other DEOs' data. A red pill just means this
        // name doesn't (yet) appear as a Thana elsewhere in this district's own upload —
        // usually a typo, but could also be a real Thana this dataset has no shop for. Purely
        // informational: it does not block submission (see canSubmit below).
        const unrecognized = !districtThanas.has(p);
        return (
          <span
            key={p}
            className={`badge gap-1 ${unrecognized ? 'badge-error' : 'badge-outline'}`}
            title={unrecognized ? "Not found elsewhere in this district's own Thana data — check spelling, or confirm it belongs here" : p}
          >
            {p}
            {!readOnly && (
              <button
                className="ml-1 text-xs font-bold hover:opacity-70"
                aria-label={`Remove ${p}`}
                onClick={() => remove(p)}
              >×</button>
            )}
          </span>
        );
      })}
      {pills.length === 0 && <span className="text-xs text-base-content/60">—</span>}
    </div>
  );
}

export default function VerifyPage() {
  const router = useRouter();
  const { session } = useSession();
  const district = session?.districtName ?? '';
  const deoId = session?.deoId ?? '';

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
  const [viewMode, setViewMode] = useState<'staged' | 'uploaded'>('staged');
  const [uploadedRows, setUploadedRows] = useState<StagedRow[]>([]);
  const [uploadedLoading, setUploadedLoading] = useState(false);
  const [uploadedError, setUploadedError] = useState<string | null>(null);
  const [unitsReady, setUnitsReady] = useState(false);
  const [unitsChecked, setUnitsChecked] = useState(false);

  const loadUnits = useCallback(async () => {
    if (!district) return [];
    try {
      const res = await fetch(`/api/districts/${encodeURIComponent(district)}/units`);
      const data = res.ok ? await res.json() as { id: number; name: string; type: string }[] : [];
      const unitNames = [...new Set(data.map((u) => u.name).filter(Boolean))];
      setUnits(unitNames);
      setActiveUnit((prev) => prev || unitNames[0] || '');
      setUnitsReady(unitNames.length > 0);
      return unitNames;
    } catch {
      setUnits([]);
      setUnitsReady(false);
      return [];
    } finally {
      setUnitsChecked(true);
    }
  }, [district]);

  const loadUploadedRows = useCallback(async (): Promise<StagedRow[]> => {
    if (!district || !unitsReady) return [];
    setUploadedLoading(true);
    setUploadedError(null);
    try {
      const res = await fetch(`/api/districts/${encodeURIComponent(district)}/shops`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { rows: StagedRow[] };
      const mapped = data.rows.map((row) => ({ ...row, status: 'uploaded' as const }));
      setUploadedRows(mapped);
      const unitNames = [...new Set(mapped.map((r) => r.circleSectorName))].filter(Boolean);
      setUnits(unitNames);
      setActiveUnit((prev) => prev || unitNames[0] || '');
      return mapped;
    } catch {
      setUploadedError('Unable to load uploaded district data right now.');
      setUploadedRows([]);
      setUnits([]);
      return [];
    } finally {
      setUploadedLoading(false);
    }
  }, [district, unitsReady]);

  const loadRows = useCallback(async () => {
    const all = await stagingDb.getAll();
    setRows(all);
    const unitNames = [...new Set(all.map((r) => r.circleSectorName))].filter(Boolean);
    setUnits(unitNames);
    setActiveUnit((prev) => prev || unitNames[0] || '');
  }, []);

  useEffect(() => { void loadRows(); }, [loadRows]);

  useEffect(() => {
    void loadUnits();
  }, [loadUnits]);

  // Hard gate — not reachable until circles/sectors are locked, matching the server-side
  // rejection every units-dependent API route already enforces. Bounce straight to /units
  // instead of rendering a degraded "locked" version of this page.
  useEffect(() => {
    if (unitsChecked && !unitsReady) router.replace('/units');
  }, [unitsChecked, unitsReady, router]);

  // ponytail: one-shot auto-switch — runs once when district is known, avoids infinite viewMode toggle
  useEffect(() => {
    if (!district) return;
    if (!unitsReady) {
      setViewMode('staged');
      return;
    }
    stagingDb.getAll().then((all) => {
      if (all.length === 0) {
        setViewMode('uploaded');
        void loadUploadedRows();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [district, unitsReady]);

  // All Thana names within THIS district's own data (staged or uploaded) — feeds the Adjacent
  // Thana pill check in PillList above. Self-referential to one district's one dataset only;
  // not a cross-district or state-wide check (no Thana master list exists — see CLAUDE.md
  // Pre-Campaign Blocker #3).
  const districtThanas = useMemo(() => new Set((viewMode === 'uploaded' ? uploadedRows : rows).map((r) => r.thanaName)), [rows, uploadedRows, viewMode]);

  const visibleRows = viewMode === 'uploaded' ? uploadedRows : rows;

  const unitRows = useMemo(() => {
    let filtered = visibleRows.filter((r) => r.circleSectorName === activeUnit);
    if (searchQ) {
      const q = searchQ.toLowerCase();
      filtered = filtered.filter(
        (r) => r.shopName.toLowerCase().includes(q) || r.shopId.toLowerCase().includes(q) || r.thanaName.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [visibleRows, activeUnit, searchQ]);

  const paged = useMemo(() => unitRows.slice((page - 1) * pageSize, page * pageSize), [unitRows, page, pageSize]);
  const totalPages = Math.ceil(unitRows.length / pageSize);

  const canSubmit = unitsReady && viewMode === 'staged' && units.length > 0 && units.every((u) => rows.some((r) => r.circleSectorName === u && r.status !== 'error'));

  async function updateRow(id: number | undefined, changes: Partial<StagedRow>) {
    if (id == null) return;
    if (viewMode === 'uploaded') return;
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

    const Swal = (window as unknown as { Swal?: { fire: (o: unknown) => Promise<{ isConfirmed: boolean }> } }).Swal;
    const confirm = await Swal?.fire({
      icon: 'warning',
      title: 'Submit district to headquarters?',
      html: `<p>You are about to upload <b>${pending.length}</b> shop record(s) for <b>${district}</b> and lock this district as submitted.</p>
             <p style="margin-top:8px;color:#64748b">यह जिला डेटा मुख्यालय को भेजा जाएगा। सबमिट करने से पहले सभी पंक्तियों की जांच कर लें।</p>`,
      showCancelButton: true,
      confirmButtonText: 'Yes, Submit',
      cancelButtonText: 'Review Again',
      confirmButtonColor: '#b91c1c',
    });
    if (!confirm?.isConfirmed) return;

    setUploading(true);
    let done = 0;

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
          const res = await fetch('/api/upload/chunk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
      await fetch(`/api/districts/${encodeURIComponent(district)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const Swal = (window as unknown as { Swal?: { fire: (o: unknown) => Promise<void> } }).Swal;
      await Swal?.fire({ icon: 'success', title: 'District submitted!', text: 'All data has been committed to the system.' });
    }

    await loadRows();
    setUploading(false);
  }

  const unitSummary = [...new Set(visibleRows.map((r) => r.circleSectorName))].filter(Boolean).map((u) => ({
    name: u,
    count: visibleRows.filter((r) => r.circleSectorName === u).length,
    uploaded: visibleRows.filter((r) => r.circleSectorName === u && r.status === 'uploaded').length,
  }));

  if (!unitsChecked || !unitsReady) {
    return <div className="text-sm text-base-content/60 p-6">Checking your circles and sectors…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold">Verify &amp; Submit — {district}</h2>
            <p className="text-xs text-base-content/60">जांचें और सबमिट करें</p>
          </div>
          <HelpPanel
            pageKey="verify"
            title="Verification — How to review and submit"
            titleHi="Verification — समीक्षा और सबमिट कैसे करें"
            childrenHi={<>
              <p><strong>Unit tabs</strong> — circles/sectors के बीच स्विच करने के लिए किसी unit card पर क्लिक करें। हर card दिखाता है कि कितनी rows अपलोड हो चुकी हैं। सबमिशन की अनुमति देने से पहले सभी units में कम से कम एक row होनी चाहिए।</p>
              <p><strong>Workflow gate</strong> — जब तक कम से कम एक circle या sector मौजूद न हो, district डेटा अपलोड करना लॉक रहता है। पहले units बनाएं, फिर अपलोड करें, फिर verify करें।</p>
              <p><strong>View mode</strong> — <em>Staged Data</em> (आपकी local upload queue) और <em>Uploaded Data</em> (D1 से लोड की गई read-only district rows) के बीच स्विच करें। यदि अभी तक locally कुछ भी staged नहीं है, तो Demo DEO डेटा uploaded view में दिखाई देगा।</p>
              <p><strong>Adjacent Thana pills</strong> — &quot;Adjacent Thanas&quot; कॉलम में Thana के नाम pills के रूप में दिखाए जाते हैं। <span className="text-error font-semibold">लाल pills</span> का मतलब है कि यह नाम अभी तक इस district के अपने डेटा में कहीं और Thana के रूप में मौजूद नहीं है — आमतौर पर यह टाइपो होता है, लेकिन यह किसी वास्तविक Thana का नाम भी हो सकता है जिसकी कोई दुकान अभी अपलोड नहीं हुई। स्पेलिंग जांच लें; लाल pill होने से सबमिशन नहीं रुकता, और जांचने के लिए कोई राज्य-स्तरीय Thana मास्टर लिस्ट भी मौजूद नहीं है। जैसे ही वह नाम district के डेटा में कहीं आता है, pill अपने आप outlined हो जाती है।</p>
              <p><strong>Coordinates</strong> — <span className="text-warning">⚠ warning icon</span> का मतलब है coordinate UP bounding box के बाहर है। <span className="text-success">✓ icon</span> का मतलब valid है। सबमिट करने से पहले warnings की समीक्षा करें — इन्हें block नहीं किया जाता, लेकिन जांचना चाहिए।</p>
              <p><strong>Revenue column</strong> — financial fields से अपने-आप calculate होता है। अगर कोई value गलत लगे, तो Excel फ़ाइल में वापस जाकर सही version दोबारा अपलोड करें।</p>
              <p><strong>Submit District</strong> — यह बटन तभी सक्रिय होता है जब सभी registered units में बिना किसी error वाली कम से कम एक row हो। इस पर क्लिक करने से सभी pending rows अपलोड हो जाती हैं और district headquarters को सबमिट के रूप में मार्क हो जाता है।</p>
            </>}
          >
            <p><strong>Unit tabs</strong> — Click a unit card to switch between circles/sectors. Each card shows how many rows have been uploaded. All units must have at least one row before submission is allowed.</p>
            <p><strong>Workflow gate</strong> — Uploading district data is locked until at least one circle or sector exists. Create units first, then upload, then verify.</p>
            <p><strong>View mode</strong> — Switch between <em>Staged Data</em> (your local upload queue) and <em>Uploaded Data</em> (read-only district rows loaded from D1). Demo DEO data appears in the uploaded view if nothing has been staged locally yet.</p>
            <p><strong>Adjacent Thana pills</strong> — Thana names in the &quot;Adjacent Thanas&quot; column are shown as pills. <span className="text-error font-semibold">Red pills</span> mean that name doesn&apos;t (yet) appear as a Thana elsewhere in this district&apos;s own data — usually a typo, but it could also be a real Thana with no shop uploaded here. Double-check the spelling; a red pill does not block submission, and there is no state-wide Thana master list to check against. Once the name appears somewhere in this district&apos;s data, its pill turns outlined automatically.</p>
            <p><strong>Coordinates</strong> — A <span className="text-warning">⚠ warning icon</span> means the coordinate is outside the UP bounding box. A <span className="text-success">✓ icon</span> means valid. Review warnings before submitting — they are not blocked, but should be verified.</p>
            <p><strong>Revenue column</strong> — Calculated automatically from the financial fields. If a value looks wrong, go back to the Excel file and re-upload a corrected version.</p>
            <p><strong>Submit District</strong> — The button activates only when all registered units have at least one row with no errors. Clicking it uploads all pending rows and marks the district as submitted to headquarters.</p>
          </HelpPanel>
        </div>
        <div className={`flex gap-2 flex-wrap justify-end ${(uploadedLoading || uploading) ? 'pointer-events-none opacity-50' : ''}`}>
          <div className="join">
            <button className={`join-item btn btn-sm ${viewMode === 'staged' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setViewMode('staged')} disabled={rows.length === 0}>
              Staged Data
            </button>
            <button className={`join-item btn btn-sm ${viewMode === 'uploaded' ? 'btn-primary' : 'btn-outline'}`} onClick={async () => {
              setViewMode('uploaded');
              if (uploadedRows.length === 0 && !uploadedLoading) await loadUploadedRows();
            }}>
              Uploaded Data
            </button>
          </div>
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
        {visibleRows.length === 0 && viewMode === 'staged' && (
          <div className="col-span-4 text-base-content/80 text-sm">
            No staged data. <a href="/upload" className="link">Upload a file first.</a>
          </div>
        )}
        {visibleRows.length === 0 && viewMode === 'uploaded' && unitsReady && (
          <div className="col-span-4 text-base-content/80 text-sm">
            {uploadedLoading ? 'Loading uploaded district data…' : uploadedError ?? 'No uploaded district rows found.'}
          </div>
        )}
      </div>

      {/* Verification table */}
      {unitsReady && paged.length > 0 && (
        <>
          <div className="overflow-auto max-h-[calc(100vh-320px)] card bg-base-100 shadow border border-base-200">
            <table className="table table-sm table-pin-rows" role="grid" aria-label={`${viewMode === 'uploaded' ? 'Uploaded district data' : 'Verification'} table for ${activeUnit}`}>
              <thead className="bg-base-200 z-10">
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
                      {viewMode === 'uploaded' ? (
                        <span className="text-sm">{row.shopName}</span>
                      ) : (
                        <input
                          className="input input-ghost input-xs w-full min-w-32"
                          value={row.shopName}
                          aria-label={`Shop name for ${row.shopId}`}
                          onChange={(e) => updateRow(row.id, { shopName: e.target.value })}
                        />
                      )}
                    </td>
                    <td role="gridcell" className="text-xs">{row.thanaName}</td>
                    <td role="gridcell"><span className="badge badge-sm h-auto py-1 px-2 badge-outline">{row.shopType}</span></td>
                    <td role="gridcell" className="min-w-48">
                      <PillList
                        raw={row.adjacentThanasRaw}
                        districtThanas={districtThanas}
                        onChange={(newRaw) => updateRow(row.id, { adjacentThanasRaw: newRaw })}
                        readOnly={viewMode === 'uploaded'}
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
                        <span className="text-xs text-base-content/60" aria-label="No coordinates">—</span>
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
            <span className="text-sm text-base-content/80">
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
        {!canSubmit && unitsReady && units.length > 0 && (
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
