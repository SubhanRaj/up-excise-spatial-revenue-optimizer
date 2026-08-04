'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@/hooks/useSession';
import { stagingDb } from '@/lib/db';

import type { StagedRow } from '@/lib/types';
import { computeRevenue } from '@/lib/revenue';
import HelpPanel from '@/app/_components/HelpPanel';

const CHUNK_SIZE = 500;

// Sentinel activeUnit value for the "Unregistered / Mismatched" catch-all card — never a
// real circle_sector_name, so it can share the same activeUnit state/click handling as every
// other unit tab without a parallel bool flag.
const UNMATCHED_UNIT_KEY = '__unmatched__';

function formatInr(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)}L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

// Only letters, spaces, and punctuation real names actually use (dots for initials,
// hyphens/apostrophes for compound names) — deliberately excludes digits so a DEO can't
// paste their CUG number in here. Mirrors the sibling excise-revenue-recovery-portal
// project's promptDeoNameAndLock()/validateDeoName() pattern.
const DEO_NAME_CHARS_RE = /^[A-Za-z][A-Za-z.\-' ]*$/;
const DEO_DESIGNATION_RE = /\b(deo|adeo|d\.?e\.?o\.?|excise\s*officer|officer|admin)\b/i;

function validateDeoName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 'Please enter your full name. / कृपया अपना पूरा नाम दर्ज करें।';
  if (/\d/.test(trimmed)) return 'Name must not contain numbers — do not type your CUG number here. / नाम में अंक नहीं होने चाहिए।';
  if (DEO_DESIGNATION_RE.test(trimmed)) return 'Please enter your actual name, not your designation (e.g. "DEO"). / कृपया अपना पद नहीं, नाम दर्ज करें।';
  if (!DEO_NAME_CHARS_RE.test(trimmed)) return 'Please enter your name in English letters only (dots/hyphens allowed). / कृपया केवल अंग्रेज़ी अक्षरों में नाम दर्ज करें।';
  return undefined;
}

type SwalLike = {
  fire: (o: unknown) => Promise<{ isConfirmed: boolean; value?: unknown }>;
};

