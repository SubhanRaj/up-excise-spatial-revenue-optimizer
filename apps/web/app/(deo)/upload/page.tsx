'use client';

import { useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { stagingDb } from '@/lib/db';

export default function UploadPage() {
  const { user } = useUser();
  const district = (user?.publicMetadata as { districtName?: string })?.districtName ?? '';
  const uploadedByDeo = (user?.publicMetadata as { deoId?: string })?.deoId ?? user?.id ?? '';
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'done' | 'error'>('idle');
  const [rowCount, setRowCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    if (!file.name.endsWith('.xlsx')) {
      (window as unknown as { Swal?: { fire: (o: unknown) => void } }).Swal?.fire({
        icon: 'error', title: 'Invalid file', text: 'Please upload an .xlsx file.',
      });
      return;
    }
    setStatus('parsing');
    setProgress(0);

    try {
      // SheetJS loaded dynamically from CDN — not bundled
      const { parseExcelFile } = await import('@/lib/excel');
      const rows = await parseExcelFile(file, district, uploadedByDeo, setProgress);
      await stagingDb.putRows(rows);
      setRowCount(rows.length);
      setStatus('done');

      const notyf = (window as unknown as { notyf?: { success: (m: string) => void } }).notyf;
      notyf?.success(`Parsed ${rows.length} rows and saved to local storage.`);
    } catch (err) {
      setStatus('error');
      console.error(err);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card bg-base-100 shadow p-6">
        <h2 className="text-xl font-bold mb-4">Upload District Excel — {district}</h2>
        <p className="text-sm text-base-content/70 mb-6">
          Upload the consolidated district Excel file. All rows are parsed in the browser — no data leaves your device until you submit on the Verify page.
        </p>

        {/* Drag-and-drop upload zone */}
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
          <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-base-content/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19l2-7h13l-2 7H5z"/><path d="M5 19H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v1"/></svg>
          <span className="font-medium">Drop your district .xlsx file here or click to browse</span>
          <span className="text-sm text-base-content/60">One consolidated file per district</span>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            aria-label="Select Excel file"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
          />
        </div>

        {/* Progress bar */}
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
            Failed to parse file. Check the format and try again.
          </div>
        )}
      </div>
    </div>
  );
}
