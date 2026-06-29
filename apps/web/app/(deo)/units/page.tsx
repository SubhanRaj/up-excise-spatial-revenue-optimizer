'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';

interface Unit { id: number; name: string; type: string }

const WORKER = process.env.NEXT_PUBLIC_WORKER_URL ?? '';

export default function UnitsPage() {
  const { user } = useUser();
  const district = (user?.publicMetadata as { districtName?: string })?.districtName ?? '';
  const [units, setUnits] = useState<Unit[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<'circle' | 'sector'>('circle');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!district) return;
    const token = await (window as unknown as { Clerk?: { session?: { getToken: () => Promise<string> } } }).Clerk?.session?.getToken();
    const res = await fetch(`${WORKER}/api/districts/${encodeURIComponent(district)}/units`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setUnits(await res.json());
  }, [district]);

  useEffect(() => { void load(); }, [load]);

  async function addUnit() {
    if (!name.trim() || !district) return;
    setLoading(true);
    const token = await (window as unknown as { Clerk?: { session?: { getToken: () => Promise<string> } } }).Clerk?.session?.getToken();
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
    const token = await (window as unknown as { Clerk?: { session?: { getToken: () => Promise<string> } } }).Clerk?.session?.getToken();
    const res = await fetch(`${WORKER}/api/districts/${encodeURIComponent(district)}/template`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meta = await res.json() as { districtName: string; units: Unit[]; columns: string[] };

    // Generate XLSX using SheetJS (loaded from CDN)
    const { generateTemplate } = await import('@/lib/excel');
    const blob = generateTemplate(meta.districtName, meta.units.map((u) => u.name));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${district}-template.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="card bg-base-100 shadow p-6">
        <h2 className="text-xl font-bold mb-4">Circles &amp; Sectors — {district}</h2>

        <div className="flex gap-3 mb-6 flex-wrap">
          <input
            className="input input-bordered flex-1 min-w-48"
            placeholder="Unit name (e.g. Circle 1)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addUnit()}
          />
          <select className="select select-bordered" value={type} onChange={(e) => setType(e.target.value as 'circle' | 'sector')}>
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
        <button className="btn btn-secondary" onClick={downloadTemplate} aria-label="Download district Excel template">
          ⬇️ Download District Template
        </button>
      )}
    </div>
  );
}
