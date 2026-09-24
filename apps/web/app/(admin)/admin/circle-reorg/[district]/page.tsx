'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useCircleReorgData, type ReorgCircle, type ReorgThana } from '@/hooks/useCircleReorgData';
import { useAdminExportData } from '@/hooks/useAdminExportData';
import { useExcludeHbrPrv } from '@/hooks/useExcludeHbrPrv';
import { ShopExplorer, type ShopExplorerRow } from '@/components/ShopExplorer';
import { normalizeThanaName } from '@/lib/thana-name';
import { adminSettingsCache } from '@/lib/db';
import { SHOP_TYPE_SHORT_LABEL } from '@/lib/shop-type';
import { SHOP_TYPES } from '@excise/schema';

const fmt = (n: number | null) => n == null ? '—' : n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${n.toLocaleString('en-IN')}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

// Ray-casting point-in-polygon, GeoJSON coordinate order ([lon, lat]). Handles holes (a point
// inside an outer ring but also inside one of its holes is outside) and MultiPolygon, even though
// every UP district in up-districts.geojson is currently a plain Polygon — cheap to cover either way.
type GeoRing = [number, number][];
function pointInRing(lat: number, lon: number, ring: GeoRing): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function pointInDistrict(lat: number, lon: number, geom: { type: string; coordinates: unknown } | null): boolean | null {
  if (!geom) return null; // boundary not loaded yet — don't flag anything
  const polys = (geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []) as GeoRing[][];
  for (const rings of polys) {
    if (!rings.length) continue;
    if (pointInRing(lat, lon, rings[0]!) && !rings.slice(1).some((hole) => pointInRing(lat, lon, hole))) return true;
  }
  return false;
}

// CARTO stopped serving these tiles anonymously — every request needs a `key` query param
// (see CLAUDE.md's M-82 note). Same free, domain-restricted key the overview choropleth uses,
// read from the same GET /api/admin/settings response.
const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
} as const;

// Same two extra base layers the Commissioner's own standalone viewer (up_excise_circle_map.html)
// offers alongside its boundary drawing — OpenStreetMap for a plain street/road map, Esri World
// Imagery for satellite. Neither needs an API key.
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const SATELLITE_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
type BaseLayerKind = 'carto' | 'osm' | 'satellite';

// Uttar Pradesh only — matches the admin overview choropleth's own bounds (CLAUDE.md's "Choropleth
// Map & GeoJSON Data" section). Every Leaflet map in this app is capped to this extent: panning or
// zooming out to a world/country view would render India's disputed international borders, which
// this portal has no business displaying one way or another.
const UP_MAX_BOUNDS: [[number, number], [number, number]] = [[22.5, 76.0], [31.5, 85.5]];
const UP_MIN_ZOOM = 6;
const UP_MAX_ZOOM = 19;

const STATUS_BADGE: Record<string, string> = { kept: 'badge-ghost', new: 'badge-success', abolished: 'badge-error' };

