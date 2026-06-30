'use client';

import { useEffect, useRef, useState } from 'react';
import { UP_DIVISIONS } from '@excise/schema';
import { generateProvisionTemplate } from '@/lib/excel';
import HelpPanel from '@/app/_components/HelpPanel';

interface DistrictRow {
  name: string; division: string | null; deoName: string | null; deoEmail: string | null;
  deoId: string | null; expectedVendCount: number | null; status: string;
  bboxMinLat: number | null; bboxMaxLat: number | null; bboxMinLon: number | null; bboxMaxLon: number | null;
  vendCount: number; totalRevenue: number;
}

interface EditForm {
  division: string; deoName: string; deoEmail: string; deoId: string; expectedVendCount: string;
  bboxMinLat: string; bboxMaxLat: string; bboxMinLon: string; bboxMaxLon: string;
}

function toForm(d: DistrictRow): EditForm {
  return {
    division: d.division ?? '', deoName: d.deoName ?? '', deoEmail: d.deoEmail ?? '',
    deoId: d.deoId ?? '', expectedVendCount: d.expectedVendCount != null ? String(d.expectedVendCount) : '',
    bboxMinLat: d.bboxMinLat != null ? String(d.bboxMinLat) : '',
    bboxMaxLat: d.bboxMaxLat != null ? String(d.bboxMaxLat) : '',
    bboxMinLon: d.bboxMinLon != null ? String(d.bboxMinLon) : '',
    bboxMaxLon: d.bboxMaxLon != null ? String(d.bboxMaxLon) : '',
  };
}