async function promptDeoNameAndLock(district: string): Promise<string | null> {
  const Swal = (window as unknown as { Swal?: SwalLike }).Swal;
  const result = await Swal?.fire({
    title: 'Verify & Lock Submission',
    html: `<p>Enter the full name of the District Excise Officer confirming this submission for <b>${district}</b>. By locking, you confirm the data is accurate — <strong>any incorrect data or error is the submitting DEO's individual responsibility</strong>, who will be personally liable for it.</p>
           <p style="margin-top:8px;color:#64748b">इस सबमिशन की पुष्टि करने वाले जिला आबकारी अधिकारी का पूरा नाम दर्ज करें। लॉक करने पर, आप पुष्टि करते हैं कि डेटा सही है — <strong>किसी भी गलत डेटा या त्रुटि की जिम्मेदारी व्यक्तिगत रूप से संबंधित डीईओ की होगी</strong>।</p>`,
    input: 'text',
    inputPlaceholder: 'Full Name (English)',
    showCancelButton: true,
    confirmButtonText: 'Lock Submission',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#dc2626',
    allowOutsideClick: false,
    inputValidator: (value: string) => validateDeoName(value ?? ''),
  } as unknown);
  return result?.isConfirmed ? String(result.value).trim() : null;
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
            title={unrecognized ? "Not an error — just means this name doesn't (yet) appear elsewhere in this district's own uploaded Thana data. Worth a spelling check, but does not block submission." : p}
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
  // Registered circles/sectors for this district (from GET /districts/[district]/units) —
  // the authoritative list canSubmit checks coverage against. Set ONLY by loadUnits() below.
  // Previously this same state was also overwritten by loadRows()/loadUploadedRows() with
  // whatever distinct circleSectorName values happened to exist in staged/uploaded rows —
  // whichever of the three resolved last silently won, so canSubmit could end up checking
  // rows against the wrong list (e.g. an empty or uploaded-only list) depending on race
  // timing and which view the DEO last opened. Real DEO-reported symptom this caused: every
  // visible unit tab had staged rows and no row errors, yet Submit District still refused
  // with "All units must have at least one row" and gave no indication which unit(s) were
  // actually missing.
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
  // Once submitted, the staged-review workflow (Clear Staged Data, Submit District) no
  // longer makes sense — new uploads are blocked server-side (see POST /api/upload/chunk)
  // until an admin approves a data-correction unlock, at which point status flips back to
  // 'in_progress' and this reverts to the normal staged workflow on next load.
  const [submitted, setSubmitted] = useState(false);

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

  useEffect(() => {
    if (!district) return;
    fetch(`/api/districts/${encodeURIComponent(district)}/status`)
      .then((res) => (res.ok ? res.json() as Promise<{ districtStatus: string }> : { districtStatus: 'pending' }))
      .then((data) => setSubmitted(data.districtStatus === 'submitted'));
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
      setActiveUnit((prev) => prev || unitNames[0] || '');
      return mapped;
    } catch {
      setUploadedError('Unable to load uploaded district data right now.');
      setUploadedRows([]);
      return [];
    } finally {
      setUploadedLoading(false);
    }
  }, [district, unitsReady]);

  const loadRows = useCallback(async () => {
    const all = await stagingDb.getAll();
    setRows(all);
    const unitNames = [...new Set(all.map((r) => r.circleSectorName))].filter(Boolean);
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
    // A submitted district is locked to the read-only Uploaded Data view — staged-review
    // controls (toggle, Clear Staged Data, Submit District) are hidden below regardless,
    // but forcing viewMode here too keeps any stale local staged rows from ever rendering.
    if (submitted) {
      setViewMode('uploaded');
      void loadUploadedRows();
      return;
    }
    if (new URLSearchParams(window.location.search).get('view') === 'uploaded') {
      setViewMode('uploaded');
      void loadUploadedRows();
      return;
    }
    stagingDb.getAll().then((all) => {
      if (all.length === 0) {
        setViewMode('uploaded');
        void loadUploadedRows();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [district, unitsReady, submitted]);

  // All Thana names within THIS district's own data (staged or uploaded) — feeds the Adjacent
  // Thana pill check in PillList above. Self-referential to one district's one dataset only;
  // not a cross-district or state-wide check (no Thana master list exists — see CLAUDE.md
  // Pre-Campaign Blocker #3).
  const districtThanas = useMemo(() => new Set((viewMode === 'uploaded' ? uploadedRows : rows).map((r) => r.thanaName)), [rows, uploadedRows, viewMode]);

  const visibleRows = viewMode === 'uploaded' ? uploadedRows : rows;

  // A row whose circle_sector_name doesn't exactly match a registered unit (a typo, or an
  // Inspector pasting the column instead of using the dropdown — Excel's list validation
  // never fires on paste) never matches any real tab's filter below, so it silently vanished
  // from every unit view. This sentinel gives it a real, visible home instead.
  const unmatchedRows = useMemo(
    () => (viewMode === 'staged' && units.length > 0 ? rows.filter((r) => !units.includes(r.circleSectorName)) : []),
    [rows, units, viewMode],
  );

  const unitRows = useMemo(() => {
    let filtered = activeUnit === UNMATCHED_UNIT_KEY
      ? unmatchedRows
      : visibleRows.filter((r) => r.circleSectorName === activeUnit);
    if (searchQ) {
      const q = searchQ.toLowerCase();
      filtered = filtered.filter(
        (r) => r.shopName.toLowerCase().includes(q) || r.shopId.toLowerCase().includes(q) || r.thanaName.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [visibleRows, activeUnit, searchQ, unmatchedRows]);

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

    const submittedByName = await promptDeoNameAndLock(district);
    if (!submittedByName) return;

    setUploading(true);
    let done = 0;
    let rejectedCount = 0;
    const rejectedReasons: string[] = [];

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
                rejectedCount += 1;
                if (!rejectedReasons.includes(rejected.reason)) rejectedReasons.push(rejected.reason);
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

    // Finalize district submission if every pending row has been attempted (uploaded or
    // rejected) — a row rejected by the Worker's own validation (e.g. duplicate shop_id,
    // revenue mismatch) does not block the other rows in the same submission.
    const stillPending = await stagingDb.getByStatus('pending');
    const summaryHtml = rejectedCount > 0
      ? `<p><b>${done}</b> of <b>${pending.length}</b> shop record(s) uploaded successfully.</p>
         <p style="margin-top:8px;color:#b91c1c"><b>${rejectedCount}</b> row(s) were rejected and were <b>not</b> saved:</p>
         <ul style="text-align:left;margin:4px auto;max-width:420px;color:#b91c1c">${rejectedReasons.map((r) => `<li>${r}</li>`).join('')}</ul>
         <p style="margin-top:8px;color:#64748b">Rejected rows are marked "error" in the Staged Data table above — fix the underlying data and re-upload just those shop IDs to include them.</p>`
      : `<p><b>${done}</b> shop record(s) uploaded successfully.</p>`;
    if (stillPending.length === 0) {
      const submitRes = await fetch(`/api/districts/${encodeURIComponent(district)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submittedByName }),
      });
      const Swal = (window as unknown as { Swal?: { fire: (o: unknown) => Promise<void> } }).Swal;
      if (submitRes.ok) {
        // District is now locked server-side. Wipe this device's local staging (both
        // pending/error rows and the old 'uploaded'-status cache) and re-seed it straight
        // from D1 — the same source /verify's own read-only view already trusts. Leaving
        // the pre-submit local cache in place is exactly what caused a later data-correction
        // unlock + re-upload to show old locally-cached rows sitting next to freshly staged
        // ones for the same shop (Rampur, 2026-08-03) — two different "truths" on screen at
        // once. Re-seeding now means a future unlock always starts from a clean, server-true slate.
        await stagingDb.clearAll();
        try {
          const shopsRes = await fetch(`/api/districts/${encodeURIComponent(district)}/shops`);
          if (shopsRes.ok) {
            const body = await shopsRes.json() as { rows: StagedRow[] };
            await stagingDb.putRows(body.rows.map((r) => ({ ...r, status: 'uploaded' as const })));
          }
        } catch {
          // Best-effort re-seed only — the district is already locked server-side regardless;
          // a failed re-seed just means the local "Shops Uploaded" cache stays empty until the
          // DEO next hits "Fetch from Server" on /home, not a data-loss risk.
        }
        setSubmitted(true);
        await loadUploadedRows();
        await Swal?.fire({
          icon: rejectedCount > 0 ? 'warning' : 'success',
          title: rejectedCount > 0 ? 'District submitted with some rows rejected' : 'District submitted!',
          html: summaryHtml,
        });
      } else {
        await Swal?.fire({
          icon: 'error',
          title: 'Submission failed',
          html: '<p>The district could not be marked as submitted. Your uploaded rows above are safe — please try Submit District again.</p>',
        });
      }
    }

    await loadRows();
    setUploading(false);
  }

  async function clearStagedData() {
    const Swal = (window as unknown as { Swal?: { fire: (o: unknown) => Promise<{ isConfirmed: boolean }> } }).Swal;
    const confirm = await Swal?.fire({
      icon: 'warning',
      title: 'Clear staged data?',
      html: `<p>This deletes all locally staged rows for <b>${district}</b> on this device — use this if the wrong Excel file was uploaded. Data already submitted to headquarters is not affected.</p>
             <p style="margin-top:8px;color:#64748b">यह इस डिवाइस पर staged किया गया सारा डेटा मिटा देगा। यह पूर्ववत नहीं किया जा सकता।</p>`,
      showCancelButton: true,
      confirmButtonText: 'Yes, clear it',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });
    if (!confirm?.isConfirmed) return;

    await stagingDb.clearAll();
    setRows([]);
    setViewMode('uploaded');
    const notyf = (window as unknown as { notyf?: { success: (m: string) => void } }).notyf;
    notyf?.success('Staged data cleared.');
  }

  // Seeded from the registered unit list first (falling back to whatever's actually in
  // visibleRows in 'uploaded' view, where `units` isn't the relevant list) so a registered
  // circle/sector with zero rows still gets a real 0-count card instead of silently having
  // no tab at all — the DEO can now see exactly which unit has no data, instead of a vague
  // "All units must have at least one row" message with no indication of which one.
  const unitNamesForSummary = viewMode === 'staged' && units.length > 0
    ? units
    : [...new Set(visibleRows.map((r) => r.circleSectorName))].filter(Boolean);
  const unitSummary: { key: string; name: string; count: number; uploaded: number; unmatched?: boolean }[] = unitNamesForSummary.map((u) => ({
    key: u,
    name: u,
    count: visibleRows.filter((r) => r.circleSectorName === u).length,
    uploaded: visibleRows.filter((r) => r.circleSectorName === u && r.status === 'uploaded').length,
  }));
  if (unmatchedRows.length > 0) {
    unitSummary.push({
      key: UNMATCHED_UNIT_KEY,
      name: 'Unregistered / Mismatched',
      count: unmatchedRows.length,
      uploaded: unmatchedRows.filter((r) => r.status === 'uploaded').length,
      unmatched: true,
    });
  }
  const missingUnits = units.filter((u) => !rows.some((r) => r.circleSectorName === u && r.status !== 'error'));

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
              <p><strong>"Unregistered / Mismatched" card</strong> (लाल border) — यह तभी दिखता है जब staged rows का circle_sector_name किसी भी रजिस्टर्ड unit से बिल्कुल मेल नहीं खाता (आमतौर पर टाइपो, या Excel में dropdown से select करने की बजाय column paste किया गया)। ये rows किसी असली unit tab में दिखाई नहीं देतीं और submit नहीं होतीं — इस card पर क्लिक करके देखें कि वास्तव में क्या नाम टाइप हुआ है, फिर सही unit नाम के साथ दोबारा अपलोड करें।</p>
              <p><strong>Workflow gate</strong> — जब तक कम से कम एक circle या sector मौजूद न हो, district डेटा अपलोड करना लॉक रहता है। पहले units बनाएं, फिर अपलोड करें, फिर verify करें।</p>
              <p><strong>View mode</strong> — <em>Staged Data</em> (आपकी local upload queue) और <em>Uploaded Data</em> (D1 से लोड की गई read-only district rows) के बीच स्विच करें। Dashboard पर "Shops Uploaded" कार्ड पर क्लिक करने पर, या नाव बार में "Uploaded Data" लिंक से, आप सीधे Uploaded Data view में पहुंच सकते हैं।</p>
              <p><strong>Clear Staged Data</strong> — गलत Excel फ़ाइल अपलोड हो जाने पर इस बटन से इस डिवाइस का सारा staged (अभी D1 में नहीं भेजा गया) डेटा मिटाया जा सकता है। यह पहले से D1 में सबमिट किया जा चुका डेटा नहीं हटाता — केवल इस डिवाइस की local staging को साफ करता है। इसके बाद सही फ़ाइल दोबारा अपलोड करें।</p>
              <p><strong>Adjacent Thana pills</strong> — &quot;Adjacent Thanas&quot; कॉलम में Thana के नाम pills के रूप में दिखाए जाते हैं। <span className="text-error font-semibold">लाल pills</span> का मतलब है कि यह नाम अभी तक इस district के अपने डेटा में कहीं और Thana के रूप में मौजूद नहीं है — आमतौर पर यह टाइपो होता है, लेकिन यह किसी वास्तविक Thana का नाम भी हो सकता है जिसकी कोई दुकान अभी अपलोड नहीं हुई। स्पेलिंग जांच लें; लाल pill होने से सबमिशन नहीं रुकता, और जांचने के लिए कोई राज्य-स्तरीय Thana मास्टर लिस्ट भी मौजूद नहीं है। जैसे ही वह नाम district के डेटा में कहीं आता है, pill अपने आप outlined हो जाती है।</p>
              <p><strong>Coordinates</strong> — <span className="text-warning">⚠ warning icon</span> का मतलब है coordinate UP bounding box के बाहर है। <span className="text-success">✓ icon</span> का मतलब valid है। सबमिट करने से पहले warnings की समीक्षा करें — इन्हें block नहीं किया जाता, लेकिन जांचना चाहिए।</p>
              <p><strong>Revenue column</strong> — financial fields से अपने-आप calculate होता है। अगर कोई value गलत लगे, तो Excel फ़ाइल में वापस जाकर सही version दोबारा अपलोड करें।</p>
              <p><strong>Submit District</strong> — यह बटन तभी सक्रिय होता है जब सभी registered units में बिना किसी error वाली कम से कम एक row हो। इस पर क्लिक करने से सभी pending rows अपलोड हो जाती हैं और district headquarters को सबमिट के रूप में मार्क हो जाता है।</p>
            </>}
          >
            <p><strong>Unit tabs</strong> — Click a unit card to switch between circles/sectors. Each card shows how many rows have been uploaded. All units must have at least one row before submission is allowed.</p>
            <p><strong>"Unregistered / Mismatched" card</strong> (red border) — only appears when some staged rows' circle_sector_name doesn't exactly match any registered unit (usually a typo, or the column was pasted into Excel instead of picked from the dropdown). These rows don't show up under any real unit tab and won't be submitted — click this card to see what name was actually typed, then re-upload with the correct unit name.</p>
            <p><strong>Workflow gate</strong> — Uploading district data is locked until at least one circle or sector exists. Create units first, then upload, then verify.</p>
            <p><strong>View mode</strong> — Switch between <em>Staged Data</em> (your local upload queue) and <em>Uploaded Data</em> (read-only district rows loaded from D1). You can jump straight to the Uploaded Data view from the "Shops Uploaded" card on your Dashboard, or the "Uploaded Data" link in the nav bar.</p>
            <p><strong>Clear Staged Data</strong> — If the wrong Excel file was uploaded, this button erases all locally staged data (rows not yet sent to D1) on this device. It does not affect anything already submitted to D1 — only this device's local staging is cleared. Re-upload the correct file afterward.</p>
            <p><strong>Adjacent Thana pills</strong> — Thana names in the &quot;Adjacent Thanas&quot; column are shown as pills. <span className="text-error font-semibold">Red pills</span> mean that name doesn&apos;t (yet) appear as a Thana elsewhere in this district&apos;s own data — usually a typo, but it could also be a real Thana with no shop uploaded here. Double-check the spelling; a red pill does not block submission, and there is no state-wide Thana master list to check against. Once the name appears somewhere in this district&apos;s data, its pill turns outlined automatically.</p>
            <p><strong>Coordinates</strong> — A <span className="text-warning">⚠ warning icon</span> means the coordinate is outside the UP bounding box. A <span className="text-success">✓ icon</span> means valid. Review warnings before submitting — they are not blocked, but should be verified.</p>
            <p><strong>Revenue column</strong> — Calculated automatically from the financial fields. If a value looks wrong, go back to the Excel file and re-upload a corrected version.</p>
            <p><strong>Submit District</strong> — The button activates only when all registered units have at least one row with no errors. Clicking it uploads all pending rows and marks the district as submitted to headquarters.</p>
          </HelpPanel>
        </div>
        <div className={`flex gap-2 flex-wrap justify-end ${(uploadedLoading || uploading) ? 'pointer-events-none opacity-50' : ''}`}>
          {!submitted && (
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
          )}
          {!submitted && (
            <button
              className="btn btn-outline btn-error btn-sm"
              onClick={clearStagedData}
              disabled={rows.length === 0}
              title="Delete all locally staged rows for this district (use this if the wrong Excel file was uploaded)"
            >
              Clear Staged Data
            </button>
          )}
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
          <div key={u.key} className={`card p-3 shadow cursor-pointer transition-colors ${u.unmatched ? 'border-2 border-error' : ''} ${activeUnit === u.key ? 'bg-primary text-primary-content' : 'bg-base-100 hover:bg-base-200'}`}
            onClick={() => { setActiveUnit(u.key); setPage(1); }}
            role="button" tabIndex={0} aria-pressed={activeUnit === u.key}
            onKeyDown={(e) => e.key === 'Enter' && setActiveUnit(u.key)}
            title={u.unmatched ? "These rows' circle/sector name doesn't match any registered unit — check for typos, or select from the dropdown instead of typing/pasting." : undefined}
          >
            <p className="font-semibold text-sm truncate">{u.name}</p>
            <p className="text-xs mt-1">{u.uploaded}/{u.count} uploaded</p>
            {u.unmatched
              ? <span className="badge badge-error badge-xs mt-1">Fix these — not registered</span>
              : u.count === 0 && <span className="badge badge-error badge-xs mt-1">No data</span>}
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

      {/* Submit button — gated on completeness. Hidden once submitted: nothing new can be
          staged until an admin approves a data-correction unlock (see /upload). */}
      {submitted ? (
        <div className="alert alert-success text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>
          <div>
            <p className="font-semibold">{district} has been submitted to headquarters — this is a read-only view of the uploaded data.</p>
            <p className="text-xs opacity-80 mt-1">Found wrong data for a shop? Go to <Link href="/upload" className="link font-semibold">Upload</Link> and request a data-correction unlock.</p>
          </div>
        </div>
      ) : (
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
          {!canSubmit && unitsReady && units.length > 0 && viewMode === 'staged' && (
            <p className="text-sm text-warning" role="alert">
              {missingUnits.length > 0
                ? <>These registered units have no uploaded data yet: <strong>{missingUnits.join(', ')}</strong>. Every registered circle/sector needs at least one row before you can submit.</>
                : 'All units must have at least one row to enable submission.'}
            </p>
          )}
        </div>
      )}

      {/* Print stylesheet applies via global CSS */}
      <style>{`@media print{.btn,.join,.select,.input{display:none!important}}`}</style>
    </div>
  );
}
