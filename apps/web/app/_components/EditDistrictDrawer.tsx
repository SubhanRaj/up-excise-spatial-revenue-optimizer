'use client';

import { useEffect, useState } from 'react';
import { UP_DIVISIONS } from '@excise/schema';

export interface DistrictRow {
  name: string; division: string | null; deoName: string | null; deoEmail: string | null;
  deoId: string | null; expectedVendCount: number | null; status: string;
  bboxMinLat: number | null; bboxMaxLat: number | null; bboxMinLon: number | null; bboxMaxLon: number | null;
  vendCount: number; totalRevenue: number;
}

interface EditForm {
  division: string; deoName: string; deoEmail: string; deoId: string; expectedVendCount: string;
  bboxMinLat: string; bboxMaxLat: string; bboxMinLon: string; bboxMaxLon: string;
}

export interface DistrictPatch {
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

export function EditDistrictDrawer({ district, onClose, onSaved }: { district: DistrictRow; onClose: () => void; onSaved: (updated: Partial<DistrictRow>) => void }) {
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
              <span className="label-text text-xs font-medium mb-1">Email <span className="text-base-content/60 font-normal">(for records only — DEOs log in via CUG)</span></span>
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