// Stable hash → HSL color per circle name, so the same circle keeps the same color whether
// shown in the Current or Proposed map layer — that's what makes a re-carve visually legible.
function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 65%, 55%)`;
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="text-base-content/40 ml-1">⇅</span>;
  return <span className="text-info ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

// Ambient, file-local only (not `declare global`) — avoids colliding with the admin overview
// page's own separate Leaflet ambient block. See CLAUDE.md's Leaflet CDN-global note.
interface LeafletMapH {
  fitBounds: (b: [[number, number], [number, number]], o?: { padding?: [number, number] }) => LeafletMapH;
  setMaxBounds: (b: [[number, number], [number, number]]) => LeafletMapH;
  setView: (center: LeafletLatLngH, zoom: number, o?: { animate?: boolean }) => LeafletMapH;
  getCenter: () => LeafletLatLngH;
  getZoom: () => number;
  on: (evt: string, fn: () => void) => LeafletMapH;
  off: (evt: string, fn: () => void) => LeafletMapH;
  remove: () => void;
}
interface LeafletLatLngH { lat: number; lng: number }
interface LeafletLatLngBoundsH { getSouthWest: () => LeafletLatLngH; getNorthEast: () => LeafletLatLngH }
interface LeafletLayerH {
  addTo: (m: LeafletMapH) => LeafletLayerH;
  remove: () => void;
  bindTooltip?: (t: string, o?: unknown) => void;
  bindPopup?: (html: string) => void;
  getBounds?: () => LeafletLatLngBoundsH;
}
declare const L: {
  map: (id: string, opts?: { minZoom?: number; maxZoom?: number }) => LeafletMapH;
  tileLayer: (url: string, opts: unknown) => LeafletLayerH;
  geoJSON: (data: unknown, opts: unknown) => LeafletLayerH;
  canvas: (opts?: { pane?: string }) => unknown;
  circleMarker: (latlng: [number, number], opts: unknown) => LeafletLayerH;
};
declare const Chart: { new (ctx: CanvasRenderingContext2D, config: unknown): { destroy: () => void } };

type CircleSortKey = 'name' | 'currentRevenue' | 'proposedRevenue' | 'change';
type ThanaSortKey = 'thanaName' | 'shopCount' | 'revenue';

const CARTO_TILE_URL = (t: 'light' | 'dark', cartoKey: string | null) => (cartoKey ? `${TILE_URLS[t]}?key=${cartoKey}` : TILE_URLS[t]);

function baseTileLayer(kind: BaseLayerKind, theme: 'light' | 'dark', cartoKey: string | null): LeafletLayerH {
  if (kind === 'osm') return L.tileLayer(OSM_TILE_URL, { attribution: '© OpenStreetMap contributors', maxZoom: UP_MAX_ZOOM });
  if (kind === 'satellite') return L.tileLayer(SATELLITE_TILE_URL, { attribution: 'Imagery © Esri', maxZoom: UP_MAX_ZOOM });
  return L.tileLayer(CARTO_TILE_URL(theme, cartoKey), { attribution: '© CartoDB', maxZoom: UP_MAX_ZOOM });
}

function shopPopupHtml(s: ShopExplorerRow, outOfBounds: boolean): string {
  return `<div style="font-size:12.5px;line-height:1.5"><b>${escapeHtml(s.shopName)}</b><br/>`
    + `ID ${escapeHtml(s.shopId)}<br/>`
    + `${escapeHtml(SHOP_TYPE_SHORT_LABEL[s.shopType] ?? s.shopType)}<br/>`
    + `Thana: ${escapeHtml(s.thanaName)}<br/>`
    + `Circle: ${escapeHtml(s.circleSectorName)}<br/>`
    + `Revenue: ${fmt(s.totalRevenue)}`
    + (outOfBounds ? '<br/><i style="color:#b45309">Coordinates fall outside the district boundary</i>' : '')
    + `</div>`;
}

// One Leaflet instance for one map card (Current or Proposed). Called twice, side by side, so
// both boundary layers render at once instead of behind a shared toggle.
function useCircleMap(
  elId: string,
  mode: 'current' | 'proposed',
  circles: ReorgCircle[],
  thanas: ReorgThana[],
  shops: ShopExplorerRow[],
  outOfBoundsShopIds: Set<string>,
  showThanas: boolean,
  showShops: boolean,
  circleFilter: string,
  typeFilter: string,
  cartoKey: string | null,
  theme: 'light' | 'dark',
  baseLayer: BaseLayerKind,
) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMapH | null>(null);
  const baseLayerRef = useRef<LeafletLayerH | null>(null);
  const layersRef = useRef<LeafletLayerH[]>([]);
  const rendererRef = useRef<unknown>(null);

  // Base tile layer only — separate from the circle/thana layers below so a theme/base-layer
  // switch or a late-arriving CARTO key never has to rebuild the polygons themselves.
  useEffect(() => {
    if (!mapInstance.current || typeof L === 'undefined') return;
    baseLayerRef.current?.remove();
    baseLayerRef.current = baseTileLayer(baseLayer, theme, cartoKey).addTo(mapInstance.current);
  }, [theme, cartoKey, baseLayer]);

  useEffect(() => {
    if (!mapRef.current || circles.length === 0 || typeof L === 'undefined') return;
    if (!mapInstance.current) {
      mapInstance.current = L.map(elId, { minZoom: UP_MIN_ZOOM, maxZoom: UP_MAX_ZOOM });
      mapInstance.current.setMaxBounds(UP_MAX_BOUNDS);
    }
    if (!baseLayerRef.current) {
      baseLayerRef.current = baseTileLayer(baseLayer, theme, cartoKey).addTo(mapInstance.current);
    }
    if (!rendererRef.current) rendererRef.current = L.canvas();
    layersRef.current.forEach((l) => l.remove());
    layersRef.current = [];

    let swLat = Infinity, swLng = Infinity, neLat = -Infinity, neLng = -Infinity;
    let hasBounds = false;

    const visibleCircles = circleFilter === 'all' ? circles : circles.filter((c) => c.name === circleFilter);
    for (const c of visibleCircles) {
      const geom = mode === 'current' ? c.currentBoundary : c.proposedBoundary;
      if (!geom) continue;
      const color = colorForName(c.name);
      const layer = L.geoJSON({ type: 'Feature', geometry: geom, properties: {} }, {
        style: { fillColor: color, color, weight: 1.5, fillOpacity: 0.45 },
      }).addTo(mapInstance.current);
      layer.bindTooltip?.(c.name, { permanent: false });
      layersRef.current.push(layer);
      const b = layer.getBounds?.();
      if (b) {
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        swLat = Math.min(swLat, sw.lat); swLng = Math.min(swLng, sw.lng);
        neLat = Math.max(neLat, ne.lat); neLng = Math.max(neLng, ne.lng);
        hasBounds = true;
      }
    }

    if (showThanas) {
      for (const t of thanas) {
        if (!t.boundary) continue;
        const layer = L.geoJSON({ type: 'Feature', geometry: t.boundary, properties: {} }, {
          style: { fillColor: 'transparent', color: '#334155', weight: 1, dashArray: '3,3' },
        }).addTo(mapInstance.current);
        layer.bindTooltip?.(t.thanaName, { permanent: false });
        layersRef.current.push(layer);
      }
    }

    if (showShops) {
      for (const s of shops) {
        if (s.latitudeDecimal == null || s.longitudeDecimal == null) continue;
        if (circleFilter !== 'all' && s.circleSectorName !== circleFilter) continue;
        if (typeFilter !== 'all' && s.shopType !== typeFilter) continue;
        // Out-of-bounds shops get the Commissioner's own "doubtful location" treatment — a
        // bigger, hollow (unfilled) marker instead of a small filled dot — rather than being
        // plotted identically to a shop whose coordinates are actually trustworthy.
        const outOfBounds = outOfBoundsShopIds.has(s.shopId);
        const layer = L.circleMarker([s.latitudeDecimal, s.longitudeDecimal], outOfBounds
          ? { renderer: rendererRef.current, radius: 5, weight: 1.6, color: '#b45309', fill: false }
          : { renderer: rendererRef.current, radius: 3.5, weight: 1, color: '#fff', fillColor: colorForName(s.circleSectorName), fillOpacity: 0.9 },
        ).addTo(mapInstance.current);
        layer.bindPopup?.(shopPopupHtml(s, outOfBounds));
        layersRef.current.push(layer);
      }
    }

    if (hasBounds) mapInstance.current.fitBounds([[swLat, swLng], [neLat, neLng]], { padding: [16, 16] });

    return () => { layersRef.current.forEach((l) => l.remove()); layersRef.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- theme/cartoKey handled by the base-layer effect above
  }, [circles, thanas, shops, outOfBoundsShopIds, showThanas, showShops, circleFilter, typeFilter, elId, mode]);

  useEffect(() => () => { mapInstance.current?.remove(); mapInstance.current = null; }, []);

  return { mapRef, mapInstance };
}

export default function CircleReorgDistrictPage({ params }: { params: Promise<{ district: string }> }) {
  const { district } = use(params);
  const name = decodeURIComponent(district);
  const { data, loading } = useCircleReorgData();

  const [view, setView] = useState<'current' | 'proposed'>('proposed');
  const [showThanas, setShowThanas] = useState(false);
  const [showShops, setShowShops] = useState(true);
  const [baseLayer, setBaseLayer] = useState<BaseLayerKind>('carto');
  const [mapCircleFilter, setMapCircleFilter] = useState('all');
  const [mapTypeFilter, setMapTypeFilter] = useState('all');

  const districtSummary = data?.districts.find((d) => d.districtName === name) ?? null;
  const circles = useMemo(() => (data?.circles ?? []).filter((c) => c.districtName === name), [data, name]);
  const thanas = useMemo(() => (data?.thanas ?? []).filter((t) => t.districtName === name), [data, name]);

  // Real shop rows for this district, off the same export_cache the /admin/export and
  // /admin/circles-sectors pages already share — no dedicated fetch for this page.
  const { data: exportData, loading: exportLoading, syncing: exportSyncing, sync: syncExport } = useAdminExportData();
  const currentShops = useMemo(
    () => (exportData?.rows.filter((r) => r.districtName === name) ?? []) as ShopExplorerRow[],
    [exportData, name],
  );
  const currentUnits = useMemo(
    () => exportData?.units.filter((u) => u.districtName === name) ?? [],
    [exportData, name],
  );

  // District boundary, off the same public/geodata/up-districts.geojson file the admin overview
  // choropleth already uses (static file, no D1 read) — used only to flag a shop whose recorded
  // coordinates fall outside its own district, the same "doubtful location" check the
  // Commissioner's own viewer runs (there, precomputed into the file; here, computed live against
  // our own D1 data, since that's the data actually being plotted).
  const [districtGeometry, setDistrictGeometry] = useState<{ type: string; coordinates: unknown } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/geodata/up-districts.geojson').then((r) => r.json()).then((geo: { features: { properties: { district: string }; geometry: { type: string; coordinates: unknown } }[] }) => {
      if (!alive) return;
      const feature = geo.features.find((f) => f.properties.district === name);
      setDistrictGeometry(feature?.geometry ?? null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [name]);
  const outOfBoundsShopIds = useMemo(() => {
    if (!districtGeometry) return new Set<string>();
    const ids = new Set<string>();
    for (const s of currentShops) {
      if (s.latitudeDecimal == null || s.longitudeDecimal == null) continue;
      if (pointInDistrict(s.latitudeDecimal, s.longitudeDecimal, districtGeometry) === false) ids.add(s.shopId);
    }
    return ids;
  }, [currentShops, districtGeometry]);

  // Proposed grouping: no shop-level table exists for the proposal (see CLAUDE.md's "Circle
  // Reorganization Proposal" section) — a shop's proposed circle is derived here the same way
  // generateCircleReorgReport() does for the export, by matching its Thana against thanaKey.
  const thanaToProposedCircle = useMemo(
    () => new Map(thanas.map((t) => [t.thanaKey, t.proposedCircleName])),
    [thanas],
  );
  const proposedShops = useMemo(() => currentShops.map((s) => {
    const proposed = thanaToProposedCircle.get(normalizeThanaName(s.thanaName));
    return proposed ? { ...s, circleSectorName: proposed } : s;
  }), [currentShops, thanaToProposedCircle]);
  const proposedUnits = useMemo(
    () => circles.filter((c) => c.status !== 'abolished').map((c) => ({ name: c.name, type: c.name.startsWith('Sector') ? 'sector' : 'circle' })),
    [circles],
  );

  const { hasHbrOrPrv, excludeHbrPrv, setExcludeHbrPrv, effectiveShops: effectiveCurrentShops } = useExcludeHbrPrv('circle-reorg', name, currentShops);
  const effectiveProposedShops = useMemo(
    () => (excludeHbrPrv ? proposedShops.filter((s) => s.shopType !== 'HBR' && s.shopType !== 'PRV') : proposedShops),
    [proposedShops, excludeHbrPrv],
  );

  const [circleSearch, setCircleSearch] = useState('');
  const [circleStatusFilter, setCircleStatusFilter] = useState('all');
  const [circleSort, setCircleSort] = useState<{ key: CircleSortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const changeOf = (c: ReorgCircle) => (c.currentRevenue && c.proposedRevenue ? (c.proposedRevenue - c.currentRevenue) / c.currentRevenue : null);
  const circleRows = useMemo(() => {
    const filtered = circles
      .filter((c) => !circleSearch || c.name.toLowerCase().includes(circleSearch.toLowerCase()))
      .filter((c) => circleStatusFilter === 'all' || c.status === circleStatusFilter);
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (circleSort.key === 'name') cmp = a.name.localeCompare(b.name);
      else if (circleSort.key === 'change') cmp = (changeOf(a) ?? -Infinity) - (changeOf(b) ?? -Infinity);
      else cmp = (a[circleSort.key] ?? 0) - (b[circleSort.key] ?? 0);
      return circleSort.dir === 'asc' ? cmp : -cmp;
    });
  }, [circles, circleSearch, circleStatusFilter, circleSort]);
  function toggleCircleSort(key: CircleSortKey) {
    setCircleSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  const [thanaSearch, setThanaSearch] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [thanaSort, setThanaSort] = useState<{ key: ThanaSortKey; dir: 'asc' | 'desc' }>({ key: 'thanaName', dir: 'asc' });
  const isChanged = (t: ReorgThana) => !(t.currentCircleNames.length === 1 && t.currentCircleNames[0] === t.proposedCircleName);
  const thanaRows = useMemo(() => {
    let filtered = thanas.filter((t) => !thanaSearch || t.thanaName.toLowerCase().includes(thanaSearch.toLowerCase()));
    if (changedOnly) filtered = filtered.filter(isChanged);
    return [...filtered].sort((a, b) => {
      const cmp = thanaSort.key === 'thanaName' ? a.thanaName.localeCompare(b.thanaName) : a[thanaSort.key] - b[thanaSort.key];
      return thanaSort.dir === 'asc' ? cmp : -cmp;
    });
  }, [thanas, thanaSearch, changedOnly, thanaSort]);
  function toggleThanaSort(key: ThanaSortKey) {
    setThanaSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<{ destroy: () => void } | null>(null);
  useEffect(() => {
    chartInstance.current?.destroy();
    chartInstance.current = null;
    if (!chartRef.current || circles.length === 0 || typeof Chart === 'undefined') return;
    const sorted = [...circles].sort((a, b) => (b.proposedRevenue ?? b.currentRevenue ?? 0) - (a.proposedRevenue ?? a.currentRevenue ?? 0));
    chartInstance.current = new Chart(chartRef.current.getContext('2d')!, {
      type: 'bar',
      data: {
        labels: sorted.map((c) => c.name),
        datasets: [
          { label: 'Current Revenue', data: sorted.map((c) => c.currentRevenue ?? 0), backgroundColor: '#94a3b8' },
          { label: 'Proposed Revenue', data: sorted.map((c) => c.proposedRevenue ?? 0), backgroundColor: '#1d4ed8' },
        ],
      },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
    });
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  }, [circles]);

  const [cartoKey, setCartoKey] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = await adminSettingsCache.get() as { cartoApiKey: string | null } | null;
      if (cached?.cartoApiKey) { if (alive) setCartoKey(cached.cartoApiKey); return; }
      const res = await fetch('/api/admin/settings');
      if (!res.ok || !alive) return;
      const s = await res.json() as { cartoApiKey: string | null };
      void adminSettingsCache.set(s);
      setCartoKey(s.cartoApiKey ?? null);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const syncTheme = () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Current and Proposed each get their own Leaflet instance, kept side by side, instead of one
  // map with a toggle — a re-carve is far easier to compare when both are on screen at once.
  const currentMap = useCircleMap(
    'circle-reorg-map-current', 'current', circles, thanas, effectiveCurrentShops, outOfBoundsShopIds,
    showThanas, showShops, mapCircleFilter, mapTypeFilter, cartoKey, theme, baseLayer,
  );
  const proposedMap = useCircleMap(
    'circle-reorg-map-proposed', 'proposed', circles, thanas, effectiveProposedShops, outOfBoundsShopIds,
    showThanas, showShops, mapCircleFilter, mapTypeFilter, cartoKey, theme, baseLayer,
  );

  // The two maps exist to be compared side by side — panning/zooming one should move the other
  // to the same view, matching the Commissioner's own viewer (up_excise_circle_map.html).
  useEffect(() => {
    const a = currentMap.mapInstance.current, b = proposedMap.mapInstance.current;
    if (!a || !b) return;
    let guard = false;
    const sync = (src: LeafletMapH, dst: LeafletMapH) => () => {
      if (guard) return;
      guard = true;
      dst.setView(src.getCenter(), src.getZoom(), { animate: false });
      guard = false;
    };
    const onA = sync(a, b), onB = sync(b, a);
    a.on('move', onA); b.on('move', onB);
    return () => { a.off('move', onA); b.off('move', onB); };
  }, [circles, currentMap.mapInstance, proposedMap.mapInstance]);

  if (loading) return <div className="p-8 text-center text-base-content/60">Loading…</div>;
  if (!data) return (
    <div className="bg-base-100 rounded-xl border border-base-200 p-6 text-center text-sm text-base-content/70">
      Proposal data not loaded on this device yet — go back to <Link href="/admin/circle-reorg" className="link link-primary">Circle Reorg</Link> and load it first.
    </div>
  );
  if (!districtSummary) return (
    <div className="bg-base-100 rounded-xl border border-base-200 p-6 text-center text-sm text-base-content/70">
      No reorganization proposal for &quot;{name}&quot;.
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/circle-reorg" className="text-sm link link-hover">&larr; Circle Reorganization Proposal</Link>
        <h1 className="text-2xl font-bold tracking-tight mt-1">{name}</h1>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-3">
          <div className="text-xs text-base-content/70">Current Circles</div>
          <div className="text-xl font-bold tabular-nums">{districtSummary.currentCircleCount}</div>
        </div>
        <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-3">
          <div className="text-xs text-base-content/70">Proposed Circles</div>
          <div className="text-xl font-bold tabular-nums">{districtSummary.proposedCircleCount}</div>
        </div>
        <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-3">
          <div className="text-xs text-base-content/70">Deviation Now</div>
          <div className="text-xl font-bold tabular-nums">{pct(districtSummary.currentDeviation)}</div>
        </div>
        <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-3">
          <div className="text-xs text-base-content/70">Deviation Proposed</div>
          <div className="text-xl font-bold tabular-nums">{pct(districtSummary.proposedDeviation)}</div>
        </div>
        <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-3">
          <div className="text-xs text-base-content/70">Shops Re-assigned</div>
          <div className="text-xl font-bold tabular-nums">{districtSummary.shopsMoved.toLocaleString()}</div>
        </div>
        <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-3">
          <div className="text-xs text-base-content/70">More Equitable?</div>
          <div className="mt-1"><span className={`badge ${districtSummary.optimized === 'Yes' ? 'badge-success' : 'badge-ghost'}`}>{districtSummary.optimized}</span></div>
        </div>
      </div>

      <div className="bg-base-100 rounded-xl border border-base-200 p-4">
        <div className="flex flex-nowrap items-center gap-3 mb-3 overflow-x-auto pb-1">
          <span className="font-semibold text-sm shrink-0">Current vs. Proposed Circles</span>
          <div className="join shrink-0">
            <button className={`btn btn-xs join-item ${baseLayer === 'carto' ? 'btn-active' : ''}`} onClick={() => setBaseLayer('carto')}>Map</button>
            <button className={`btn btn-xs join-item ${baseLayer === 'osm' ? 'btn-active' : ''}`} onClick={() => setBaseLayer('osm')}>Street</button>
            <button className={`btn btn-xs join-item ${baseLayer === 'satellite' ? 'btn-active' : ''}`} onClick={() => setBaseLayer('satellite')}>Satellite</button>
          </div>
          <label className="label cursor-pointer gap-2 shrink-0">
            <input type="checkbox" className="checkbox checkbox-sm" checked={showThanas} onChange={(e) => setShowThanas(e.target.checked)} />
            <span className="label-text text-sm">Thana boundaries</span>
          </label>
          <label className="label cursor-pointer gap-2 shrink-0">
            <input type="checkbox" className="checkbox checkbox-sm" checked={showShops} onChange={(e) => setShowShops(e.target.checked)} />
            <span className="label-text text-sm">Shops</span>
          </label>
          {outOfBoundsShopIds.size > 0 && (
            <span className="badge badge-warning badge-sm shrink-0" title="Shops whose recorded coordinates fall outside this district's boundary — shown hollow on the map">
              ⚠ {outOfBoundsShopIds.size} outside district
            </span>
          )}
          <select
            className="select select-xs select-bordered ml-auto shrink-0"
            value={mapCircleFilter}
            onChange={(e) => setMapCircleFilter(e.target.value)}
          >
            <option value="all">All circles</option>
            {[...circles].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <select
            className="select select-xs select-bordered shrink-0"
            value={mapTypeFilter}
            onChange={(e) => setMapTypeFilter(e.target.value)}
          >
            <option value="all">All shop types</option>
            {SHOP_TYPES.map((t) => (
              <option key={t} value={t}>{SHOP_TYPE_SHORT_LABEL[t] ?? t}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium text-base-content/70 mb-1">Current</div>
            <div id="circle-reorg-map-current" ref={currentMap.mapRef} style={{ height: 420, borderRadius: 8 }} />
          </div>
          <div>
            <div className="text-xs font-medium text-base-content/70 mb-1">Proposed</div>
            <div id="circle-reorg-map-proposed" ref={proposedMap.mapRef} style={{ height: 420, borderRadius: 8 }} />
          </div>
        </div>
        <p className="text-xs text-base-content/50 mt-2">Panning or zooming either map moves the other to match, and click a shop marker for its details.</p>
      </div>

      <div className="bg-base-100 rounded-xl border border-base-200 p-4">
        <div className="font-semibold text-sm mb-2">Revenue by Circle — Current vs. Proposed</div>
        <div style={{ height: Math.max(320, circles.length * 34) }}>
          <canvas ref={chartRef} aria-label="Circle revenue comparison chart" />
        </div>
      </div>

      <div className="bg-base-100 rounded-xl border border-base-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-base-200 flex flex-wrap items-center gap-3">
          <span className="font-semibold text-sm">Circles / Sectors</span>
          <select
            className="select select-sm select-bordered ml-auto"
            value={circleStatusFilter}
            onChange={(e) => setCircleStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="kept">Kept</option>
            <option value="new">New</option>
            <option value="abolished">Abolished</option>
          </select>
          <input
            type="text"
            placeholder="Search circle…"
            className="input input-sm input-bordered w-full max-w-xs"
            value={circleSearch}
            onChange={(e) => setCircleSearch(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="table table-fixed w-full">
            <colgroup><col style={{ width: '32%' }} /><col style={{ width: '14%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /></colgroup>
            <thead>
              <tr>
                <th className="cursor-pointer select-none" onClick={() => toggleCircleSort('name')}>Name <SortIcon active={circleSort.key === 'name'} dir={circleSort.dir} /></th>
                <th>Status</th>
                <th className="cursor-pointer select-none text-right" onClick={() => toggleCircleSort('currentRevenue')}>Current Revenue <SortIcon active={circleSort.key === 'currentRevenue'} dir={circleSort.dir} /></th>
                <th className="cursor-pointer select-none text-right" onClick={() => toggleCircleSort('proposedRevenue')}>Proposed Revenue <SortIcon active={circleSort.key === 'proposedRevenue'} dir={circleSort.dir} /></th>
                <th className="cursor-pointer select-none text-right" onClick={() => toggleCircleSort('change')}>Change <SortIcon active={circleSort.key === 'change'} dir={circleSort.dir} /></th>
              </tr>
            </thead>
            <tbody>
              {circleRows.map((c: ReorgCircle) => {
                const change = changeOf(c);
                return (
                  <tr key={c.id} className="hover">
                    <td className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colorForName(c.name) }} />{c.name}</td>
                    <td><span className={`badge badge-sm ${STATUS_BADGE[c.status] ?? ''}`}>{c.status}</span></td>
                    <td className="text-right tabular-nums">{fmt(c.currentRevenue)}</td>
                    <td className="text-right tabular-nums">{fmt(c.proposedRevenue)}</td>
                    <td className={`text-right tabular-nums font-medium ${change == null ? 'text-base-content/40' : change >= 0 ? 'text-success' : 'text-error'}`}>
                      {change == null ? '—' : `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-base-100 rounded-xl border border-base-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-base-200 flex flex-wrap items-center gap-3">
          <span className="font-semibold text-sm">Thanas</span>
          <label className="label cursor-pointer gap-2">
            <input type="checkbox" className="checkbox checkbox-sm" checked={changedOnly} onChange={(e) => setChangedOnly(e.target.checked)} />
            <span className="label-text text-sm">Changed only</span>
          </label>
          <input
            type="text"
            placeholder="Search thana…"
            className="input input-sm input-bordered ml-auto w-full max-w-xs"
            value={thanaSearch}
            onChange={(e) => setThanaSearch(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="table table-fixed w-full">
            <colgroup><col style={{ width: '24%' }} /><col style={{ width: '12%' }} /><col style={{ width: '18%' }} /><col style={{ width: '23%' }} /><col style={{ width: '23%' }} /></colgroup>
            <thead>
              <tr>
                <th className="cursor-pointer select-none" onClick={() => toggleThanaSort('thanaName')}>Thana <SortIcon active={thanaSort.key === 'thanaName'} dir={thanaSort.dir} /></th>
                <th className="cursor-pointer select-none text-right" onClick={() => toggleThanaSort('shopCount')}>Shops <SortIcon active={thanaSort.key === 'shopCount'} dir={thanaSort.dir} /></th>
                <th className="cursor-pointer select-none text-right" onClick={() => toggleThanaSort('revenue')}>Revenue <SortIcon active={thanaSort.key === 'revenue'} dir={thanaSort.dir} /></th>
                <th>Current Circle(s)</th>
                <th>Proposed Circle</th>
              </tr>
            </thead>
            <tbody>
              {thanaRows.map((t: ReorgThana) => {
                const changed = isChanged(t);
                return (
                  <tr key={t.id} className={`hover ${changed ? 'bg-warning/5' : ''}`}>
                    <td>{t.thanaName}</td>
                    <td className="text-right tabular-nums">{t.shopCount}</td>
                    <td className="text-right tabular-nums">{fmt(t.revenue)}</td>
                    <td className="text-xs">{t.currentCircleNames.join(', ')}</td>
                    <td className={`text-xs ${changed ? 'font-semibold text-warning' : ''}`}>{t.proposedCircleName}</td>
                  </tr>
                );
              })}
              {thanaRows.length === 0 && (
                <tr><td colSpan={5} className="text-center text-sm text-base-content/60 py-6">No matching Thanas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-base-100 rounded-xl border border-base-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-base-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="font-semibold text-sm">Shop Explorer</span>
            <p className="text-xs text-base-content/60 mt-0.5">
              {view === 'current'
                ? "Shops grouped by their real, currently-registered circle/sector."
                : "Shops grouped by proposed circle, derived from each shop's Thana — not stored data."}
            </p>
          </div>
          <div className="join">
            <button className={`btn btn-sm join-item ${view === 'current' ? 'btn-active' : ''}`} onClick={() => setView('current')}>Current</button>
            <button className={`btn btn-sm join-item ${view === 'proposed' ? 'btn-active' : ''}`} onClick={() => setView('proposed')}>Proposed</button>
          </div>
        </div>
        <div className="p-4">
          {!exportData ? (
            <div className="text-center text-sm text-base-content/70 py-8 space-y-3">
              <p>Shop data not loaded on this device yet.</p>
              <button className="btn btn-primary btn-sm" onClick={() => void syncExport()} disabled={exportSyncing}>
                {exportSyncing && <span className="loading loading-spinner loading-xs" />}
                Load Shop Data
              </button>
            </div>
          ) : (
            <ShopExplorer
              shops={view === 'current' ? effectiveCurrentShops : effectiveProposedShops}
              units={view === 'current' ? currentUnits : proposedUnits}
              districtName={name}
              loading={exportLoading}
              storageKeyPrefix={view === 'current' ? 'circle-reorg-current' : 'circle-reorg-proposed'}
              hasHbrOrPrv={hasHbrOrPrv}
              excludeHbrPrv={excludeHbrPrv}
              onExcludeHbrPrvChange={setExcludeHbrPrv}
            />
          )}
        </div>
      </div>
    </div>
  );
}
