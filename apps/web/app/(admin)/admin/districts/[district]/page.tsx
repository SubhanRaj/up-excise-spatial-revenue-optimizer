'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import HelpPanel from '@/app/_components/HelpPanel';
import { adminShopsCache, adminUnlockRequestsCache } from '@/lib/db';
import { useSession } from '@/hooks/useSession';
import { EditDistrictDrawer } from '@/app/_components/EditDistrictDrawer';
import { statusLabel, statusBadgeClass } from '@/lib/status';
import { ShopExplorer, type ShopExplorerRow } from '@/components/ShopExplorer';
import { UnitsModal } from '@/components/UnitsModal';
import { useShopAggregates } from '@/hooks/useShopAggregates';
import { SHOP_TYPE_LABELS, SHOP_TYPES } from '@excise/schema';

interface UnlockRequestRow {
  id: number;
  districtName: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  requestType: 'units' | 'data_correction';
  requestedByDeo: string;
}

interface DistrictDetail {
  name: string; division: string | null; deoName: string | null; deoEmail: string | null;
  deoId: string | null; expectedVendCount: number | null; status: string;
  bboxMinLat: number | null; bboxMaxLat: number | null; bboxMinLon: number | null; bboxMaxLon: number | null;
  vendCount: number; totalRevenue: number; units: { name: string; type: string }[];
}

