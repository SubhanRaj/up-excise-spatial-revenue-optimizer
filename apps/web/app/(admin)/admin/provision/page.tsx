'use client';

import { useRef, useState } from 'react';
import { generateProvisionTemplate } from '@/lib/excel';
import HelpPanel from '@/app/_components/HelpPanel';

interface ProvisionRow {
  districtName: string; division: string; deoName: string;
  deoEmail: string; deoId: string; expectedVendCount: number;
}

export default function ProvisionPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ProvisionRow[]>([]);
  const [result, setResult] = useState<{ email: string; status: string }[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleFile(file: File) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]!];
    const raw = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
    const rows: ProvisionRow[] = raw.map((r) => ({
      districtName: String(r['District Name'] ?? ''),
      division: String(r['Division'] ?? ''),
      deoName: String(r['DEO Name'] ?? ''),
      deoEmail: String(r['DEO Email'] ?? ''),
      deoId: String(r['DEO Identifier'] ?? ''),
      expectedVendCount: Number(r['Expected Vend Count'] ?? 0),
    }));
    setPreview(rows);
  }

  async function downloadTemplate() {
    const blob = await generateProvisionTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'deo-provision-template.xlsx'; a.click();
    URL.revokeObjectURL(url);
  }

  async function provision() {
    setLoading(true);
    const res = await fetch('/api/admin/bulk-provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: preview }),
    });
    const data = await res.json() as { results: { email: string; status: string }[] };
    setResult(data.results);
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <HelpPanel pageKey="admin_provision" title="Bulk DEO Provisioning — How it works">
        <ol className="list-decimal list-inside space-y-1">
          <li><strong>Download the template</strong> — click "Download Template" to get the Excel file with the correct columns pre-filled.</li>
          <li><strong>Fill it in</strong> — one row per DEO: District Name, Division, DEO Name, DEO Email, DEO Identifier, Expected Vend Count.</li>
          <li><strong>Upload the file</strong> — drag-drop or click to select. SheetJS previews the rows in-browser before anything is sent.</li>
          <li><strong>Confirm provision</strong> — click "Provision All" to create accounts and dispatch magic-link emails to all DEOs in one request.</li>
        </ol>
        <p className="mt-1 text-base-content/60">DEOs who already have accounts are skipped automatically. Email failures are reported per-row without rolling back the DB write.</p>
      </HelpPanel>
      <div className="card bg-base-100 shadow p-6">
        <h2 className="text-xl font-bold mb-2">Bulk DEO Provisioning</h2>
        <p className="text-sm text-base-content/70 mb-4">
          Upload a DEO Excel file with columns: <strong>District Name, Division, DEO Name, DEO Email, DEO Identifier, Expected Vend Count</strong>.
          SheetJS parses the file in-browser; no data is sent until you confirm below.
        </p>

        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <button className="btn btn-outline btn-sm" onClick={downloadTemplate} aria-label="Download blank DEO provision template">
            {/* tabler:download */}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 11 12 16 17 11"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
            Download Blank Template
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => inputRef.current?.click()} aria-label="Select filled DEO Excel file">
            {/* tabler:file-spreadsheet */}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M8 11h8"/><path d="M8 15h8"/><path d="M11 11v8"/></svg>
            Upload Filled DEO File
          </button>
        </div>

        <input ref={inputRef} type="file" accept=".xlsx" className="hidden" aria-label="Select DEO provision Excel"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />

        {preview.length > 0 && (
          <>
            <div className="overflow-x-auto mt-4">
              <table className="table table-xs w-full" role="grid" aria-label="DEO provision preview">
                <thead><tr><th>District</th><th>Division</th><th>DEO Name</th><th>Email</th><th>ID</th><th>Expected</th></tr></thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} role="row">
                      <td>{r.districtName}</td><td>{r.division}</td><td>{r.deoName}</td>
                      <td>{r.deoEmail}</td><td>{r.deoId}</td><td>{r.expectedVendCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-primary mt-4" onClick={provision} disabled={loading}>
              {loading ? <span className="loading loading-spinner loading-sm" /> : (
                <>
                  {/* tabler:user-check */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="m16 11 2 2 4-4"/></svg>
                  Provision {preview.length} DEOs
                </>
              )}
            </button>
          </>
        )}

        {result.length > 0 && (
          <div className="mt-4 space-y-1">
            {result.map((r) => (
              <div key={r.email} className={`alert alert-xs ${r.status === 'error' ? 'alert-error' : 'alert-success'} py-2`}>
                {r.email}: {r.status}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
