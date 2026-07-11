'use client';

import { useEffect, useState } from 'react';
import HelpPanel from '@/app/_components/HelpPanel';
import { adminExportCache } from '@/lib/db';

function fmtAge(ms: number) {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export default function ExportPage() {
  const [loading, setLoading] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);

  useEffect(() => {
    adminExportCache.get().then((c) => {
      if (c) { setCachedAt(c.fetchedAt); setRowCount(c.data.length); }
    });
  }, []);

  async function refreshAndDownload() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/export/all');
      const data = await res.json() as { rows: unknown[] };
      await adminExportCache.set(data.rows);
      const ts = Date.now();
      setCachedAt(ts);
      setRowCount(data.rows.length);
      await writeXlsx(data.rows);
    } finally {
      setLoading(false);
    }
  }

  async function downloadFromCache() {
    setLoading(true);
    try {
      const c = await adminExportCache.get();
      if (c) await writeXlsx(c.data);
    } finally {
      setLoading(false);
    }
  }

  async function writeXlsx(rows: unknown[]) {
    const { exportRowsToXlsx } = await import('@/lib/excel');
    await exportRowsToXlsx(rows as Record<string, unknown>[], {
      sheetName: 'Phase 1 Data',
      filename: 'phase1-all-districts.xlsx',
    });
  }

  return (
    <div className="card bg-base-100 shadow p-6 space-y-5">
      <div className="flex items-start gap-3 flex-wrap">
        <h2 className="text-xl font-bold">Export Data</h2>
        <HelpPanel pageKey="admin_export" title="Full State Export — How it works">
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Format</strong> — Excel (.xlsx) generated in-browser via ExcelJS. No CSV — comma-containing fields like adjacent thanas are correctly quoted.</li>
            <li><strong>IndexedDB cache</strong> — fetched data is stored in <code>excise-admin</code> IndexedDB so you can re-export without a second network round-trip.</li>
            <li><strong>Refresh &amp; Download</strong> — re-fetches from D1 and updates the cache.</li>
            <li><strong>Download from Cache</strong> — uses the previously fetched copy (faster, no network call).</li>
            <li><strong>Per-district export</strong> — use the "Export XLSX" button on the district detail page instead (uses already-loaded data, instant).</li>
          </ul>
        </HelpPanel>
      </div>

      {cachedAt !== null && (
        <div className="flex items-center gap-2 text-sm bg-base-200 rounded-lg px-4 py-2.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-success shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/><path d="m9 12 2 2 4-4"/></svg>
          <span className="text-base-content/90">Cached — <strong className="text-base-content">{rowCount?.toLocaleString()} rows</strong>, last fetched {fmtAge(cachedAt)}</span>
          <button className="btn btn-xs btn-ghost ml-auto" onClick={() => adminExportCache.clear().then(() => { setCachedAt(null); setRowCount(null); })}>Clear cache</button>
        </div>
      )}

      <p className="text-sm text-base-content/90">
        Downloads the full Phase 1 dataset as an Excel file. ExcelJS generates the .xlsx in-browser —
        no server-side spreadsheet library required. Fetched data is cached in IndexedDB for offline re-export.
      </p>

      <div className="flex flex-wrap gap-3">
        <button className="btn btn-primary" onClick={refreshAndDownload} disabled={loading}>
          {loading
            ? <><span className="loading loading-spinner loading-sm" /> Fetching &amp; generating…</>
            : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 11 12 16 17 11"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
                {cachedAt ? 'Refresh & Download' : 'Fetch & Download XLSX'}
              </>
            )}
        </button>

        {cachedAt !== null && (
          <button className="btn btn-outline" onClick={downloadFromCache} disabled={loading}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 11 12 16 17 11"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
            Download from Cache
          </button>
        )}
      </div>
    </div>
  );
}
