'use client';

import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';

const WORKER = process.env.NEXT_PUBLIC_WORKER_URL ?? '';
const MAP_POLL_MS = 5 * 60 * 1000;

interface DistrictRow {
  name: string; division?: string; deoName?: string; expectedVendCount?: number;
  status: string; submittedAt?: number; vendCount: number; totalRevenue: number;
}
interface AdminOverview { districts: DistrictRow[]; stateTotals: { totalVendCount: number; totalRevenue: number } }
interface MapRow { name: string; status: string; expectedVendCount?: number; vendCount: number; totalRevenue: number }

const STATUS_COLORS: Record<string, string> = {
  pending: '#d1d5db',
  in_progress: '#fbbf24',
  submitted: '#15803d',
};

function formatInr(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

declare global {
  const L: {
    map: (id: string) => LeafletMap;
    tileLayer: (url: string, opts: unknown) => { addTo: (m: LeafletMap) => void };
    geoJSON: (data: unknown, opts: unknown) => LeafletLayer;
    control: { layers?: unknown; attribution?: unknown } & {
      (): { addTo: (m: LeafletMap) => void };
    };
  };
  interface LeafletMap { setView: (c: [number, number], z: number) => LeafletMap; remove: () => void }
  interface LeafletLayer { addTo: (m: LeafletMap) => LeafletLayer; remove: () => void }
  const Chart: {
    new (ctx: CanvasRenderingContext2D, config: unknown): { destroy: () => void };
  };
}

export default function AdminPage() {
  const { user } = useUser();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [mapData, setMapData] = useState<MapRow[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [search, setSearch] = useState('');
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const geoLayer = useRef<LeafletLayer | null>(null);
  const chartRefs = {
    doughnut: useRef<HTMLCanvasElement>(null),
    bar: useRef<HTMLCanvasElement>(null),
    pie: useRef<HTMLCanvasElement>(null),
  };
  const chartInstances = useRef<{ destroy: () => void }[]>([]);

  async function fetchData() {
    const token = await (window as unknown as { Clerk?: { session?: { getToken: () => Promise<string> } } }).Clerk?.session?.getToken();
    const headers = { Authorization: `Bearer ${token}` };
    const [overview, map] = await Promise.all([
      fetch(`${WORKER}/api/admin/districts`, { headers }).then((r) => r.json()) as Promise<AdminOverview>,
      fetch(`${WORKER}/api/admin/map-data`, { headers }).then((r) => r.json()) as Promise<MapRow[]>,
    ]);
    setData(overview);
    setMapData(map);
    setLastRefresh(new Date());
  }

  useEffect(() => {
    if (!user) return;
    void fetchData();
    const id = setInterval(fetchData, MAP_POLL_MS);
    return () => clearInterval(id);
  }, [user]);

  // Initialize Leaflet choropleth
  useEffect(() => {
    if (!mapRef.current || mapData.length === 0 || typeof L === 'undefined') return;
    if (mapInstance.current) { geoLayer.current?.remove(); }
    else {
      mapInstance.current = L.map('admin-map').setView([26.8467, 80.9462], 7);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© CartoDB',
      }).addTo(mapInstance.current);
    }

    const mapIndex = Object.fromEntries(mapData.map((d) => [d.name, d]));

    fetch('/geodata/up-districts.geojson')
      .then((r) => r.json())
      .then((geo: unknown) => {
        geoLayer.current = L.geoJSON(geo, {
          style: (feature: { properties?: { district?: string } }) => {
            const name = feature?.properties?.district ?? '';
            const d = mapIndex[name];
            return { fillColor: STATUS_COLORS[d?.status ?? 'pending'] ?? '#d1d5db', weight: 1, fillOpacity: 0.7, color: '#fff' };
          },
          onEachFeature: (feature: { properties?: { district?: string } }, layer: { bindTooltip: (h: string) => void; on: (e: string, fn: () => void) => void }) => {
            const name = feature?.properties?.district ?? '';
            const d = mapIndex[name];
            if (d) {
              layer.bindTooltip(
                `<strong>${name}</strong><br>Status: ${d.status}<br>Vends: ${d.vendCount}<br>Revenue: ${formatInr(d.totalRevenue)}`
              );
              layer.on('click', () => { window.location.href = `/admin/districts/${encodeURIComponent(name)}`; });
            }
          },
        }).addTo(mapInstance.current!);
      })
      .catch(() => {}); // GeoJSON not yet placed — map still loads
  }, [mapData]);

  // Render Chart.js charts
  useEffect(() => {
    if (!data || typeof Chart === 'undefined') return;
    chartInstances.current.forEach((c) => c.destroy());
    chartInstances.current = [];

    const statusCounts = { pending: 0, in_progress: 0, submitted: 0 };
    data.districts.forEach((d) => { statusCounts[d.status as keyof typeof statusCounts] = (statusCounts[d.status as keyof typeof statusCounts] || 0) + 1; });

    if (chartRefs.doughnut.current) {
      chartInstances.current.push(new Chart(chartRefs.doughnut.current.getContext('2d')!, {
        type: 'doughnut',
        data: {
          labels: ['Pending', 'In Progress', 'Submitted'],
          datasets: [{ data: [statusCounts.pending, statusCounts.in_progress, statusCounts.submitted], backgroundColor: ['#d1d5db', '#fbbf24', '#15803d'] }],
        },
        options: { plugins: { legend: { position: 'bottom' } } },
      }));
    }

    const top20 = [...data.districts].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 20);
    if (chartRefs.bar.current) {
      chartInstances.current.push(new Chart(chartRefs.bar.current.getContext('2d')!, {
        type: 'bar',
        data: {
          labels: top20.map((d) => d.name),
          datasets: [{ label: 'Revenue (₹)', data: top20.map((d) => d.totalRevenue), backgroundColor: '#1d4ed8' }],
        },
        options: { indexAxis: 'y', plugins: { legend: { display: false } } },
      }));
    }
  }, [data]);

  const filtered = (data?.districts ?? []).filter((d) =>
    !search || d.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* State totals */}
      {data && (
        <div className="grid md:grid-cols-3 gap-4">
          <div className="stat bg-base-100 rounded-box shadow">
            <div className="stat-title">Total Districts Submitted</div>
            <div className="stat-value text-success">{data.districts.filter((d) => d.status === 'submitted').length}</div>
            <div className="stat-desc">of {data.districts.length}</div>
          </div>
          <div className="stat bg-base-100 rounded-box shadow">
            <div className="stat-title">Total Vends Uploaded</div>
            <div className="stat-value">{data.stateTotals.totalVendCount.toLocaleString()}</div>
          </div>
          <div className="stat bg-base-100 rounded-box shadow">
            <div className="stat-title">Total Annual Revenue</div>
            <div className="stat-value text-primary">{formatInr(data.stateTotals.totalRevenue)}</div>
          </div>
        </div>
      )}

      {/* Map + charts row */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card bg-base-100 shadow p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold">UP District Map</h3>
            {lastRefresh && <span className="text-xs text-base-content/50">Updated {lastRefresh.toLocaleTimeString()}</span>}
          </div>
          <div id="admin-map" ref={mapRef} style={{ height: 400 }} aria-label="UP district choropleth map" role="img" />
        </div>
        <div className="card bg-base-100 shadow p-4 flex flex-col gap-4">
          <h3 className="font-semibold">Submission Progress</h3>
          <canvas ref={chartRefs.doughnut} aria-label="Submission status doughnut chart" />
          <h3 className="font-semibold mt-2">Top 20 Districts by Revenue</h3>
          <canvas ref={chartRefs.bar} style={{ maxHeight: 200 }} aria-label="Revenue by district bar chart" />
        </div>
      </div>

      {/* District summary table */}
      <div className="card bg-base-100 shadow p-4">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <h3 className="font-semibold">District Summary</h3>
          <input
            className="input input-bordered input-sm w-48"
            placeholder="Search district"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search districts"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="table table-zebra table-sm w-full" role="grid" aria-label="District summary">
            <thead>
              <tr><th>District</th><th>DEO</th><th>Status</th><th>Vends</th><th>Revenue</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.name} role="row">
                  <td role="gridcell" className="font-medium">{d.name}</td>
                  <td role="gridcell" className="text-xs">{d.deoName ?? '—'}</td>
                  <td role="gridcell">
                    <span className={`badge badge-sm ${d.status === 'submitted' ? 'badge-success' : d.status === 'in_progress' ? 'badge-warning' : 'badge-ghost'}`}>
                      {d.status}
                    </span>
                  </td>
                  <td role="gridcell">{d.vendCount.toLocaleString()}</td>
                  <td role="gridcell" className="font-mono text-xs">{formatInr(d.totalRevenue)}</td>
                  <td role="gridcell">
                    <a href={`/admin/districts/${encodeURIComponent(d.name)}`} className="btn btn-ghost btn-xs">View →</a>
                  </td>
                </tr>
              ))}
              {/* All State totals row */}
              {data && (
                <tr className="font-bold bg-base-200" role="row">
                  <td role="gridcell" colSpan={3}>All State</td>
                  <td role="gridcell">{data.stateTotals.totalVendCount.toLocaleString()}</td>
                  <td role="gridcell" className="font-mono text-xs">{formatInr(data.stateTotals.totalRevenue)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
