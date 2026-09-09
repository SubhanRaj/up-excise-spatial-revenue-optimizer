'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import HelpPanel from '@/app/_components/HelpPanel';
import { useSession } from '@/hooks/useSession';
import { useDeputyData } from '@/hooks/useDeputyData';
import { deputyBasePath } from '@/lib/deputy';
import { deputySettingsCache } from '@/lib/db';
import { validatePersonName } from '@/lib/person-name';
import { STATUS_COLOR, statusLabel, statusBadgeClass, isLocked } from '@/lib/status';

const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
} as const;

function formatInr(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

// Leaflet is loaded as a CDN global in app/layout.tsx; the ambient `L` declaration lives in
// the admin overview page. Narrow local view of the bits used here.
type LMap = {
  setMaxBounds: (b: [[number, number], [number, number]]) => void;
  fitBounds: (b: [[number, number], [number, number]], o?: { padding?: [number, number]; animate?: boolean }) => void;
  remove: () => void;
};
type LLayer = { addTo: (m: LMap) => LLayer; remove: () => void };
type LNS = {
  map: (id: string, o?: Record<string, unknown>) => LMap;
  tileLayer: (url: string, o: unknown) => LLayer;
  geoJSON: (data: unknown, o: unknown) => LLayer;
};

export default function DeputyDashboard() {
  const router = useRouter();
  const { session } = useSession();
  const base = deputyBasePath(session?.division);
  const baseRef = useRef(base);
  useEffect(() => { baseRef.current = base; }, [base]);
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);

  const { districts, reviews, divisionLock, eligibleToLock, blockers, loading, refresh } = useDeputyData();
  const [locking, setLocking] = useState(false);
  const [cartoKey, setCartoKey] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LMap | null>(null);
  const baseLayer = useRef<LLayer | null>(null);
  const geoLayer = useRef<LLayer | null>(null);

  // CARTO key — cached 30 min in the excise-deputy DB (it effectively never changes).
  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = await deputySettingsCache.get() as string | null;
      if (cached != null) { if (alive) setCartoKey(cached); return; }
      const res = await fetch('/api/admin/settings');
      if (!res.ok || !alive) return;
      const s = await res.json() as { cartoApiKey: string | null };
      if (s.cartoApiKey) void deputySettingsCache.set(s.cartoApiKey);
      setCartoKey(s.cartoApiKey ?? null);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const sync = () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const bounds = useMemo<[[number, number], [number, number]] | null>(() => {
    const boxed = districts.filter((d) => d.bboxMinLat != null && d.bboxMaxLat != null && d.bboxMinLon != null && d.bboxMaxLon != null);
    if (boxed.length === 0) return null;
    const minLat = Math.min(...boxed.map((d) => d.bboxMinLat!));
    const maxLat = Math.max(...boxed.map((d) => d.bboxMaxLat!));
    const minLon = Math.min(...boxed.map((d) => d.bboxMinLon!));
    const maxLon = Math.max(...boxed.map((d) => d.bboxMaxLon!));
    return [[minLat, minLon], [maxLat, maxLon]];
  }, [districts]);

  const tileUrl = (t: 'light' | 'dark') => (cartoKey ? `${TILE_URLS[t]}?key=${cartoKey}` : TILE_URLS[t]);

  // Base tile layer follows the theme.
  useEffect(() => {
    if (!mapInstance.current) return;
    baseLayer.current?.remove();
    baseLayer.current = (window as unknown as { L: LNS }).L
      .tileLayer(tileUrl(theme), { attribution: '© CartoDB' }).addTo(mapInstance.current);
  }, [theme, cartoKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const L = (window as unknown as { L?: LNS }).L;
    if (!mapRef.current || !L || districts.length === 0 || !bounds) return;

    if (!mapInstance.current) {
      mapInstance.current = L.map('deputy-map', { minZoom: 6, maxZoom: 11, zoomSnap: 0.25 });
    } else {
      geoLayer.current?.remove();
    }
    mapInstance.current.fitBounds(bounds, { padding: [24, 24], animate: false });

    if (!baseLayer.current) {
      baseLayer.current = L.tileLayer(tileUrl(theme), { attribution: '© CartoDB' }).addTo(mapInstance.current);
    }

    const inDivision = new Set(districts.map((d) => d.name));
    const byName = Object.fromEntries(districts.map((d) => [d.name, d]));

    fetch('/geodata/up-districts.geojson')
      .then((r) => r.json())
      .then((geo: unknown) => {
        geoLayer.current = L.geoJSON(geo, {
          filter: (f: { properties?: { district?: string } }) => inDivision.has(f?.properties?.district ?? ''),
          style: (f: { properties?: { district?: string } }) => {
            const d = byName[f?.properties?.district ?? ''];
            return { fillColor: STATUS_COLOR[d?.status ?? 'pending'] ?? '#94a3b8', weight: 1.5, color: '#334155', fillOpacity: 0.7 };
          },
          onEachFeature: (f: { properties?: { district?: string } }, layer: { bindTooltip: (h: string, o?: Record<string, unknown>) => void; on: (e: string, fn: () => void) => void }) => {
            const name = f?.properties?.district ?? '';
            if (!inDivision.has(name)) return;
            layer.bindTooltip(name, { permanent: true, direction: 'center', className: 'district-map-label' });
            layer.on('click', () => routerRef.current.push(`${baseRef.current}/districts/${encodeURIComponent(name)}`));
          },
        }).addTo(mapInstance.current!);
        if (bounds) mapInstance.current!.fitBounds(bounds, { padding: [24, 24], animate: false });
      })
      .catch(() => {});
  }, [districts, bounds]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => ({
    count: districts.length,
    submitted: districts.filter((d) => isLocked(d.status)).length,
    vends: districts.reduce((s, d) => s + d.vendCount, 0),
    revenue: districts.reduce((s, d) => s + d.totalRevenue, 0),
    units: districts.reduce((s, d) => s + (d.unitCount ?? 0), 0),
  }), [districts]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, in_progress: 0, submitted: 0, verified: 0 };
    for (const d of districts) c[d.status] = (c[d.status] ?? 0) + 1;
    return c;
  }, [districts]);

  const division = districts[0]?.division ?? session?.division ?? '';

  async function lockDivision() {
    const Swal = (window as unknown as { Swal?: { fire: (o: Record<string, unknown>) => Promise<{ isConfirmed: boolean; value?: string }> } }).Swal;
    const res = await Swal?.fire({
      icon: 'warning',
      title: `Verify & lock the ${division} division`,
      html: `<p style="text-align:left">Every district in this division is DEO-verified and you have signed off &ldquo;Looks correct&rdquo; on each one. Enter your full name to verify the division. After you lock it, your DEOs can no longer request a correction themselves — only state Excise headquarters can reopen the division.</p>
             <p style="margin-top:8px;color:#64748b;text-align:left">विभाजन को verify करने के लिए अपना पूरा नाम दर्ज करें। लॉक करने के बाद, केवल राज्य आबकारी मुख्यालय ही मंडल दोबारा खोल सकता है।</p>`,
      input: 'text', inputPlaceholder: 'Full name (English)',
      inputValidator: (v: string) => validatePersonName(v ?? ''),
      showCancelButton: true, confirmButtonText: 'Verify & Lock Division', confirmButtonColor: '#1d4ed8',
      allowOutsideClick: false,
    });
    if (!res?.isConfirmed) return;
    setLocking(true);
    try {
      const r = await fetch(`/api/deputy/divisions/${encodeURIComponent(division)}/lock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lockedByName: res.value ?? '' }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({})) as { error?: string };
        await Swal?.fire({ icon: 'error', title: 'Could not lock', text: e.error ?? 'Please try again.' });
        return;
      }
      await refresh();
      void Swal?.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Division locked.', showConfirmButton: false, timer: 2500, timerProgressBar: true });
    } finally {
      setLocking(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{division ? `${division} Division` : 'Division Dashboard'}</h1>
          <p className="text-base-content/70 mt-1">Review the figures your district officers have submitted</p>
        </div>
        <HelpPanel pageKey="deputy_dashboard" title="Division Dashboard">
          <p>Every district, map polygon, and figure here belongs to your division. All figures are read-only.</p>
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li><strong>Map</strong> — grey is pending, amber is in progress, green is submitted, blue is verified. Click a district to open its figures.</li>
            <li><strong>District table</strong> — the same list as the map. Click a row for the shop-level detail.</li>
            <li><strong>Review</strong> — on a district page, record &ldquo;looks correct&rdquo; or &ldquo;flag an issue&rdquo;. Headquarters sees it in the audit log; it changes no data.</li>
          </ul>
          <p className="mt-2 pt-2 border-t border-base-200">
            Full step-by-step guide (English &amp; Hindi):{' '}
            <a href="https://raw.githubusercontent.com/SubhanRaj/up-excise-spatial-revenue-optimizer/main/docs/manual/Deputy-User-Manual.pdf" target="_blank" rel="noopener noreferrer" className="link link-primary font-medium">Deputy User Manual (PDF)</a>
          </p>
        </HelpPanel>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat bg-base-100 rounded-box shadow"><div className="stat-title">Districts</div><div className="stat-value">{totals.count}</div><div className="stat-desc">{totals.units.toLocaleString()} circles/sectors</div></div>
        <div className="stat bg-base-100 rounded-box shadow"><div className="stat-title">Submitted</div><div className="stat-value text-success">{totals.submitted}</div><div className="stat-desc">of {totals.count}</div></div>
        <div className="stat bg-base-100 rounded-box shadow"><div className="stat-title">Vends Uploaded</div><div className="stat-value">{totals.vends.toLocaleString()}</div></div>
        <div className="stat bg-base-100 rounded-box shadow"><div className="stat-title">Annual Revenue</div><div className="stat-value text-primary">{formatInr(totals.revenue)}</div></div>
      </div>

      {!loading && (
        <div className={`card shadow p-4 ${divisionLock ? 'bg-info/10 border border-info/30' : 'bg-base-100'}`}>
          {divisionLock ? (
            <div>
              <h3 className="font-semibold text-info-content/90 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Division locked
              </h3>
              <p className="text-sm text-base-content/70 mt-1">
                Locked on {new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(divisionLock.lockedAt))} by {divisionLock.lockedBy}.
                {divisionLock.note ? <span className="block mt-1">Note: {divisionLock.note}</span> : null}
              </p>
              <p className="text-xs text-base-content/50 mt-2">Corrections in this division now go through state Excise headquarters.</p>
            </div>
          ) : (
            <div>
              <h3 className="font-semibold">Verify &amp; lock this division</h3>
              <p className="text-sm text-base-content/70 mt-1">
                Once every district is verified by its DEO and signed off by you, lock the division. State headquarters closes the state once all 18 divisions are locked.
              </p>
              {eligibleToLock ? (
                <button className="btn btn-primary btn-sm mt-3" onClick={lockDivision} disabled={locking}>
                  {locking ? <span className="loading loading-spinner loading-xs" /> : 'Verify & Lock Division'}
                </button>
              ) : (
                <p className="text-sm text-warning mt-3">
                  {blockers.notVerified.length > 0 && <span className="block">{blockers.notVerified.length} district{blockers.notVerified.length > 1 ? 's' : ''} not yet DEO-verified: {blockers.notVerified.join(', ')}</span>}
                  {blockers.notReviewedOk.length > 0 && <span className="block">{blockers.notReviewedOk.length} district{blockers.notReviewedOk.length > 1 ? 's' : ''} awaiting your &ldquo;looks correct&rdquo; sign-off: {blockers.notReviewedOk.join(', ')}</span>}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="card bg-base-100 shadow p-4">
        <h3 className="font-semibold mb-2">District Status — {division || 'Division'}</h3>
        <div id="deputy-map" ref={mapRef} style={{ height: 520 }} aria-label="Division district status map" role="img" />
        <div className="flex flex-wrap gap-4 mt-2 text-xs text-base-content/80">
          {([['pending', 'Pending'], ['in_progress', 'In Progress'], ['submitted', 'Submitted'], ['verified', 'Verified']] as const).map(([k, label]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm border border-[#334155]" style={{ background: STATUS_COLOR[k] }} />
              {label} · {statusCounts[k] ?? 0}
            </span>
          ))}
        </div>
      </div>

      <div className="card bg-base-100 shadow p-4">
        <h3 className="font-semibold mb-3">Districts</h3>
        <div className="overflow-x-auto">
          <table className="table table-zebra table-sm w-full">
            <thead>
              <tr><th>District</th><th>DEO</th><th>Status</th><th className="text-right">Vends</th><th className="text-right">Revenue</th><th>Review</th><th></th></tr>
            </thead>
            <tbody>
              {loading && districts.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-base-content/50">Loading…</td></tr>
              ) : districts.map((d) => {
                const rev = reviews[d.name];
                return (
                  <tr key={d.name}>
                    <td className="font-medium">{d.name}</td>
                    <td className="text-base-content/70">{d.deoName ?? '—'}</td>
                    <td><span className={`badge badge-sm ${statusBadgeClass(d.status)}`}>{statusLabel(d.status)}</span></td>
                    <td className="text-right tabular-nums">{d.vendCount.toLocaleString()}</td>
                    <td className="text-right font-mono text-xs">{formatInr(d.totalRevenue)}</td>
                    <td>
                      {rev
                        ? <span className={`badge badge-sm ${rev.verdict === 'flagged' ? 'badge-error' : 'badge-success'}`}>{rev.verdict === 'flagged' ? 'Flagged' : 'Reviewed'}</span>
                        : <span className="text-base-content/40 text-xs">—</span>}
                    </td>
                    <td><Link href={`${base}/districts/${encodeURIComponent(d.name)}`} className="btn btn-ghost btn-xs">View →</Link></td>
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
