'use client';

const WORKER = process.env.NEXT_PUBLIC_WORKER_URL ?? '';

export default function ExportPage() {
  async function downloadAll() {
    const token = await (window as unknown as { Clerk?: { session?: { getToken: () => Promise<string> } } }).Clerk?.session?.getToken();
    const res = await fetch(`${WORKER}/api/admin/export/all`, { headers: { Authorization: `Bearer ${token}` } });
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
        ⬇️ Download Full State Data (CSV)
      </button>
    </div>
  );
}
