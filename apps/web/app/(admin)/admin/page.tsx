'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import HelpPanel from '@/app/_components/HelpPanel';
const MAP_POLL_MS = 5 * 60 * 1000;

interface DistrictRow {
  name: string; division?: string; deoName?: string; expectedVendCount?: number;
  status: string; submittedAt?: number; vendCount: number; totalRevenue: number;
}
interface AdminOverview { districts: DistrictRow[]; stateTotals: { totalVendCount: number; totalRevenue: number } }
interface MapRow { name: string; status: string; expectedVendCount?: number; vendCount: number; totalRevenue: number }

const STATUS_COLORS: Record<string, string> = {
  pending: '#94a3b8',     // slate-400
  in_progress: '#f59e0b', // amber-500
  submitted: '#16a34a',   // green-600
};

const UP_BOUNDS: [[number, number], [number, number]] = [[23.8, 77.1], [30.4, 84.6]];
const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
} as const;

function formatInr(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

declare global {
  const L: {
    map: (id: string, opts?: { minZoom?: number; maxZoom?: number; zoomSnap?: number }) => LeafletMap;
    tileLayer: (url: string, opts: unknown) => LeafletLayer;
    geoJSON: (data: unknown, opts: unknown) => LeafletLayer;
    control: { layers?: unknown; attribution?: unknown } & {
      (): { addTo: (m: LeafletMap) => void };
    };
  };
  interface LeafletMap {
    setView: (c: [number, number], z: number) => LeafletMap;
    fitBounds: (bounds: [[number, number], [number, number]], options?: { padding?: [number, number]; animate?: boolean }) => LeafletMap;
    setMaxBounds: (bounds: [[number, number], [number, number]]) => LeafletMap;
    setMinZoom: (z: number) => LeafletMap;
    setMaxZoom: (z: number) => LeafletMap;
    invalidateSize: () => LeafletMap;
    remove: () => void;
  }
  interface LeafletLayer { addTo: (m: LeafletMap) => LeafletLayer; remove: () => void }
  const Chart: {
    new (ctx: CanvasRenderingContext2D, config: unknown): { destroy: () => void };
  };
}

export default function AdminPage() {
  useSession();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [mapData, setMapData] = useState<MapRow[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const baseLayer = useRef<LeafletLayer | null>(null);
  const geoLayer = useRef<LeafletLayer | null>(null);
  const chartRefs = {
    doughnut: useRef<HTMLCanvasElement>(null),
    bar: useRef<HTMLCanvasElement>(null),
    pie: useRef<HTMLCanvasElement>(null),
  };
  const chartInstances = useRef<{ destroy: () => void }[]>([]);

  async function fetchData() {
    const [overviewRes, mapRes] = await Promise.all([
      fetch('/api/admin/districts'),
      fetch('/api/admin/map-data'),
    ]);
    if (!overviewRes.ok || !mapRes.ok) {
      setApiError(`API error — your session may have expired, please sign in again.`);
      return;
    }
    setData(await overviewRes.json() as AdminOverview);
    setMapData(await mapRes.json() as MapRow[]);
    setApiError(null);
    setLastRefresh(new Date());
  }

  useEffect(() => {
    void fetchData();
    const id = setInterval(fetchData, MAP_POLL_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const syncTheme = () => {
      setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    };

    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('storage', syncTheme);

    return () => {
      observer.disconnect();
      window.removeEventListener('storage', syncTheme);
    };
  }, []);

  useEffect(() => {
    if (!mapInstance.current || typeof L === 'undefined') return;

    baseLayer.current?.remove();
    baseLayer.current = L.tileLayer(TILE_URLS[theme], {
      attribution: '© CartoDB',
    }).addTo(mapInstance.current);
  }, [theme]);

  // Initialize Leaflet choropleth
  useEffect(() => {
    if (!mapRef.current || mapData.length === 0 || typeof L === 'undefined') return;
    if (!mapInstance.current) {
      mapInstance.current = L.map('admin-map', { minZoom: 6, maxZoom: 10 });
      mapInstance.current.setMaxBounds([[22.5, 76.0], [31.5, 85.5]]);
      mapInstance.current.fitBounds(UP_BOUNDS, { padding: [20, 20], animate: false });
    } else {
      geoLayer.current?.remove();
      mapInstance.current.fitBounds(UP_BOUNDS, { padding: [20, 20], animate: false });
    }

    if (!baseLayer.current) {
      baseLayer.current = L.tileLayer(TILE_URLS[theme], {
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
            return {
              fillColor: STATUS_COLORS[d?.status ?? 'pending'] ?? '#94a3b8',
              weight: 1.5,
              color: '#334155',   // slate-700 border — visible in both light + dark
              fillOpacity: 0.65,
            };
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
        mapInstance.current!.fitBounds(UP_BOUNDS, { padding: [20, 20], animate: false });
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
      <HelpPanel pageKey="admin_dashboard" title="HQ Dashboard — Overview">
        <p>This is the state-wide command view. Everything here is read-only aggregate data — no shop rows are loaded until you drill into a district.</p>
        <ul className="list-disc list-inside space-y-1 mt-1">
          <li><strong>Stat cards</strong> — submitted district count, total vends uploaded, and total annual revenue across the state.</li>
          <li><strong>Choropleth map</strong> — grey = pending, amber = in progress, green = submitted. Click a district polygon to jump to its detail page.</li>
          <li><strong>Charts</strong> — submission progress by district, revenue split, and shop type breakdown. Auto-refresh every 5 minutes.</li>
          <li><strong>District table</strong> — 75 rows, one per district. Click any row to open the district detail view with all shop records.</li>
          <li><strong>Search</strong> — filters the district table by name in real time.</li>
        </ul>
      </HelpPanel>
      {apiError && (
        <div className="alert alert-error" role="alert">
          {/* tabler:alert-circle */}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>{apiError}</span>
          <button className="btn btn-sm btn-ghost" onClick={fetchData}>Retry</button>
        </div>
      )}
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

      {/* Full-width map */}
      <div className="card bg-base-100 shadow p-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-semibold">UP District Map</h3>
          {lastRefresh && <span className="text-xs text-base-content/50">Updated {lastRefresh.toLocaleTimeString()}</span>}
        </div>
        <div id="admin-map" ref={mapRef} style={{ height: 500 }} aria-label="UP district choropleth map" role="img" />
        <div className="flex gap-4 mt-2 text-xs text-base-content/60">
          {[['#94a3b8','Pending'],['#f59e0b','In Progress'],['#16a34a','Submitted']].map(([color, label]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm border border-[#334155]" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card bg-base-100 shadow p-4">
          <h3 className="font-semibold mb-3">Submission Progress</h3>
          <canvas ref={chartRefs.doughnut} style={{ maxHeight: 160 }} aria-label="Submission status doughnut chart" />
        </div>
        <div className="card bg-base-100 shadow p-4">
          <h3 className="font-semibold mb-3">Top 20 Districts by Revenue</h3>
          <canvas ref={chartRefs.bar} style={{ maxHeight: 160 }} aria-label="Revenue by district bar chart" />
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
