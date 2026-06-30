'use client';

import { useEffect, useMemo, useState } from 'react';
import HelpPanel from '@/app/_components/HelpPanel';

interface DistrictRow { name: string; division?: string; status: string; vendCount: number; totalRevenue: number }

const fmt = (n: number) => n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${n.toLocaleString('en-IN')}`;

export default function DivisionsPage() {
  const [districts, setDistricts] = useState<DistrictRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/districts')
      .then((r) => r.json())
      .then((d: { districts: DistrictRow[] }) => { setDistricts(d.districts); setLoading(false); });
  }, []);

  const divisions = useMemo(() => {
    const map = new Map<string, { count: number; submitted: number; inProgress: number; vends: number; revenue: number; districts: string[] }>();
    for (const d of districts) {
      if (!d.division) continue;
      const e = map.get(d.division) ?? { count: 0, submitted: 0, inProgress: 0, vends: 0, revenue: 0, districts: [] };
      e.count++;
      e.districts.push(d.name);
      if (d.status === 'submitted') e.submitted++;
      else if (d.status === 'in_progress') e.inProgress++;
      e.vends += d.vendCount;
      e.revenue += d.totalRevenue;
      map.set(d.division, e);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([name, s]) => ({ name, ...s }));
  }, [districts]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Divisions</h1>
          <p className="text-sm text-base-content/50 mt-0.5">{divisions.length} administrative divisions of Uttar Pradesh</p>
        </div>
        <div className="ml-auto">
          <HelpPanel pageKey="admin_divisions_list" title="Divisions Overview">
            <p>UP&apos;s 75 districts are grouped into 18 administrative divisions. Click a division card to see all its districts.</p>
          </HelpPanel>
        </div>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-3 gap-4 animate-pulse">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-32 rounded-xl bg-base-300" />)}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {divisions.map((div) => (
            <a
              key={div.name}
              href={`/admin/divisions/${encodeURIComponent(div.name)}`}
              className="bg-base-100 rounded-xl border border-base-200 p-5 hover:border-primary hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <h2 className="font-semibold text-base group-hover:text-primary transition-colors">{div.name}</h2>
                <span className="badge badge-sm badge-ghost shrink-0">{div.count} districts</span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-base-200 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-success rounded-full transition-all"
                  style={{ width: `${div.count ? (div.submitted / div.count) * 100 : 0}%` }}
                />
              </div>
              <div className="flex items-center gap-3 text-xs text-base-content/50">
                <span className="text-success font-medium">{div.submitted} submitted</span>
                {div.inProgress > 0 && <span className="text-warning">{div.inProgress} in progress</span>}
                <span className="ml-auto tabular-nums font-medium text-base-content/70">{fmt(div.revenue)}</span>
              </div>
              <p className="mt-2 text-[11px] text-base-content/30 truncate">{div.districts.slice(0, 4).join(', ')}{div.count > 4 ? ` +${div.count - 4} more` : ''}</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