const fmtCr = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, href, onClick }: { label: string; value: string; sub?: string; href?: string; onClick?: () => void }) {
  const inner = (
    <>
      <p className="text-[11px] uppercase tracking-widest font-medium text-base-content/60">{label}</p>
      {href
        ? <Link href={href} className="block text-xl font-bold text-primary tabular-nums hover:underline underline-offset-2">{value}</Link>
        : <p className={`text-xl font-bold tabular-nums ${onClick ? 'text-primary' : 'text-base-content'}`}>{value}</p>}
      {sub && <p className="text-xs text-base-content/70">{sub}</p>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="bg-base-100 rounded-xl border border-base-200 p-4 space-y-1 text-left cursor-pointer hover:border-primary/50 hover:shadow-md transition-all">
        {inner}
      </button>
    );
  }
  return <div className="bg-base-100 rounded-xl border border-base-200 p-4 space-y-1">{inner}</div>;
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DistrictDetailPage({ params }: { params: Promise<{ district: string }> }) {
  const { district } = use(params);
  const name = decodeURIComponent(district);
  const { session } = useSession();

  const [detail, setDetail] = useState<DistrictDetail | null>(null);
  const [allShops, setAllShops] = useState<ShopExplorerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingUnlockRequest, setPendingUnlockRequest] = useState<UnlockRequestRow | null>(null);
  const [showUnitsModal, setShowUnitsModal] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const cached = await adminShopsCache.get(name) as { d: DistrictDetail; s: { rows: ShopExplorerRow[] }; fetchedAt: number } | null;
      if (cached) {
        // Cheap check first: did *this* district actually change since we cached it? If not,
        // skip the expensive pageSize=all shop-rows read entirely — this is what lets a
        // revisit any time later still cost nothing beyond one indexed audit_log scan.
        const changed = await fetch(`/api/admin/changed-districts?since=${cached.fetchedAt}`)
          .then((r) => r.ok ? r.json() as Promise<{ districts: string[] }> : { districts: [name] })
          .catch(() => ({ districts: [name] })); // network hiccup — fail toward a real refetch, not stale data
        if (!changed.districts.includes(name)) {
          setDetail(cached.d);
          setAllShops(cached.s.rows);
          setLoading(false);
          return;
        }
      }
      const [d, s] = await Promise.all([
        fetch(`/api/admin/districts/${encodeURIComponent(name)}`).then((r) => r.json()),
        fetch(`/api/admin/districts/${encodeURIComponent(name)}/shops?pageSize=all`).then((r) => r.json()),
      ]);
      adminShopsCache.set(name, { d, s, fetchedAt: Date.now() });
      setDetail(d as DistrictDetail);
      setAllShops((s as { rows: ShopExplorerRow[] }).rows);
      setLoading(false);
    }
    void load();
  }, [name]);

  // The unlock button only ever appears for a district with an actual pending unlock request
  // from its DEO — there is no "unlock on a whim" path. See POST /api/admin/unlock-requests/resolve.
  useEffect(() => {
    async function loadPendingRequest() {
      const cached = await adminUnlockRequestsCache.get();
      let rows: UnlockRequestRow[] | null = (cached as { rows: UnlockRequestRow[] } | null)?.rows ?? null;
      if (!rows) {
        const data = await fetch('/api/admin/unlock-requests').then((r) => r.json()) as { rows: UnlockRequestRow[] };
        rows = data.rows;
        adminUnlockRequestsCache.set({ rows });
      }
      setPendingUnlockRequest(rows.find((r) => r.districtName === name && r.status === 'pending') ?? null);
    }
    void loadPendingRequest();
  }, [name]);

  const [unlocking, setUnlocking] = useState(false);

  async function unlockUnits() {
    const request = pendingUnlockRequest;
    if (!request) return;

    const isCorrection = request.requestType === 'data_correction';
    const SwalG = (window as unknown as { Swal?: { fire: (o: Record<string, unknown>) => Promise<{ isConfirmed: boolean; value?: string }> } }).Swal;
    const confirm = await SwalG?.fire({
      icon: 'warning',
      title: isCorrection ? 'Approve data-correction unlock?' : 'Approve unlock request?',
      html: isCorrection
        ? `<p>The DEO requested: <em>"${request.reason.replace(/</g, '&lt;')}"</em></p>
           <p style="margin-top:8px">Approving lets the DEO re-upload a corrected Excel file for <b>${name}</b> — it does <b>not</b> delete any submitted shop data or circles/sectors. Re-uploading only updates the shop(s) whose data changed; the district returns to "submitted" once they resubmit.</p>`
        : `<p>The DEO requested: <em>"${request.reason.replace(/</g, '&lt;')}"</em></p>
           <p style="margin-top:8px">Approving deletes all <b>${detail?.units.length ?? 0} circle/sector</b> entries for <b>${name}</b> and lets the DEO re-register them from scratch. This does not affect any already-uploaded shop data.</p>`,
      input: 'textarea',
      inputPlaceholder: 'Your note (required)',
      showCancelButton: true,
      confirmButtonText: isCorrection ? 'Approve & Allow Re-upload' : 'Approve & Unlock',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#1d4ed8',
      inputValidator: (value: string) => (value && value.trim() ? undefined : 'Please enter a note.'),
    });
    if (!confirm?.isConfirmed) return;
    const note = String(confirm.value ?? '').trim();

    setUnlocking(true);
    try {
      const res = await fetch('/api/admin/unlock-requests/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: request.id, action: 'approve', note }),
      });
      if (!res.ok) {
        await SwalG?.fire({ icon: 'error', title: 'Could not unlock', text: 'Please try again.' });
        return;
      }
      adminUnlockRequestsCache.invalidate();
      setPendingUnlockRequest(null);
      await refreshShops();
      void SwalG?.fire({
        toast: true, position: 'top-end', icon: 'success',
        title: isCorrection ? 'District re-opened for correction.' : 'Circles & sectors unlocked.',
        showConfirmButton: false, timer: 3000, timerProgressBar: true,
      });
    } finally {
      setUnlocking(false);
    }
  }

  async function refreshShops() {
    setLoading(true);
    const [d, s] = await Promise.all([
      fetch(`/api/admin/districts/${encodeURIComponent(name)}`).then((r) => r.json()),
      fetch(`/api/admin/districts/${encodeURIComponent(name)}/shops?pageSize=all`).then((r) => r.json()),
    ]);
    adminShopsCache.set(name, { d, s, fetchedAt: Date.now() });
    setDetail(d as DistrictDetail);
    setAllShops((s as { rows: ShopExplorerRow[] }).rows);
    setLoading(false);
  }

  // Gives an admin the exact same re-uploadable file a DEO's own "Download Current Data"
  // produces — the dropdown-intact DEO template pre-filled with this district's current D1
  // data (M-91). Exists because "Export XLSX" (the button above, from ShopExplorer) is a
  // read-only report with a completely different column layout; re-uploading it fails or
  // silently corrupts data (see the parseExcelFile guard in lib/excel.ts). Useful for an admin
  // walking a DEO through a correction directly, or recovering a device whose local staging is
  // empty/stuck — this always reads fresh from what the page already has loaded, no separate
  // D1 call. Same builder (generateTemplate()) as /upload — no template drift between portals.
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  async function downloadReuploadTemplate() {
    if (!detail) return;
    setDownloadingTemplate(true);
    try {
      const { generateTemplate } = await import('@/lib/excel');
      // latitudeDms/longitudeDms aren't part of ShopExplorerRow (only the decimal fields are) —
      // null placeholders are fine, generateTemplate()'s pre-fill only reads latitudeDecimal/
      // longitudeDecimal for these rows.
      const existingRows = allShops.map((s) => ({
        ...s, districtName: name, status: 'uploaded' as const, latitudeDms: null, longitudeDms: null,
      }));
      const blob = await generateTemplate(name, detail.units.map((u) => u.name), existingRows);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${name}-current-data.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingTemplate(false);
    }
  }

  const { typeCounts } = useShopAggregates(allShops, detail?.units ?? []);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="flex gap-3 items-center flex-wrap">
        <Link href="/admin/districts" className="btn btn-ghost btn-sm gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Districts
        </Link>
        <span className="text-base-content/50">/</span>
        <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
        {session?.role === 'superadmin' && detail && (
          <button className="btn btn-ghost btn-xs btn-circle" onClick={() => setEditing(true)} aria-label={`Edit ${name}`} title="Edit district">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
          </button>
        )}
        {detail && (
          <span className={`badge badge-sm font-medium ${statusBadgeClass(detail.status)}`}>
            {statusLabel(detail.status)}
          </span>
        )}
        <div className="ml-auto flex gap-2 items-center">
          {detail && detail.units.length > 0 && (
            <button
              className="btn btn-sm btn-outline gap-2"
              onClick={downloadReuploadTemplate}
              disabled={downloadingTemplate}
              title="Downloads the same dropdown-intact file a DEO's own &quot;Download Current Data&quot; produces — for re-upload, not for Export XLSX's read-only report format"
            >
              {downloadingTemplate ? <span className="loading loading-spinner loading-xs" /> : 'Download Re-upload Template'}
            </button>
          )}
          <HelpPanel pageKey="admin_district_detail" title="District Detail — How to use this page">
            <ul className="list-disc list-inside space-y-1">
              <li><strong>All fields</strong> — every Phase 1 data field is shown: shop ID, name, circle/sector, thana, adjacent thanas, type, coordinates, and revenue.</li>
              <li><strong>Revenue breakdown</strong> — click any revenue figure to expand the fee component breakdown for that shop.</li>
              <li><strong>CL5CC</strong> — shown as a sub-badge under the shop type. CL5CC is Country Liquor with the special beer licence flag enabled.</li>
              <li><strong>Search</strong> — filters by shop ID, name, or thana as you type (client-side, no extra network call).</li>
              <li><strong>Sort</strong> — click any underlined column header to sort ascending/descending.</li>
              <li><strong>Type filter</strong> — use the dropdown or click a type card in the breakdown bar above to filter by shop type.</li>
              <li><strong>Group by type</strong> — toggle to cluster rows under shop type headings with per-group subtotals.</li>
              <li><strong>Rows per page</strong> — 10 / 25 / 50 / 100 / All. Your preference is remembered across pages.</li>
              <li><strong>Export XLSX</strong> — downloads this district&apos;s shops as an Excel file for viewing/reporting. All columns are correctly formatted — no CSV comma-quoting issues. Do not re-upload this file — its column layout doesn&apos;t match the DEO template and will be rejected.</li>
              <li><strong>Download Re-upload Template</strong> — downloads the same dropdown-intact template a DEO's own "Download Current Data" button produces, pre-filled with this district's current data. Use this if a DEO needs a correct file to re-upload — never Export XLSX.</li>
            </ul>
          </HelpPanel>
          {detail && detail.units.length > 0 && pendingUnlockRequest && (
            <button className="btn btn-sm btn-outline btn-error gap-2" onClick={unlockUnits} disabled={unlocking} title="The DEO has requested an unlock — review and approve">
              {unlocking ? <span className="loading loading-spinner loading-xs" /> : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0"/></svg>
              )}
              {pendingUnlockRequest.requestType === 'data_correction' ? 'Correction Requested' : 'Unlock Requested'}
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {loading ? (
        <div className="grid md:grid-cols-4 gap-3 animate-pulse">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-20 rounded-xl bg-base-300" />
          ))}
        </div>
      ) : detail && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="District Excise Officer (DEO)" value={detail.deoName ?? '—'} />
          <StatCard
            label="Division"
            value={detail.division ?? '—'}
            {...(detail.division ? { href: `/admin/divisions/${encodeURIComponent(detail.division)}` } : {})}
          />
          <StatCard
            label="Circles & Sectors"
            value={detail.units.length.toLocaleString()}
            sub={`${detail.units.filter((u) => u.type === 'sector').length} sectors · ${detail.units.filter((u) => u.type === 'circle').length} circles`}
            {...(detail.units.length > 0 ? { onClick: () => setShowUnitsModal(true) } : {})}
          />
          <StatCard
            label="Total Vends"
            value={detail.vendCount.toLocaleString()}
            sub={SHOP_TYPES.map((t) => typeCounts[t] ? `${SHOP_TYPE_LABELS[t]}: ${typeCounts[t].count}` : null).filter(Boolean).join(' · ')}
          />
          <StatCard label="Total Revenue" value={fmtCr(detail.totalRevenue)} sub={`across ${detail.vendCount.toLocaleString()} vends`} />
        </div>
      )}
      {showUnitsModal && detail && (
        <UnitsModal units={detail.units} districtName={detail.name} onClose={() => setShowUnitsModal(false)} />
      )}
      {editing && detail && (
        <EditDistrictDrawer
          district={{ ...detail, unitCount: detail.units.length }}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); void refreshShops(); }}
        />
      )}

      <ShopExplorer shops={allShops} units={detail?.units ?? []} districtName={name} loading={loading} storageKeyPrefix="admin" />
    </div>
  );
}
