'use client';

import { useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';

const WORKER = process.env.NEXT_PUBLIC_WORKER_URL ?? '';

interface ProvisionRow {
  districtName: string; division: string; deoName: string;
  deoEmail: string; deoId: string; expectedVendCount: number;
}

declare const XLSX: {
  read: (data: ArrayBuffer, opts: { type: string }) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: { sheet_to_json: (ws: unknown) => Record<string, unknown>[] };
};

export default function ProvisionPage() {
  const { getToken } = useAuth();
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

  async function provision() {
    setLoading(true);
    const token = await getToken();
    const res = await fetch(`${WORKER}/api/admin/bulk-provision`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: preview }),
    });
    const data = await res.json() as { results: { email: string; status: string }[] };
    setResult(data.results);
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="card bg-base-100 shadow p-6">
        <h2 className="text-xl font-bold mb-4">Bulk DEO Provisioning</h2>
        <p className="text-sm text-base-content/70 mb-4">
          Upload a DEO Excel file with columns: District Name, Division, DEO Name, DEO Email, DEO Identifier, Expected Vend Count.
          SheetJS parses in-browser; no data leaves until you confirm below.
        </p>

        <button className="btn btn-outline" onClick={() => inputRef.current?.click()}>
          {/* tabler:file-spreadsheet */}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M8 11h8"/><path d="M8 15h8"/><path d="M11 11v8"/></svg>
          Select DEO Excel File
        </button>
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
