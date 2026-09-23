'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useCircleReorgData, type ReorgCircle, type ReorgThana } from '@/hooks/useCircleReorgData';

const fmt = (n: number | null) => n == null ? '—' : n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${n.toLocaleString('en-IN')}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const STATUS_BADGE: Record<string, string> = { kept: 'badge-ghost', new: 'badge-success', abolished: 'badge-error' };

// Stable hash → HSL color per circle name, so the same circle keeps the same color whether
// shown in the Current or Proposed map layer — that's what makes a re-carve visually legible.
function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 65%, 55%)`;
}

// Ambient, file-local only (not `declare global`) — avoids colliding with the admin overview
// page's own separate Leaflet ambient block. See CLAUDE.md's Leaflet CDN-global note.
interface LeafletMapH {
  fitBounds: (b: [[number, number], [number, number]], o?: { padding?: [number, number] }) => LeafletMapH;
  remove: () => void;
}
interface LeafletLayerH {
  addTo: (m: LeafletMapH) => LeafletLayerH;
  remove: () => void;
  bindTooltip?: (t: string, o?: unknown) => void;
  getBounds?: () => [[number, number], [number, number]];
}
declare const L: {
  map: (id: string) => LeafletMapH;
  tileLayer: (url: string, opts: unknown) => LeafletLayerH;
  geoJSON: (data: unknown, opts: unknown) => LeafletLayerH;
};

export default function CircleReorgDistrictPage({ params }: { params: Promise<{ district: string }> }) {
  const { district } = use(params);
  const name = decodeURIComponent(district);
  const { data, loading } = useCircleReorgData();

  const [view, setView] = useState<'current' | 'proposed'>('proposed');
  const [showThanas, setShowThanas] = useState(false);

  const districtSummary = data?.districts.find((d) => d.districtName === name) ?? null;
  const circles = useMemo(() => (data?.circles ?? []).filter((c) => c.districtName === name), [data, name]);
  const thanas = useMemo(() => (data?.thanas ?? []).filter((t) => t.districtName === name), [data, name]);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMapH | null>(null);
  const layersRef = useRef<LeafletLayerH[]>([]);

  useEffect(() => {
    if (!mapRef.current || circles.length === 0 || typeof L === 'undefined') return;
    if (!mapInstance.current) {
      mapInstance.current = L.map('circle-reorg-map');
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB' }).addTo(mapInstance.current);
    }
    layersRef.current.forEach((l) => l.remove());
    layersRef.current = [];

    let bounds: [[number, number], [number, number]] | null = null;

    for (const c of circles) {
      const geom = view === 'current' ? c.currentBoundary : c.proposedBoundary;
      if (!geom) continue;
      const color = colorForName(c.name);
      const layer = L.geoJSON({ type: 'Feature', geometry: geom, properties: {} }, {
        style: { fillColor: color, color, weight: 1.5, fillOpacity: 0.45 },
      }).addTo(mapInstance.current);
      layer.bindTooltip?.(c.name, { permanent: false });
      layersRef.current.push(layer);
      const b = layer.getBounds?.();
      if (b) bounds = bounds ? [[Math.min(bounds[0][0], b[0][0]), Math.min(bounds[0][1], b[0][1])], [Math.max(bounds[1][0], b[1][0]), Math.max(bounds[1][1], b[1][1])]] : b;
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

    if (bounds) mapInstance.current.fitBounds(bounds, { padding: [16, 16] });

    return () => { layersRef.current.forEach((l) => l.remove()); layersRef.current = []; };
  }, [circles, thanas, view, showThanas]);

  useEffect(() => () => { mapInstance.current?.remove(); mapInstance.current = null; }, []);

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
        <p className="text-sm text-base-content/70 mt-0.5">
          {districtSummary.currentCircleCount} circles/sectors currently &rarr; {districtSummary.proposedCircleCount} proposed ·
          {' '}revenue deviation {pct(districtSummary.currentDeviation)} &rarr; {pct(districtSummary.proposedDeviation)} ·
          {' '}{districtSummary.shopsMoved.toLocaleString()} shops re-assigned
        </p>
      </div>

      <div className="bg-base-100 rounded-xl border border-base-200 p-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="join">
            <button className={`btn btn-sm join-item ${view === 'current' ? 'btn-active' : ''}`} onClick={() => setView('current')}>Current</button>
            <button className={`btn btn-sm join-item ${view === 'proposed' ? 'btn-active' : ''}`} onClick={() => setView('proposed')}>Proposed</button>
          </div>
          <label className="label cursor-pointer gap-2">
            <input type="checkbox" className="checkbox checkbox-sm" checked={showThanas} onChange={(e) => setShowThanas(e.target.checked)} />
            <span className="label-text text-sm">Show Thana boundaries</span>
          </label>
        </div>
        <div id="circle-reorg-map" ref={mapRef} style={{ height: 480, borderRadius: 8 }} />
      </div>

      <div className="bg-base-100 rounded-xl border border-base-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-base-200 font-semibold text-sm">Circles / Sectors</div>
        <div className="overflow-x-auto">
          <table className="table table-fixed w-full">
            <colgroup><col style={{ width: '34%' }} /><col style={{ width: '16%' }} /><col style={{ width: '25%' }} /><col style={{ width: '25%' }} /></colgroup>
            <thead><tr><th>Name</th><th>Status</th><th className="text-right">Current Revenue</th><th className="text-right">Proposed Revenue</th></tr></thead>
            <tbody>
              {circles.map((c: ReorgCircle) => (
                <tr key={c.id} className="hover">
                  <td className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: colorForName(c.name) }} />{c.name}</td>
                  <td><span className={`badge badge-sm ${STATUS_BADGE[c.status] ?? ''}`}>{c.status}</span></td>
                  <td className="text-right tabular-nums">{fmt(c.currentRevenue)}</td>
                  <td className="text-right tabular-nums">{fmt(c.proposedRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-base-100 rounded-xl border border-base-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-base-200 font-semibold text-sm">Thanas</div>
        <div className="overflow-x-auto">
          <table className="table table-fixed w-full">
            <colgroup><col style={{ width: '24%' }} /><col style={{ width: '12%' }} /><col style={{ width: '18%' }} /><col style={{ width: '23%' }} /><col style={{ width: '23%' }} /></colgroup>
            <thead><tr><th>Thana</th><th className="text-right">Shops</th><th className="text-right">Revenue</th><th>Current Circle(s)</th><th>Proposed Circle</th></tr></thead>
            <tbody>
              {thanas.map((t: ReorgThana) => {
                const changed = !(t.currentCircleNames.length === 1 && t.currentCircleNames[0] === t.proposedCircleName);
                return (
                  <tr key={t.id} className="hover">
                    <td>{t.thanaName}</td>
                    <td className="text-right tabular-nums">{t.shopCount}</td>
                    <td className="text-right tabular-nums">{fmt(t.revenue)}</td>
                    <td className="text-xs">{t.currentCircleNames.join(', ')}</td>
                    <td className={`text-xs ${changed ? 'font-semibold text-warning' : ''}`}>{t.proposedCircleName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