function EditDrawer({ district, onClose, onSaved }: { district: DistrictRow; onClose: () => void; onSaved: (updated: Partial<DistrictRow>) => void }) {
  const [form, setForm] = useState<EditForm>(toForm(district));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  // Slide in on mount, slide out before unmounting
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') handleClose(); }
    document.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(id); document.removeEventListener('keydown', onKey); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 220);
  }

  function set(field: keyof EditForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const body = {
      division: form.division || undefined,
      deoName: form.deoName,
      deoEmail: form.deoEmail,
      deoId: form.deoId,
      expectedVendCount: form.expectedVendCount === '' ? undefined : Number(form.expectedVendCount),
      bboxMinLat: form.bboxMinLat === '' ? undefined : Number(form.bboxMinLat),
      bboxMaxLat: form.bboxMaxLat === '' ? undefined : Number(form.bboxMaxLat),
      bboxMinLon: form.bboxMinLon === '' ? undefined : Number(form.bboxMinLon),
      bboxMaxLon: form.bboxMaxLon === '' ? undefined : Number(form.bboxMaxLon),
    };
    const res = await fetch(`/api/admin/districts/${encodeURIComponent(district.name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? 'Failed to save changes');
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved({
      division: body.division ?? district.division,
      deoName: form.deoName || null, deoEmail: form.deoEmail || null, deoId: form.deoId || null,
      expectedVendCount: body.expectedVendCount ?? district.expectedVendCount,
      bboxMinLat: body.bboxMinLat ?? district.bboxMinLat, bboxMaxLat: body.bboxMaxLat ?? district.bboxMaxLat,
      bboxMinLon: body.bboxMinLon ?? district.bboxMinLon, bboxMaxLon: body.bboxMaxLon ?? district.bboxMaxLon,
    });
  }

  return (
    <div className="fixed inset-0 z-[1100] flex justify-end">
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />

      {/* Drawer panel */}
      <div className={`relative flex flex-col w-full max-w-sm h-full bg-base-100 shadow-2xl transition-transform duration-200 ease-out ${visible ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-base-200 bg-base-100 sticky top-0 z-10">
          <div>
            <p className="text-[11px] uppercase tracking-widest font-medium text-base-content/40 mb-0.5">Edit District</p>
            <h3 className="text-base font-bold leading-tight">{district.name}</h3>
          </div>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={handleClose} aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {error && (
            <div className="alert alert-error text-sm py-2 px-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          {/* Section: Administrative */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-base-content/40 border-b border-base-200 pb-1">Administrative</p>
            <label className="form-control">
              <span className="label-text text-xs font-medium mb-1">Division</span>
              <select className="select select-bordered select-sm" value={form.division} onChange={set('division')}>
                <option value="">— Select division —</option>
                {UP_DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          </div>

          {/* Section: DEO Identity */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-base-content/40 border-b border-base-200 pb-1">District Excise Officer</p>
            <label className="form-control">
              <span className="label-text text-xs font-medium mb-1">Full Name</span>
              <input className="input input-bordered input-sm" placeholder="e.g. Rajesh Kumar Sharma" value={form.deoName} onChange={set('deoName')} />
            </label>
            <label className="form-control">
              <span className="label-text text-xs font-medium mb-1">Email <span className="text-base-content/40 font-normal">(portal login)</span></span>
              <input type="email" className="input input-bordered input-sm font-mono text-xs" placeholder="officer@up-excise.gov.in" value={form.deoEmail} onChange={set('deoEmail')} />
            </label>
            <label className="form-control">
              <span className="label-text text-xs font-medium mb-1">Identifier <span className="text-base-content/40 font-normal">(dept. ID)</span></span>
              <input className="input input-bordered input-sm font-mono text-xs" placeholder="e.g. DEO-LKO-001" value={form.deoId} onChange={set('deoId')} />
            </label>
          </div>

          {/* Section: Capacity */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-base-content/40 border-b border-base-200 pb-1">Expected Capacity</p>
            <label className="form-control">
              <span className="label-text text-xs font-medium mb-1">Expected Vend Count</span>
              <input type="number" min="0" className="input input-bordered input-sm" placeholder="e.g. 450" value={form.expectedVendCount} onChange={set('expectedVendCount')} />
            </label>
          </div>

          {/* Section: Bounding Box */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-base-content/40 border-b border-base-200 pb-1">Map Bounding Box <span className="normal-case text-[9px]">(decimal degrees)</span></p>
            <div className="grid grid-cols-2 gap-2">
              <label className="form-control">
                <span className="label-text text-[10px] text-base-content/50 mb-0.5">Min Latitude (S)</span>
                <input type="number" step="any" className="input input-bordered input-xs font-mono" placeholder="23.8" value={form.bboxMinLat} onChange={set('bboxMinLat')} />
              </label>
              <label className="form-control">
                <span className="label-text text-[10px] text-base-content/50 mb-0.5">Max Latitude (N)</span>
                <input type="number" step="any" className="input input-bordered input-xs font-mono" placeholder="30.4" value={form.bboxMaxLat} onChange={set('bboxMaxLat')} />
              </label>
              <label className="form-control">
                <span className="label-text text-[10px] text-base-content/50 mb-0.5">Min Longitude (W)</span>
                <input type="number" step="any" className="input input-bordered input-xs font-mono" placeholder="77.1" value={form.bboxMinLon} onChange={set('bboxMinLon')} />
              </label>
              <label className="form-control">
                <span className="label-text text-[10px] text-base-content/50 mb-0.5">Max Longitude (E)</span>
                <input type="number" step="any" className="input input-bordered input-xs font-mono" placeholder="84.6" value={form.bboxMaxLon} onChange={set('bboxMaxLon')} />
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-base-200 bg-base-100 flex gap-2">
          <button className="btn btn-primary btn-sm flex-1" onClick={save} disabled={saving}>
            {saving
              ? <><span className="loading loading-spinner loading-xs" /> Saving…</>
              : saved
              ? <><svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Saved</>
              : 'Save Changes'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function DistrictMasterPage() {
  const [districtRows, setDistrictRows] = useState<DistrictRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DistrictRow | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ districtName: string; division: string; deoName: string; deoEmail: string; deoId: string; expectedVendCount: number }[]>([]);
  const [result, setResult] = useState<{ email: string; status: string }[]>([]);
  const [provisioning, setProvisioning] = useState(false);

  useEffect(() => {
    fetch('/api/admin/districts').then((r) => r.json()).then((data: { districts: DistrictRow[] }) => {
      setDistrictRows(data.districts);
      setLoading(false);
    });
  }, []);

  function applyEdit(name: string, updated: Partial<DistrictRow>) {
    setDistrictRows((rows) => rows.map((r) => r.name === name ? { ...r, ...updated } : r));
    setEditing(null);
  }

  async function handleFile(file: File) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]!];
    const raw = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
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

  async function provision() {
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

  return (
    <div className="space-y-6">
      <HelpPanel pageKey="admin_district_master" title="District Master — How it works">
        <ol className="list-decimal list-inside space-y-1">
          <li><strong>Edit a district</strong> — click the edit icon on any row to open a panel for division, DEO name/email/identifier, expected vend count, and bounding-box coordinates. Saves immediately, no Excel round-trip required.</li>
          <li><strong>Bulk provisioning</strong> — for initial campaign setup or large batches of DEOs, download the template (pre-filled with district name and division), fill in DEO details, and upload it below.</li>
        </ol>
        <p className="mt-1 text-base-content/60">DEOs who already have accounts are skipped automatically on bulk upload. Email failures are reported per-row without rolling back the DB write.</p>
      </HelpPanel>

      <div className="card bg-base-100 shadow p-6">
        <h2 className="text-xl font-bold mb-1">District Master</h2>
        <p className="text-sm text-base-content/70 mb-4">
          Reference data for all 75 districts — division assignment, DEO identity, expected vend counts, and map coordinates. Edit a single district inline, or use bulk Excel upload for initial provisioning.
        </p>

        {loading ? (
          <div className="flex justify-center py-10"><span className="loading loading-spinner loading-lg" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm w-full" role="grid" aria-label="District master table">
              <thead><tr><th>District</th><th>Division</th><th>DEO</th><th>Expected Vends</th><th>Uploaded</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {districtRows.map((d) => (
                  <tr key={d.name} role="row">
                    <td className="font-medium">{d.name}</td>
                    <td>{d.division ?? <span className="text-base-content/30">—</span>}</td>
                    <td>
                      {d.deoName
                        ? <div className="text-xs font-medium">{d.deoName}</div>
                        : <span className="text-base-content/30 text-xs">Unassigned</span>}
                    </td>
                    <td>{d.expectedVendCount ?? <span className="text-base-content/30">—</span>}</td>
                    <td>{d.vendCount}</td>
                    <td><span className={`badge badge-xs ${d.status === 'submitted' ? 'badge-success' : d.status === 'in_progress' ? 'badge-warning' : 'badge-ghost'}`}>{d.status}</span></td>
                    <td>
                      <button className="btn btn-ghost btn-xs btn-circle" onClick={() => setEditing(d)} aria-label={`Edit ${d.name}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card bg-base-100 shadow p-6">
        <h2 className="text-xl font-bold mb-2">Bulk DEO Provisioning</h2>
        <p className="text-sm text-base-content/70 mb-4">
          Upload a DEO Excel file with columns: <strong>District Name, Division, DEO Name, DEO Email, DEO Identifier, Expected Vend Count</strong>.
          SheetJS parses the file in-browser; no data is sent until you confirm below.
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

      {editing && (
        <EditDrawer district={editing} onClose={() => setEditing(null)} onSaved={(updated) => applyEdit(editing.name, updated)} />
      )}
    </div>
  );
}
