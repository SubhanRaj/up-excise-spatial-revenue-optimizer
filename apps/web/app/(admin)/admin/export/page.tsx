'use client';

export default function ExportPage() {
  async function downloadAll() {
    const res = await fetch('/api/admin/export/all');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'phase1-all-districts.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card bg-base-100 shadow p-6 space-y-4">
      <h2 className="text-xl font-bold">Export Data</h2>
      <p className="text-sm text-base-content/70">
        Downloads the full Phase 1 dataset as a CSV file. This triggers a file download only —
        full-state data is never rendered in a UI table.
      </p>
      <button className="btn btn-primary" onClick={downloadAll}>
        {/* tabler:download */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 11 12 16 17 11"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
        Download Full State Data (CSV)
      </button>
    </div>
  );
}
