'use client';

import { useEffect, useRef, useState } from 'react';
import { generateProvisionTemplate } from '@/lib/excel';
import HelpPanel from '@/app/_components/HelpPanel';
import { useAdminDistricts } from '@/hooks/useAdminDistricts';
import { adminDistrictsCache } from '@/lib/db';
import { useSession } from '@/hooks/useSession';
import { EditDistrictDrawer as EditDrawer, type DistrictRow } from '@/app/_components/EditDistrictDrawer';
import { statusLabel, statusBadgeClass } from '@/lib/status';

export default function DistrictMasterPage() {
  const { session } = useSession();
  const restricted = session != null && session.role !== 'superadmin';
  const { districts: hookDistricts, loading } = useAdminDistricts();
  const [districtRows, setDistrictRows] = useState<DistrictRow[]>([]);
  const [editing, setEditing] = useState<DistrictRow | null>(null);
  const [resetting, setResetting] = useState(false);

  // Seed local state from hook once data arrives
  useEffect(() => {
    if (!loading && hookDistricts.length > 0 && districtRows.length === 0) {
      setDistrictRows(hookDistricts as DistrictRow[]);
    }
  }, [loading, hookDistricts, districtRows.length]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ districtName: string; division: string; deoName: string; deoEmail: string; deoId: string; expectedVendCount: number }[]>([]);
  const [result, setResult] = useState<{ email: string; status: string }[]>([]);
  const [provisioning, setProvisioning] = useState(false);

  function applyEdit(name: string, updated: Partial<DistrictRow>) {
    setDistrictRows((rows) => rows.map((r) => r.name === name ? { ...r, ...updated } : r));
    setEditing(null);
    adminDistrictsCache.invalidate();
  }

  async function handleFile(file: File) {
    const { readWorkbookRows } = await import('@/lib/excel');
    const raw = await readWorkbookRows(file);
    setPreview(raw.map((r) => ({
      districtName: String(r['District Name'] ?? ''),
      division: String(r['Division'] ?? ''),
      deoName: String(r['DEO Name'] ?? ''),
      deoEmail: String(r['DEO Email'] ?? ''),
      deoId: String(r['DEO Identifier'] ?? ''),
      expectedVendCount: Number(r['Expected Vend Count'] ?? 0),
    })));
  }

  async function downloadTemplate() {
    const blob = await generateProvisionTemplate(districtRows.map((d) => ({
      districtName: d.name, division: d.division, deoName: d.deoName, deoEmail: d.deoEmail,
      deoId: d.deoId, expectedVendCount: d.expectedVendCount,
    })));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'deo-provision-template.xlsx'; a.click();
    URL.revokeObjectURL(url);
  }

  async function resetTestData() {
    const Swal = (window as unknown as { Swal?: { fire: (o: Record<string, unknown>) => Promise<{ isConfirmed: boolean }> } }).Swal;
    const confirmed = await Swal?.fire({
      icon: 'warning',
      title: 'Reset all test data?',
      html: '<p>This will delete <b>ALL</b> shop data, circles/sectors, audit log, and DEO accounts, and reset all 75 districts to <b>pending</b>.</p><p style="margin-top:8px">Your admin account is preserved. This cannot be undone.</p>',
      showCancelButton: true,
      confirmButtonText: 'Yes, Reset Everything',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#b91c1c',
    });
    if (!confirmed?.isConfirmed) return;
    setResetting(true);
    await fetch('/api/admin/reset-test-data', { method: 'POST' });
    adminDistrictsCache.invalidate();
    setResetting(false);
    window.location.reload();
  }

  async function provision() {
    const Swal = (window as unknown as { Swal?: { fire: (o: Record<string, unknown>) => Promise<{ isConfirmed: boolean }> } }).Swal;
    const confirmed = await Swal?.fire({
      icon: 'warning',
      title: `Provision ${preview.length} DEO account(s)?`,
      html: `<p>This creates/updates <b>${preview.length}</b> DEO account(s) with the details in the preview table. No login email is sent — DEOs sign in with their CUG number.</p><p style="margin-top:8px">Double-check the details before continuing.</p>`,
      showCancelButton: true,
      confirmButtonText: 'Yes, Provision',
      cancelButtonText: 'Go Back',
    });
    if (!confirmed?.isConfirmed) return;

    setProvisioning(true);
    const res = await fetch('/api/admin/bulk-provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: preview }),
    });
    const data = await res.json() as { results: { email: string; status: string }[] };
    setResult(data.results);
    setProvisioning(false);
  }

  if (restricted) {
    return (
      <div className="card bg-base-100 shadow p-6">
        <h2 className="text-xl font-bold mb-1">District Master</h2>
        <p className="text-sm text-base-content/80">
          District Master (DEO reassignment, bbox/vend-count edits, and bulk DEO provisioning) is restricted to the portal owner's account, since it sends real magic-link emails and reassigns live DEO credentials.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HelpPanel pageKey="admin_district_master" title="District Master — How it works">
        <ol className="list-decimal list-inside space-y-1">
          <li><strong>Edit a district</strong> — click the edit icon on any row to open a panel for division, DEO name/email/identifier, expected vend count, and bounding-box coordinates. Saves immediately, no Excel round-trip required.</li>
          <li><strong>Bulk provisioning</strong> — for initial campaign setup or large batches of DEOs, download the template (pre-filled with district name and division), fill in DEO details, and upload it below.</li>
        </ol>
        <p className="mt-1 text-base-content/80">DEOs who already have accounts are skipped automatically on bulk upload. Email failures are reported per-row without rolling back the DB write.</p>
      </HelpPanel>

      <div className="card bg-base-100 shadow p-6">
        <h2 className="text-xl font-bold mb-1">District Master</h2>
        <p className="text-sm text-base-content/90 mb-4">
          Reference data for all 75 districts — division assignment, DEO identity, expected vend counts, and map coordinates. Edit a single district inline, or use bulk Excel upload for initial provisioning.
        </p>

        <div className="overflow-x-auto">
          <table className="table table-sm w-full" role="grid" aria-label="District master table">
            <thead><tr><th>District</th><th>Division</th><th>DEO</th><th>Circles/Sectors</th><th>Uploaded</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }, (_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 7 }, (_, j) => (
                      <td key={j}><div className="h-3 bg-base-300 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : (
                districtRows.map((d) => (
                  <tr key={d.name} role="row">
                    <td className="font-medium">{d.name}</td>
                    <td>{d.division ?? <span className="text-base-content/50">—</span>}</td>
                    <td>
                      {d.deoName
                        ? <div className="text-xs font-medium">{d.deoName}</div>
                        : <span className="text-base-content/50 text-xs">Unassigned</span>}
                    </td>
                    <td>{d.unitCount ?? 0}</td>
                    <td>{d.vendCount}</td>
                    <td><span className={`badge badge-xs ${statusBadgeClass(d.status)}`}>{statusLabel(d.status)}</span></td>
                    <td>
                      <button className="btn btn-ghost btn-xs btn-circle" onClick={() => setEditing(d)} aria-label={`Edit ${d.name}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card bg-base-100 shadow p-6">
        <h2 className="text-xl font-bold mb-2">Bulk DEO Provisioning</h2>
        <p className="text-sm text-base-content/90 mb-4">
          Upload a DEO Excel file with columns: <strong>District Name, Division, DEO Name, DEO Email, DEO Identifier, Expected Vend Count</strong>.
          The file is parsed in-browser; no data is sent until you confirm below.
        </p>

        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <button className="btn btn-outline btn-sm" onClick={downloadTemplate} aria-label="Download DEO provision template pre-filled with district names">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 11 12 16 17 11"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
            Download Template
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => inputRef.current?.click()} aria-label="Select filled DEO Excel file">
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
            <button className="btn btn-primary mt-4" onClick={provision} disabled={provisioning}>
              {provisioning ? <span className="loading loading-spinner loading-sm" /> : (
                <>
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

      {session?.role === 'superadmin' && (
        <div className="card bg-base-100 shadow p-6 border border-error/30">
          <h2 className="text-xl font-bold text-error mb-1">Danger Zone</h2>
          <p className="text-sm text-base-content/90 mb-4">
            Deletes all shop records, circles/sectors, audit log, and DEO accounts. Resets all 75 district statuses to pending.
            Your admin account is preserved. Use this to wipe test data before the real campaign.
          </p>
          <button className="btn btn-error btn-sm" onClick={resetTestData} disabled={resetting}>
            {resetting ? <span className="loading loading-spinner loading-sm" /> : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                Reset All Test Data
              </>
            )}
          </button>
        </div>
      )}

      {editing && (
        <EditDrawer district={editing} onClose={() => setEditing(null)} onSaved={(updated) => applyEdit(editing.name, updated)} />
      )}
    </div>
  );
}
