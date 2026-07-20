'use client';

import { useEffect, useRef, useState } from 'react';
import { UP_DIVISIONS } from '@excise/schema';
import { generateProvisionTemplate } from '@/lib/excel';
import HelpPanel from '@/app/_components/HelpPanel';
import { useAdminDistricts } from '@/hooks/useAdminDistricts';
import { adminDistrictsCache } from '@/lib/db';
import { useSession } from '@/hooks/useSession';

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

interface DistrictPatch {
  division?: string;
  deoName?: string;
  deoEmail?: string;
  deoId?: string;
  expectedVendCount?: string | number | null;
  bboxMinLat?: string | number | null;
  bboxMaxLat?: string | number | null;
  bboxMinLon?: string | number | null;
  bboxMaxLon?: string | number | null;
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

  function parseOptionalNumber(value: string): number | undefined {
    const trimmed = value.trim();
    if (trimmed === '') return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  async function save() {
    setSaving(true);
    setError(null);
    const body: DistrictPatch = {};

    if (form.division.trim() !== (district.division ?? '').trim()) body.division = form.division.trim();
    if (form.deoName.trim() !== (district.deoName ?? '').trim()) body.deoName = form.deoName.trim();
    if (form.deoEmail.trim() !== (district.deoEmail ?? '').trim()) body.deoEmail = form.deoEmail.trim();
    if (form.deoId.trim() !== (district.deoId ?? '').trim()) body.deoId = form.deoId.trim();

    const expectedVendCount = parseOptionalNumber(form.expectedVendCount);
    const bboxMinLat = parseOptionalNumber(form.bboxMinLat);
    const bboxMaxLat = parseOptionalNumber(form.bboxMaxLat);
    const bboxMinLon = parseOptionalNumber(form.bboxMinLon);
    const bboxMaxLon = parseOptionalNumber(form.bboxMaxLon);

    if (expectedVendCount !== undefined && Number.isNaN(expectedVendCount)) {
      setSaving(false);
      setError('Please enter a valid numeric value for Expected Vend Count');
      return;
    }
    
    if (
      (bboxMinLat !== undefined && Number.isNaN(bboxMinLat)) ||
      (bboxMaxLat !== undefined && Number.isNaN(bboxMaxLat)) ||
      (bboxMinLon !== undefined && Number.isNaN(bboxMinLon)) ||
      (bboxMaxLon !== undefined && Number.isNaN(bboxMaxLon))
    ) {
      setSaving(false);
      setError('Please enter valid numeric coordinates for Latitude and Longitude');
      return;
    }

    // if cleared (empty string), it sends null to clear the database
    if (form.expectedVendCount.trim() === '' && district.expectedVendCount !== null) body.expectedVendCount = null as any;
    else if (expectedVendCount !== undefined && expectedVendCount !== district.expectedVendCount) body.expectedVendCount = expectedVendCount;

    if (form.bboxMinLat.trim() === '' && district.bboxMinLat !== null) body.bboxMinLat = null as any;
    else if (bboxMinLat !== undefined && bboxMinLat !== district.bboxMinLat) body.bboxMinLat = bboxMinLat;

    if (form.bboxMaxLat.trim() === '' && district.bboxMaxLat !== null) body.bboxMaxLat = null as any;
    else if (bboxMaxLat !== undefined && bboxMaxLat !== district.bboxMaxLat) body.bboxMaxLat = bboxMaxLat;

    if (form.bboxMinLon.trim() === '' && district.bboxMinLon !== null) body.bboxMinLon = null as any;
    else if (bboxMinLon !== undefined && bboxMinLon !== district.bboxMinLon) body.bboxMinLon = bboxMinLon;

    if (form.bboxMaxLon.trim() === '' && district.bboxMaxLon !== null) body.bboxMaxLon = null as any;
    else if (bboxMaxLon !== undefined && bboxMaxLon !== district.bboxMaxLon) body.bboxMaxLon = bboxMaxLon;

    if (Object.keys(body).length === 0) {
      setSaving(false);
      setError('No changes to save');
      return;
    }

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
    const nextDivision = body.division ?? district.division;
    const nextDeoName = body.deoName ?? district.deoName;
    const nextDeoEmail = body.deoEmail ?? district.deoEmail;
    const nextDeoId = body.deoId ?? district.deoId;
    const nextExpectedVendCount = typeof body.expectedVendCount === 'number' ? body.expectedVendCount : district.expectedVendCount;
    const nextBboxMinLat = typeof body.bboxMinLat === 'number' ? body.bboxMinLat : district.bboxMinLat;
    const nextBboxMaxLat = typeof body.bboxMaxLat === 'number' ? body.bboxMaxLat : district.bboxMaxLat;
    const nextBboxMinLon = typeof body.bboxMinLon === 'number' ? body.bboxMinLon : district.bboxMinLon;
    const nextBboxMaxLon = typeof body.bboxMaxLon === 'number' ? body.bboxMaxLon : district.bboxMaxLon;

    onSaved({
      division: nextDivision,
      deoName: nextDeoName,
      deoEmail: nextDeoEmail,
      deoId: nextDeoId,
      expectedVendCount: nextExpectedVendCount,
      bboxMinLat: nextBboxMinLat,
      bboxMaxLat: nextBboxMaxLat,
      bboxMinLon: nextBboxMinLon,
      bboxMaxLon: nextBboxMaxLon,
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
            <p className="text-[11px] uppercase tracking-widest font-medium text-base-content/60 mb-0.5">Edit District</p>
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
            <p className="text-[10px] uppercase tracking-widest font-semibold text-base-content/60 border-b border-base-200 pb-1">Administrative</p>
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
            <p className="text-[10px] uppercase tracking-widest font-semibold text-base-content/60 border-b border-base-200 pb-1">District Excise Officer</p>
            <label className="form-control">
              <span className="label-text text-xs font-medium mb-1">Full Name</span>
              <input className="input input-bordered input-sm" placeholder="e.g. Rajesh Kumar Sharma" value={form.deoName} onChange={set('deoName')} />
            </label>
            <label className="form-control">
              <span className="label-text text-xs font-medium mb-1">Email <span className="text-base-content/60 font-normal">(portal login)</span></span>
              <input type="email" className="input input-bordered input-sm font-mono text-xs" placeholder="officer@up-excise.gov.in" value={form.deoEmail} onChange={set('deoEmail')} />
            </label>
            <label className="form-control">
              <span className="label-text text-xs font-medium mb-1">Identifier <span className="text-base-content/60 font-normal">(dept. ID)</span></span>
              <input className="input input-bordered input-sm font-mono text-xs" placeholder="e.g. DEO-LKO-001" value={form.deoId} onChange={set('deoId')} />
            </label>
          </div>

          {/* Section: Capacity */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-base-content/60 border-b border-base-200 pb-1">Expected Capacity</p>
            <label className="form-control">
              <span className="label-text text-xs font-medium mb-1">Expected Vend Count</span>
              <input type="number" min="0" className="input input-bordered input-sm" placeholder="e.g. 450" value={form.expectedVendCount} onChange={set('expectedVendCount')} />
            </label>
          </div>

          {/* Section: Bounding Box */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-base-content/60 border-b border-base-200 pb-1">Map Bounding Box <span className="normal-case text-[9px]">(decimal degrees)</span></p>
            <div className="grid grid-cols-2 gap-2">
              <label className="form-control">
                <span className="label-text text-[10px] text-base-content/70 mb-0.5">Min Latitude (S)</span>
                <input type="number" step="any" className="input input-bordered input-xs font-mono" placeholder="23.8" value={form.bboxMinLat} onChange={set('bboxMinLat')} />
              </label>
              <label className="form-control">
                <span className="label-text text-[10px] text-base-content/70 mb-0.5">Max Latitude (N)</span>
                <input type="number" step="any" className="input input-bordered input-xs font-mono" placeholder="30.4" value={form.bboxMaxLat} onChange={set('bboxMaxLat')} />
              </label>
              <label className="form-control">
                <span className="label-text text-[10px] text-base-content/70 mb-0.5">Min Longitude (W)</span>
                <input type="number" step="any" className="input input-bordered input-xs font-mono" placeholder="77.1" value={form.bboxMinLon} onChange={set('bboxMinLon')} />
              </label>
              <label className="form-control">
                <span className="label-text text-[10px] text-base-content/70 mb-0.5">Max Longitude (E)</span>
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
      html: `<p>This creates/updates <b>${preview.length}</b> login account(s) and sends a magic-link sign-in email to each address in the preview table.</p><p style="margin-top:8px">Double-check the emails before continuing — a typo sends portal access to the wrong inbox.</p>`,
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
            <thead><tr><th>District</th><th>Division</th><th>DEO</th><th>Expected Vends</th><th>Uploaded</th><th>Status</th><th></th></tr></thead>
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
                    <td>{d.expectedVendCount ?? <span className="text-base-content/50">—</span>}</td>
                    <td>{d.vendCount}</td>
                    <td><span className={`badge badge-xs ${d.status === 'submitted' ? 'badge-success' : d.status === 'in_progress' ? 'badge-warning' : 'badge-ghost'}`}>{d.status}</span></td>
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
