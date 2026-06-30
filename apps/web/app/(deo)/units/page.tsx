'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import HelpPanel from '@/app/_components/HelpPanel';

interface Unit { id: number; name: string; type: string }

const WORKER = process.env.NEXT_PUBLIC_WORKER_URL ?? '';

export default function UnitsPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const district = (user?.publicMetadata as { districtName?: string })?.districtName ?? '';
  const [units, setUnits] = useState<Unit[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<'circle' | 'sector'>('circle');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!district) return;
    const token = await getToken();
    const res = await fetch(`${WORKER}/api/districts/${encodeURIComponent(district)}/units`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setUnits(await res.json());
  }, [district, getToken]);

  useEffect(() => { void load(); }, [load]);

  async function addUnit() {
    if (!name.trim() || !district) return;
    setLoading(true);
    const token = await getToken();
    await fetch(`${WORKER}/api/districts/${encodeURIComponent(district)}/units`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), type }),
    });
    setName('');
    setLoading(false);
    await load();
  }

  async function downloadTemplate() {
    const token = await getToken();
    const res = await fetch(`${WORKER}/api/districts/${encodeURIComponent(district)}/template`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meta = await res.json() as { districtName: string; units: Unit[]; columns: string[] };

    const { generateTemplate } = await import('@/lib/excel');
    const blob = await generateTemplate(meta.districtName, meta.units.map((u) => u.name));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${district}-template.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!district) {
    return (
      <div className="alert alert-warning max-w-xl" role="alert">
        {/* tabler:alert-triangle */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>Your account has not been assigned a district. Contact your administrator to provision your DEO account.</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold">Circles &amp; Sectors — {district}</h2>
        <HelpPanel pageKey="units" title="Circles & Sectors — How it works">
          <p><strong>Step 1 — Register all circles and sectors</strong> for your district before distributing the Excel template to Inspectors. Use the form below to add each unit by name and type.</p>
          <p><strong>Naming tip:</strong> Use consistent names across all Inspectors — e.g. "Circle 1", "Circle 2", "Sector A". Each Inspector will enter this name on every row they fill in the template.</p>
          <p><strong>Step 2 — Download the district template</strong> using the button below (appears once you have at least one unit). The template has one sheet with all data columns and a "Column Guide" sheet explaining each field.</p>
          <p><strong>Step 3 — Distribute blank copies</strong> of the template to each Inspector. They fill their rows, enter their circle/sector name in the <code>circle_sector_name</code> column, and return the completed file to you.</p>
          <p><strong>Step 4 — Consolidate</strong> all Inspector sections into a single district Excel file and upload it on the <a href="/upload" className="link">Upload page</a>.</p>
        </HelpPanel>
      </div>

      <div className="card bg-base-100 shadow p-6">
        <div className="flex gap-3 mb-6 flex-wrap">
          <input
            className="input input-bordered flex-1 min-w-48"
            placeholder="Unit name (e.g. Circle 1)"
            value={name}
            aria-label="Unit name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addUnit()}
          />
          <select
            className="select select-bordered"
            value={type}
            aria-label="Unit type"
            onChange={(e) => setType(e.target.value as 'circle' | 'sector')}
          >
            <option value="circle">Circle</option>
            <option value="sector">Sector</option>
          </select>
          <button className="btn btn-primary" onClick={addUnit} disabled={loading || !name.trim()}>
            {loading ? <span className="loading loading-spinner loading-sm" /> : 'Add Unit'}
          </button>
        </div>

        {units.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full" role="grid" aria-label="Registered units">
              <thead><tr><th>#</th><th>Name</th><th>Type</th></tr></thead>
              <tbody>
                {units.map((u, i) => (
                  <tr key={u.id} role="row">
                    <td role="gridcell">{i + 1}</td>
                    <td role="gridcell">{u.name}</td>
                    <td role="gridcell"><span className="badge badge-outline capitalize">{u.type}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-base-content/60 text-sm">No units registered yet. Add circles and sectors above.</p>
        )}
      </div>

      {units.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <button className="btn btn-secondary" onClick={downloadTemplate} aria-label="Download district Excel template">
            {/* tabler:download */}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 11 12 16 17 11"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
            Download District Template
          </button>
        </div>
      )}
    </div>
  );
}
