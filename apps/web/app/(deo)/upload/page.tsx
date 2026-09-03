'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { stagingDb, ensureDistrictSynced } from '@/lib/db';
import HelpPanel from '@/app/_components/HelpPanel';
import { isLocked } from '@/lib/status';

export default function UploadPage() {
  const router = useRouter();
  const { session } = useSession();
  const district = session?.districtName ?? '';
  const uploadedByDeo = session?.deoId ?? '';
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'done' | 'error'>('idle');
  const [parseError, setParseError] = useState('');
  const [rowCount, setRowCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [units, setUnits] = useState<{ id: number; name: string; type: string }[]>([]);
  const [unitsChecked, setUnitsChecked] = useState(false);
  const [districtStatus, setDistrictStatus] = useState<string>('pending');
  const [unlockRequest, setUnlockRequest] = useState<{ status: 'pending' | 'approved' | 'denied'; reason: string; adminNote: string | null } | null>(null);
  const [requestingUnlock, setRequestingUnlock] = useState(false);

  const loadStatus = useCallback(() => {
    if (!district) return;
    // No setUnitsChecked(false) here — this also runs after submitting an unlock request
    // (see requestCorrectionUnlock below), and resetting it would flip the whole page back
    // to the full-page "Checking…" loader instead of just refreshing the banner in place.
    Promise.all([
      fetch(`/api/districts/${encodeURIComponent(district)}/units`)
        .then((res) => (res.ok ? res.json() as Promise<{ id: number; name: string; type: string }[]> : [])),
      fetch(`/api/districts/${encodeURIComponent(district)}/status`)
        .then((res) => (res.ok ? res.json() as Promise<{ districtStatus: string }> : { districtStatus: 'pending' })),
      fetch(`/api/districts/${encodeURIComponent(district)}/request-unlock`)
        .then((res) => (res.ok ? res.json() as Promise<{ request: typeof unlockRequest }> : { request: null })),
    ]).then(([unitsData, statusData, reqData]) => {
      setUnits(unitsData);
      setDistrictStatus(statusData.districtStatus);
      setUnlockRequest(reqData.request);
    }).finally(() => setUnitsChecked(true));
  }, [district]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const hasUnits = units.length > 0;
  const submitted = isLocked(districtStatus);

  // Hard gate — this page is not reachable until circles/sectors are locked, matching the
  // server-side rejection every units-dependent API route already enforces. No degraded
  // "locked" view is shown here; the DEO is bounced straight back to /units.
  useEffect(() => {
    if (unitsChecked && !hasUnits) router.replace('/units');
  }, [unitsChecked, hasUnits, router]);

  if (!unitsChecked || !hasUnits) {
    return <div className="text-sm text-base-content/60 p-6">Checking your circles and sectors…</div>;
  }

  async function requestCorrectionUnlock() {
    const Swal = (window as unknown as { Swal?: { fire: (o: unknown) => Promise<{ isConfirmed: boolean; value?: string }> } }).Swal;
    const result = await Swal?.fire({
      icon: 'question',
      title: 'Request data-correction unlock?',
      html: `<p style="text-align:left">Explain which shop(s) had wrong data and what needs fixing for <b>${district}</b>. An Admin will review and either unlock re-uploading or deny the request. This does <b>not</b> delete anything already submitted — you'll re-upload a corrected file, which only updates the shop(s) you changed.</p>
             <p style="text-align:left;margin-top:6px;color:#64748b">बताएं कि किस दुकान का डेटा गलत था और क्या ठीक करना है। एक Admin इसकी समीक्षा करेगा। इससे पहले से सबमिट किया गया कोई भी डेटा हटता नहीं है — आप एक सुधारी हुई फ़ाइल दोबारा अपलोड करेंगे, जो केवल उन्हीं दुकानों को अपडेट करेगी।</p>`,
      input: 'textarea',
      inputPlaceholder: 'Reason (required)',
      showCancelButton: true,
      confirmButtonText: 'Submit Request',
      cancelButtonText: 'Cancel',
      inputValidator: (value: string) => (value && value.trim() ? undefined : 'Please enter a reason.'),
    } as unknown);
    if (!result?.isConfirmed) return;

    setRequestingUnlock(true);
    try {
      const res = await fetch(`/api/districts/${encodeURIComponent(district)}/request-unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: String(result.value ?? '').trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        await Swal?.fire({ icon: 'error', title: 'Could not submit request', text: body.error ?? 'Please try again.' });
        return;
      }
      void Swal?.fire({
        toast: true, position: 'top-end', icon: 'success', title: 'Unlock request submitted.',
        showConfirmButton: false, timer: 3500, timerProgressBar: true,
      });
      loadStatus();
    } finally {
      setRequestingUnlock(false);
    }
  }

  if (submitted) {
    return (
      <div className="card bg-base-100 shadow p-8 space-y-5 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-success/15 text-success shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>
          </span>
          <div>
            <p className="font-semibold">{district} has already been submitted to headquarters.</p>
            <p className="text-xs text-base-content/60">यह जिला पहले ही headquarters को सबमिट किया जा चुका है — नया डेटा अपलोड करने के लिए लॉक है।</p>
          </div>
        </div>

        <button className="btn btn-outline btn-sm self-start" onClick={downloadTemplate} aria-label="Download district Excel template">
          {/* tabler:download */}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 11 12 16 17 11"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
          Download Current Data (.xlsx)
        </button>

        {unlockRequest?.status === 'pending' ? (
          <div className="alert alert-info text-sm">
            <span className="loading loading-spinner loading-sm shrink-0" />
            <div>
              <p className="font-semibold">Data-correction unlock request pending Admin review.</p>
              <p className="text-xs opacity-80 mt-1">&quot;{unlockRequest.reason}&quot;</p>
            </div>
          </div>
        ) : (
          <>
            {unlockRequest?.status === 'denied' && (
              <div className="alert alert-error text-sm">
                <p className="font-semibold">Your last correction request was denied.</p>
                {unlockRequest.adminNote && <p className="text-xs opacity-80 mt-1">&quot;{unlockRequest.adminNote}&quot;</p>}
              </div>
            )}
            <p className="text-sm text-base-content/80">
              Found wrong data for one or more shops? Request a data-correction unlock — an Admin can approve it so you can re-upload just the corrected rows. This never deletes your submitted data; a re-upload only updates the shop(s) you changed.
            </p>
            <button className="btn btn-primary self-start" onClick={requestCorrectionUnlock} disabled={requestingUnlock}>
              {requestingUnlock ? <span className="loading loading-spinner loading-xs" /> : 'Request Data-Correction Unlock'}
            </button>
          </>
        )}

        <div className="divider my-0" />
        <p className="text-sm text-base-content/80">
          Already have your corrected file ready? Select it below — it's parsed and saved on this device now. It reaches headquarters once your unlock is approved and you submit again on the Verify page.
        </p>
        {renderDropzone()}
      </div>
    );
  }

  // Pre-fills the downloaded template with the district's current D1 data — a data-correction
  // unlock resets districts.status but never touches phase1_raw_collection, so on the
  // re-download after an unlock the DEO is editing the real existing rows in place rather than
  // retyping the whole district from memory. force:true always hits D1 fresh (M-91) rather than
  // trusting the shared sync flag — this button is rarely clicked, so correctness matters far
  // more than saving one D1 read, and it's the button a DEO relies on to know their download is
  // actually current. A first-ever upload with no D1 rows yet naturally comes back empty and
  // the sheet is blank as before.
  async function downloadTemplate() {
    const existingRows = district ? await ensureDistrictSynced(district, true) : [];
    const { generateTemplate } = await import('@/lib/excel');
    const blob = await generateTemplate(district, units.map((u) => u.name), existingRows);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${district}-template.xlsx`; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File) {
    if (!file.name.endsWith('.xlsx')) {
      (window as unknown as { Swal?: { fire: (o: unknown) => void } }).Swal?.fire({
        icon: 'error', title: 'Invalid file', text: 'Please upload an .xlsx file.',
      });
      return;
    }
    setStatus('parsing');
    setParseError('');
    setProgress(0);

    try {
      // ExcelJS loaded dynamically from CDN — not bundled
      const { parseExcelFile } = await import('@/lib/excel');
      const rows = await parseExcelFile(file, district, uploadedByDeo, setProgress, units.map((u) => u.name));
      await stagingDb.putRows(rows);
      setRowCount(rows.length);
      setStatus('done');

      const notyf = (window as unknown as { notyf?: { success: (m: string) => void } }).notyf;
      notyf?.success(`Parsed ${rows.length} rows and saved to local storage.`);
    } catch (err) {
      setStatus('error');
      setParseError(err instanceof Error ? err.message : 'Please check the file and try again.');
      console.error(err);
    }
  }

  function renderDropzone() {
    return (
      <>
        <div
          className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-primary/50'}`}
          role="button"
          aria-label="Upload Excel file — drag and drop or click to browse"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) void handleFile(f);
          }}
        >
          {/* tabler:folder-open */}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-base-content/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19l2-7h13l-2 7H5z"/><path d="M5 19H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v1"/></svg>
          <span className="font-medium">Drop your district .xlsx file here or click to browse</span>
          <span className="text-sm text-base-content/80">One consolidated file per district</span>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            aria-label="Select Excel file"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
          />
        </div>

        {status === 'parsing' && (
          <div className="mt-4" aria-live="polite" aria-label={`Parsing progress: ${progress}%`}>
            <p className="text-sm mb-1">Parsing rows… {progress}%</p>
            <progress className="progress progress-primary w-full" value={progress} max={100} />
          </div>
        )}

        {status === 'done' && (
          <div className="alert alert-success mt-4" role="alert" aria-live="polite">
            {/* tabler:circle-check */}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>
            Parsed and staged <strong>{rowCount}</strong> rows.{' '}
            <a href="/verify" className="link font-semibold">Go to Verify →</a>
          </div>
        )}

        {status === 'error' && (
          <div className="alert alert-error mt-4" role="alert" aria-live="assertive">
            {/* tabler:circle-x */}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m10 10 4 4m0-4-4 4"/></svg>
            {parseError || 'Failed to parse file. Check the format and try again.'}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card bg-base-100 shadow p-6">
        <div className="flex items-start justify-between flex-wrap gap-2 mb-4">
          <div>
            <h2 className="text-xl font-bold">Upload District Excel — {district}</h2>
            <p className="text-xs text-base-content/60">जिला एक्सेल फ़ाइल अपलोड करें</p>
          </div>
          <HelpPanel
            pageKey="upload"
            title="Upload — What file to upload and how"
            titleHi="Upload — कौन सी फ़ाइल अपलोड करनी है और कैसे"
            childrenHi={<>
              <p><strong>क्या अपलोड करें:</strong> एक ही consolidated district Excel फ़ाइल (.xlsx) जिसे आपके Inspectors ने <Link href="/units" className="link">Circles page</Link> से डाउनलोड किए गए template का उपयोग करके भरा है।</p>
              <p className="bg-error/10 border border-error/30 rounded px-3 py-2"><strong>⚠ "Shop Type" और "Circle / Sector Name" कॉलम — केवल dropdown से चुनें, खुद टाइप या paste न करें।</strong> Excel की dropdown जांच typed/pasted value पर काम नहीं करती, इसलिए "Circle 1" या "Composite Shop" जैसी गलत value (सही dropdown option की बजाय) बिना रोक-टोक स्वीकार हो जाती है और बाद में उसे ठीक करना मुश्किल होता है। हमेशा सेल पर क्लिक करके dropdown arrow से ही value चुनें।</p>
              <p><strong>अपलोड करने से पहले:</strong> सुनिश्चित करें कि सभी Inspectors ने अपने भरे हुए सेक्शन वापस दिए हैं और आपने उन्हें एक फ़ाइल में मिला दिया है। हर row में <code>circle_sector_name</code> का एक value होना चाहिए जो किसी पहले से रजिस्टर्ड unit से मेल खाता हो।</p>
              <p><strong>Column format:</strong> पहली row में column headers होने चाहिए (जैसा डाउनलोड किए गए template में है)। headers के ऊपर कोई अतिरिक्त row न जोड़ें।</p>
              <p><strong>Coordinates:</strong> या तो DMS columns (<code>latitude_dms</code> / <code>longitude_dms</code>) का उपयोग करें या decimal degree columns (<code>latitude_decimal</code> / <code>longitude_decimal</code>) का — दोनों का नहीं। DMS को प्राथमिकता दी जाती है।</p>
              <p><strong>सारा डेटा आपके डिवाइस पर ही रहता है</strong> जब तक आप Verify page पर जाकर Submit District पर क्लिक नहीं करते। Parsing पूरी तरह browser में होती है — अपलोड के दौरान कुछ भी सर्वर पर नहीं भेजा जाता।</p>
              <p><strong>दोबारा अपलोड करना:</strong> नई फ़ाइल अपलोड करने से इस district का सारा staged डेटा बदल जाता है। जो rows पहले से "uploaded" मार्क हैं, वे सुरक्षित रहती हैं।</p>
              <p><strong>Excel version:</strong> टेम्पलेट केवल Microsoft Excel 2013 या नए वर्शन में भरें (या Excel Online)। पुराने Excel (2007/2010) में इसके dropdown और validation rules सही से नहीं दिखते, जिससे गलत डेटा बिना पकड़े भर सकता है।</p>
              <p><strong>HBR Shop ID:</strong> HBR (Hotel/Bar/Restaurant) दुकानों के लिए, Shop ID में "HBR" शामिल करें (जैसे <code>HBR001</code>) ताकि bar license सिर्फ ID से पहचाने जा सकें। यह एक सुझाव है — पुराने डेटा में इस pattern के बिना दी गई ID अस्वीकार नहीं होगी।</p>
            </>}
          >
            <p><strong>What to upload:</strong> The single consolidated district Excel file (.xlsx) your Inspectors filled using the template downloaded from the <Link href="/units" className="link">Circles page</Link>.</p>
            <p className="bg-error/10 border border-error/30 rounded px-3 py-2"><strong>⚠ "Shop Type" and "Circle / Sector Name" columns — always pick from the dropdown, never type or paste your own text.</strong> Excel's dropdown check does not run on typed/pasted values, so a wrong value like "Circle 1" or "Composite Shop" (instead of the exact dropdown option) is silently accepted by Excel and only surfaces as an error later, or worse, gets misfiled with no error at all. Always click the cell and choose from its dropdown arrow.</p>
            <p><strong>Before uploading:</strong> Ensure all Inspectors have returned their filled sections and you have consolidated them into one file. Every row must have a <code>circle_sector_name</code> value matching a pre-registered unit.</p>
            <p><strong>Column format:</strong> The first row must be the column headers (as in the downloaded template). Do not add extra rows above the headers.</p>
            <p><strong>Coordinates:</strong> Use either DMS columns (<code>latitude_dms</code> / <code>longitude_dms</code>) or decimal degree columns (<code>latitude_decimal</code> / <code>longitude_decimal</code>) — not both. DMS takes precedence.</p>
            <p><strong>All data stays on your device</strong> until you go to the Verify page and click Submit District. Parsing happens entirely in-browser — nothing is sent to the server during upload.</p>
            <p><strong>Re-uploading:</strong> Uploading a new file replaces all staged data for this district. Rows already marked "uploaded" are preserved.</p>
            <p><strong>Excel version:</strong> Fill the template only in Microsoft Excel 2013 or later (or Excel Online). Excel 2007/2010 do not reliably show the template's dropdowns and validation rules, which can let wrong data get typed in undetected.</p>
            <p><strong>HBR Shop ID:</strong> For HBR (Hotel/Bar/Restaurant) shops, include "HBR" in the Shop ID (e.g. <code>HBR001</code>) so bar licenses are identifiable by ID alone. This is a soft suggestion — existing data with IDs that don't follow this pattern is never rejected.</p>
          </HelpPanel>
        </div>
        <p className="text-sm text-base-content/90 mb-6">
          Upload the consolidated district Excel file. All rows are parsed in the browser — no data leaves your device until you submit on the Verify page.
        </p>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <button className="btn btn-outline btn-sm" onClick={downloadTemplate} aria-label="Download district data Excel file">
            {/* tabler:download */}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 11 12 16 17 11"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
            Download District Data (.xlsx)
          </button>
          <Link href="/units" className="btn btn-ghost btn-sm">Go to Circles &amp; Sectors</Link>
        </div>

        {renderDropzone()}
      </div>
    </div>
  );
}
