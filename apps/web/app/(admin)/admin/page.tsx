'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/hooks/useSession';
import HelpPanel from '@/app/_components/HelpPanel';
import { useAdminDistricts } from '@/hooks/useAdminDistricts';
import { useAdminExportData } from '@/hooks/useAdminExportData';
import { adminMapCache, adminSettingsCache } from '@/lib/db';
import { STATUS_COLOR, statusLabel, statusBadgeClass, isLocked } from '@/lib/status';
import { SHOP_TYPE_BADGE_CLASS } from '@/lib/shop-type';
import { SHOP_TYPES, SHOP_TYPE_LABELS } from '@excise/schema';

interface DistrictRow {
  name: string; division?: string; deoName?: string; expectedVendCount?: number;
  status: string; submittedAt?: string; vendCount: number; totalRevenue: number;
}
interface AdminOverview { districts: DistrictRow[]; stateTotals: { totalVendCount: number; totalRevenue: number } }
interface MapRow { name: string; status: string; expectedVendCount?: number; vendCount: number; totalRevenue: number }

const STATUS_COLORS = STATUS_COLOR;

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
  const { session } = useSession();
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);
  const { districts: hookDistricts, stateTotals, loading: districtsLoading } = useAdminDistricts();
  const { data: exportData, loading: exportLoading, syncing: exportSyncing, sync: syncExportData } = useAdminExportData();
  const data: AdminOverview | null = hookDistricts.length > 0
    ? { districts: hookDistricts as DistrictRow[], stateTotals }
    : null;
  const [mapData, setMapData] = useState<MapRow[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
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

  async function fetchMapData(force = false) {
    if (!force) {
      const cached = await adminMapCache.get();
      if (cached) {
        setMapData(cached as MapRow[]);
        setApiError(null);
        setLastRefresh(new Date());
        return;
      }
    }
    const mapRes = await fetch('/api/admin/map-data');
    if (!mapRes.ok) {
      setApiError(`API error — your session may have expired, please sign in again.`);
      return;
    }
    const data = await mapRes.json() as MapRow[];
    adminMapCache.set(data);
    setMapData(data);
    setApiError(null);
    setLastRefresh(new Date());
  }

  useEffect(() => {
    void fetchMapData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Final-verification round toggle ───────────────────────────────────────
  interface SettingsInfo { verificationPhaseOpen: boolean; everToggled: boolean; submittedCount: number; totalDistricts: number }
  const [settings, setSettings] = useState<SettingsInfo | null>(null);
  const [togglingSettings, setTogglingSettings] = useState(false);

  async function fetchSettings(force = false) {
    if (!force) {
      const cached = await adminSettingsCache.get();
      if (cached) { setSettings(cached as SettingsInfo); return; }
    }
    const res = await fetch('/api/admin/settings');
    if (!res.ok) return;
    const s = await res.json() as SettingsInfo;
    adminSettingsCache.set(s);
    setSettings(s);
  }

  useEffect(() => {
    void fetchSettings();
  }, []);

  async function toggleVerificationPhase() {
    if (!settings) return;
    const next = !settings.verificationPhaseOpen;
    const Swal = (window as unknown as { Swal?: { fire: (o: Record<string, unknown>) => Promise<{ isConfirmed: boolean }> } }).Swal;
    const confirm = await Swal?.fire({
      icon: 'warning',
      title: next ? 'Open final verification for all DEOs?' : 'Close final verification?',
      html: next
        ? `<p>Every DEO whose district is <b>Submitted</b> will now see a read-only final-review screen instead of Circles/Upload/Verify, where they confirm their data one more time or request a correction unlock.</p><p style="margin-top:8px">${settings.submittedCount} of ${settings.totalDistricts} districts are currently Submitted.</p>`
        : `<p>DEOs will stop seeing the final-review screen and return to their normal post-submission locked view.</p>`,
      showCancelButton: true,
      confirmButtonText: next ? 'Open Verification' : 'Close Verification',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#1d4ed8',
    });
    if (!confirm?.isConfirmed) return;

    setTogglingSettings(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationPhaseOpen: next }),
      });
      if (!res.ok) {
        await Swal?.fire({ icon: 'error', title: 'Could not update', text: 'Please try again.' });
        return;
      }
      const s = await res.json() as SettingsInfo;
      adminSettingsCache.set(s);
      setSettings(s);
    } finally {
      setTogglingSettings(false);
    }
  }

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
      mapInstance.current = L.map('admin-map', { minZoom: 6, maxZoom: 10, zoomSnap: 0.25 });
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
          onEachFeature: (feature: { properties?: { district?: string } }, layer: { bindTooltip: (h: string, opts?: Record<string, unknown>) => void; on: (e: string, fn: () => void) => void }) => {
            const name = feature?.properties?.district ?? '';
            const d = mapIndex[name];
            if (d) {
              // Permanent label: district name centred on polygon
              layer.bindTooltip(name, { permanent: true, direction: 'center', className: 'district-map-label' });
              layer.on('click', () => { routerRef.current.push(`/admin/districts/${encodeURIComponent(name)}`); });
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

    const statusCounts = { pending: 0, in_progress: 0, submitted: 0, verified: 0 };
    data.districts.forEach((d) => { statusCounts[d.status as keyof typeof statusCounts] = (statusCounts[d.status as keyof typeof statusCounts] || 0) + 1; });

    if (chartRefs.doughnut.current) {
      chartInstances.current.push(new Chart(chartRefs.doughnut.current.getContext('2d')!, {
        type: 'doughnut',
        data: {
          labels: ['Pending', 'In Progress', 'Submitted', 'Verified'],
          datasets: [{ data: [statusCounts.pending, statusCounts.in_progress, statusCounts.submitted, statusCounts.verified], backgroundColor: [STATUS_COLOR.pending, STATUS_COLOR.in_progress, STATUS_COLOR.submitted, STATUS_COLOR.verified] }],
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

  const top10 = useMemo(() =>
    [...(data?.districts ?? [])].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 10),
    [data]);

  // Free — already part of the 75-row districts aggregate every admin page loads, no extra
  // D1 query or IndexedDB read needed.
  const totalUnits = useMemo(
    () => (data?.districts as (DistrictRow & { unitCount?: number })[] | undefined)?.reduce((s, d) => s + (d.unitCount ?? 0), 0) ?? 0,
    [data],
  );

  // Sourced from the same full-state export cache /admin/export already populates — never a
  // fresh D1 query on its own. `exportData` is null until that cache exists on this device.
  const shopTypeCounts = useMemo(() => {
    const counts: Record<string, { count: number; revenue: number }> = {};
    for (const s of exportData?.rows ?? []) {
      if (!counts[s.shopType]) counts[s.shopType] = { count: 0, revenue: 0 };
      const entry = counts[s.shopType]!;
      entry.count++;
      entry.revenue += s.totalRevenue;
    }
    return counts;
  }, [exportData]);

  // CL5CC is not a separate shop_type — it's COUNTRY_LIQUOR with has_cl5cc=true (see CLAUDE.md
  // "CL5CC Rule"), so it needs its own card rather than a slot in the SHOP_TYPES loop above.
  const cl5ccCount = useMemo(() => (exportData?.rows ?? []).filter((s) => s.hasCl5cc).length, [exportData]);

  const divisions = useMemo(() => {
    const map = new Map<string, { count: number; submitted: number; vends: number; revenue: number }>();
    for (const d of (data?.districts ?? [])) {
      if (!d.division) continue;
      const e = map.get(d.division) ?? { count: 0, submitted: 0, vends: 0, revenue: 0 };
      e.count++;
      if (isLocked(d.status)) e.submitted++;
      e.vends += d.vendCount;
      e.revenue += d.totalRevenue;
      map.set(d.division, e);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([name, s]) => ({ name, ...s }));
  }, [data]);

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
          <button className="btn btn-sm btn-ghost" onClick={() => fetchMapData(true)}>Retry</button>
        </div>
      )}
      {/* State totals */}
      {data && (
        <div className="grid md:grid-cols-4 gap-4">
          <div className="stat bg-base-100 rounded-box shadow">
            <div className="stat-title">Total Districts Submitted</div>
            <div className="stat-value text-success">{data.districts.filter((d) => isLocked(d.status)).length}</div>
            <div className="stat-desc">of {data.districts.length}</div>
          </div>
          <div className="stat bg-base-100 rounded-box shadow">
            <div className="stat-title">Total Circles &amp; Sectors</div>
            <div className="stat-value">{totalUnits.toLocaleString()}</div>
            <div className="stat-desc">registered statewide</div>
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

      {/* State-wide shop-type breakdown — sourced from the /admin/export IndexedDB cache,
          which the navbar's Sync All button already keeps populated (see
          invalidateAllAdminCaches() in src/lib/db.ts), so this card just doesn't render
          until that data exists rather than showing its own separate sync prompt. */}
      {exportData && (
        <div className="card bg-base-100 shadow p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="font-semibold">Shop Type Breakdown — Statewide</h3>
            <button className="btn btn-ghost btn-xs gap-1" onClick={syncExportData} disabled={exportSyncing}>
              {exportSyncing ? <span className="loading loading-spinner loading-xs" /> : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
              )}
              Refresh
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {SHOP_TYPES.map((t) => {
              const c = shopTypeCounts[t];
              if (!c) return null;
              return (
                <div key={t} className="rounded-lg border border-base-200 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`badge badge-xs ${SHOP_TYPE_BADGE_CLASS[t]}`}>{' '}</span>
                    <span className="text-xs font-medium text-base-content/90">{SHOP_TYPE_LABELS[t]}</span>
                  </div>
                  <p className="text-lg font-bold tabular-nums">{c.count.toLocaleString()}</p>
                  <p className="text-[11px] text-base-content/60 tabular-nums">{formatInr(c.revenue)}</p>
                </div>
              );
            })}
            {cl5ccCount > 0 && (
              <div className="rounded-lg border border-base-300 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="badge badge-xs badge-outline text-[10px]">CL5CC</span>
                  <span className="text-xs font-medium text-base-content/90">Country Liquor w/ Beer</span>
                </div>
                <p className="text-lg font-bold tabular-nums">{cl5ccCount.toLocaleString()}</p>
                <p className="text-[11px] text-base-content/60">of Country Liquor</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Final verification round — superadmin toggles, everyone sees progress */}
      {settings && (
        <div className="bg-base-100 rounded-box shadow p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Final Verification Round</h3>
              <span className={`badge badge-sm ${settings.verificationPhaseOpen ? 'badge-info' : 'badge-ghost'}`}>
                {settings.verificationPhaseOpen ? 'Open' : settings.everToggled ? 'Closed' : 'Not Started Yet'}
              </span>
            </div>
            <p className="text-xs text-base-content/60 mt-0.5">
              {settings.submittedCount} of {settings.totalDistricts} districts Submitted
              {settings.verificationPhaseOpen && ' · Submitted districts\' DEOs currently see the final-review screen'}
            </p>
          </div>
          {session?.role === 'superadmin' ? (
            <button
              className={`btn btn-sm ${settings.verificationPhaseOpen ? 'btn-outline btn-error' : 'btn-primary'}`}
              onClick={toggleVerificationPhase}
              disabled={togglingSettings}
            >
              {togglingSettings ? <span className="loading loading-spinner loading-xs" /> : settings.verificationPhaseOpen ? 'Close Verification' : 'Open Verification'}
            </button>
          ) : (
            <span className="text-xs text-base-content/50">Owner/superadmin-only toggle</span>
          )}
        </div>
      )}

      {/* Full-width map */}
      <div className="card bg-base-100 shadow p-4">
        <div className="flex justify-between items-center mb-2">
          <div>
            <h3 className="font-semibold">District Status — Uttar Pradesh</h3>
            <p className="text-xs text-base-content/60 mt-0.5">75 districts · click any district to view shop records</p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && <span className="text-xs text-base-content/70 hidden sm:inline">Updated {lastRefresh.toLocaleTimeString()}</span>}
          </div>
        </div>
        <div id="admin-map" ref={mapRef} style={{ height: 660 }} aria-label="UP district status choropleth map" role="img" />
        <div className="flex gap-4 mt-2 text-xs text-base-content/80">
          {[[STATUS_COLOR.pending,'Pending'],[STATUS_COLOR.in_progress,'In Progress'],[STATUS_COLOR.submitted,'Submitted'],[STATUS_COLOR.verified,'Verified']].map(([color, label]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm border border-[#334155]" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Charts row — both cards stretch to equal height (default grid behavior); the
          doughnut only needs a ~320px canvas, so it's centered in the remaining space
          instead of left sitting at the top with dead space below it. */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card bg-base-100 shadow p-4 flex flex-col">
          <h3 className="font-semibold mb-3">Submission Progress</h3>
          <div className="flex-1 flex items-center justify-center">
            <canvas ref={chartRefs.doughnut} style={{ maxHeight: 320 }} aria-label="Submission status doughnut chart" />
          </div>
        </div>
        <div className="card bg-base-100 shadow p-4">
          <h3 className="font-semibold mb-3">Top 20 Districts by Revenue</h3>
          <canvas ref={chartRefs.bar} style={{ maxHeight: 440 }} aria-label="Revenue by district bar chart" />
        </div>
      </div>

      {/* Divisions grid */}
      {divisions.length > 0 && (
        <div className="card bg-base-100 shadow p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Divisions</h3>
            <span className="text-xs text-base-content/60">{divisions.length} divisions · click to view districts</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {divisions.map((div) => (
              <Link
                key={div.name}
                href={`/admin/divisions/${encodeURIComponent(div.name)}`}
                className="rounded-lg border border-base-200 p-3 hover:border-primary hover:bg-base-50 transition-colors cursor-pointer group"
              >
                <p className="text-xs font-semibold text-base-content/90 group-hover:text-primary transition-colors truncate">{div.name}</p>
                <p className="text-[11px] text-base-content/60 mt-0.5">{div.count} districts</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <span className={`badge badge-xs ${div.submitted === div.count ? 'badge-success' : div.submitted > 0 ? 'badge-warning' : 'badge-ghost'}`}>
                    {div.submitted}/{div.count}
                  </span>
                  <span className="text-[11px] text-base-content/60 tabular-nums">{formatInr(div.revenue)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Top-10 district table */}
      <div className="card bg-base-100 shadow p-4">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <div>
            <h3 className="font-semibold">Top 10 Districts by Revenue</h3>
            <p className="text-xs text-base-content/60 mt-0.5">Highest revenue districts this cycle</p>
          </div>
          <Link href="/admin/districts" className="btn btn-sm btn-outline gap-1">
            View all 75 districts
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="table table-zebra table-sm w-full" role="grid" aria-label="Top 10 districts by revenue">
            <thead>
              <tr><th>#</th><th>District</th><th>Division</th><th>Status</th><th>Vends</th><th>Revenue</th><th></th></tr>
            </thead>
            <tbody>
              {top10.map((d, i) => (
                <tr key={d.name} role="row">
                  <td role="gridcell" className="text-base-content/60 text-xs tabular-nums w-6">{i + 1}</td>
                  <td role="gridcell" className="font-medium">{d.name}</td>
                  <td role="gridcell">
                    {d.division
                      ? <Link href={`/admin/divisions/${encodeURIComponent(d.division)}`} className="badge badge-xs badge-ghost hover:badge-primary transition-colors cursor-pointer">{d.division}</Link>
                      : <span className="text-base-content/50">—</span>}
                  </td>
                  <td role="gridcell">
                    <span className={`badge badge-sm ${statusBadgeClass(d.status)}`}>
                      {statusLabel(d.status)}
                    </span>
                  </td>
                  <td role="gridcell">{d.vendCount.toLocaleString()}</td>
                  <td role="gridcell" className="font-mono text-xs">{formatInr(d.totalRevenue)}</td>
                  <td role="gridcell">
                    <Link href={`/admin/districts/${encodeURIComponent(d.name)}`} className="btn btn-ghost btn-xs">View →</Link>
                  </td>
                </tr>
              ))}
              {data && (
                <tr className="font-bold bg-base-200" role="row">
                  <td colSpan={4}>All State</td>
                  <td>{data.stateTotals.totalVendCount.toLocaleString()}</td>
                  <td className="font-mono text-xs">{formatInr(data.stateTotals.totalRevenue)}</td>
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
