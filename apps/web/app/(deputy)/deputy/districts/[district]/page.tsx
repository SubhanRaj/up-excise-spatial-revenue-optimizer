'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import HelpPanel from '@/app/_components/HelpPanel';
import { ShopExplorer, type ShopExplorerRow } from '@/components/ShopExplorer';
import { useExcludeHbrPrv } from '@/hooks/useExcludeHbrPrv';
import { useSession } from '@/hooks/useSession';
import { deputyBasePath, deputyDivisionKey } from '@/lib/deputy';
import { deputyShopsCache, deputyReviewsCache } from '@/lib/db';
import { statusLabel, statusBadgeClass } from '@/lib/status';

interface DistrictDetail {
  name: string; division: string | null; deoName: string | null; status: string;
  units: { name: string; type: string }[];
  vendCount: number; totalRevenue: number;
}
interface Review { verdict: string; note: string; at: number; actorName: string | null }

const fmtInr = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${n.toLocaleString('en-IN')}`;
const fmtDate = (ms: number) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(ms));

type SwalG = { fire: (o: Record<string, unknown>) => Promise<{ isConfirmed: boolean; value?: string }> };

export default function DeputyDistrictPage({ params }: { params: Promise<{ district: string }> }) {
  const { district } = use(params);
  const name = decodeURIComponent(district);
  const { session } = useSession();
  const base = deputyBasePath(session?.division);
  // excise-deputy shop cache is keyed by division too, so a browser shared by two deputies of
  // different divisions never serves one's cached shop rows to the other.
  const divKey = deputyDivisionKey(session?.division);
  const shopKey = divKey ? `${divKey}:${name}` : null;

  const [detail, setDetail] = useState<DistrictDetail | null>(null);
  const [shops, setShops] = useState<ShopExplorerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadReview() {
    const res = await fetch('/api/deputy/reviews');
    if (!res.ok) return;
    const r = await res.json() as { reviews: Record<string, Review> };
    setReview(r.reviews[name] ?? null);
  }

  useEffect(() => {
    if (session && !shopKey) { setForbidden(true); setLoading(false); return; }
    if (!shopKey) return; // session not resolved yet
    let alive = true;
    (async () => {
      setLoading(true);
      const cached = await deputyShopsCache.get(shopKey) as { d: DistrictDetail; rows: ShopExplorerRow[]; fetchedAt: number } | null;
      if (cached) {
        const changed = await fetch(`/api/admin/changed-districts?since=${cached.fetchedAt}`)
          .then((r) => (r.ok ? r.json() as Promise<{ districts: string[] }> : { districts: [name] }))
          .catch(() => ({ districts: [name] })); // network hiccup — fail toward a real refetch
        if (!changed.districts.includes(name)) {
          if (!alive) return;
          setDetail(cached.d); setShops(cached.rows); setLoading(false);
          void loadReview();
          return;
        }
      }
      const [dRes, sRes] = await Promise.all([
        fetch(`/api/admin/districts/${encodeURIComponent(name)}`),
        fetch(`/api/admin/districts/${encodeURIComponent(name)}/shops?pageSize=all`),
      ]);
      if (!alive) return;
      if (dRes.status === 403 || sRes.status === 403) { setForbidden(true); setLoading(false); return; }
      const d = await dRes.json() as DistrictDetail;
      const s = await sRes.json() as { rows: ShopExplorerRow[] };
      void deputyShopsCache.set(shopKey, { d, rows: s.rows, fetchedAt: Date.now() });
      setDetail(d); setShops(s.rows); setLoading(false);
      void loadReview();
    })();
    return () => { alive = false; };
  }, [name, shopKey, session]);

  async function submitReview(verdict: 'ok' | 'flagged') {
    const Swal = (window as unknown as { Swal?: SwalG }).Swal;
    const res = await Swal?.fire(
      verdict === 'ok'
        ? {
            icon: 'question', title: `Mark ${name} as reviewed?`,
            text: 'Records that you have checked this district’s figures and they look correct. Nothing in the data changes.',
            input: 'textarea', inputPlaceholder: 'Optional note',
            showCancelButton: true, confirmButtonText: 'Looks correct', confirmButtonColor: '#16a34a',
          }
        : {
            icon: 'warning', title: `Flag an issue in ${name}?`,
            input: 'textarea', inputPlaceholder: 'Describe the issue (required)',
            inputValidator: (v: string) => (!v || !v.trim() ? 'A note is required when flagging an issue' : undefined),
            showCancelButton: true, confirmButtonText: 'Flag issue', confirmButtonColor: '#dc2626',
          },
    );
    if (!res?.isConfirmed) return;

    setSaving(true);
    try {
      const r = await fetch(`/api/deputy/districts/${encodeURIComponent(name)}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict, note: res.value ?? '' }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({})) as { error?: string };
        await Swal?.fire({ icon: 'error', title: 'Could not save', text: e.error ?? 'Please try again.' });
        return;
      }
      void deputyReviewsCache.invalidate(); // dashboard / list re-fetch review state on next visit
      await loadReview();
      void Swal?.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Review recorded.', showConfirmButton: false, timer: 2500, timerProgressBar: true });
    } finally {
      setSaving(false);
    }
  }

  const { hasHbrOrPrv, excludeHbrPrv, setExcludeHbrPrv, effectiveShops } = useExcludeHbrPrv('deputy', name, shops);
  const displayVendCount = excludeHbrPrv ? effectiveShops.length : (detail?.vendCount ?? 0);
  const displayTotalRevenue = excludeHbrPrv ? effectiveShops.reduce((s, r) => s + r.totalRevenue, 0) : (detail?.totalRevenue ?? 0);

  if (forbidden) {
    return (
      <div className="alert alert-error">
        <span>This district is not in your division.</span>
        <Link href={base} className="btn btn-sm btn-ghost">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{name}</h1>
          <p className="text-base-content/70 mt-1">
            {detail?.division ?? '—'} Division · DEO {detail?.deoName ?? '—'}
          </p>
        </div>
        <HelpPanel pageKey="deputy_district" title="District Figures">
          <p>Every shop the DEO uploaded for this district, the same data headquarters sees. Use the type breakdown, circle/sector breakdown, filters, and sort to check the figures. All read-only.</p>
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li><strong>Looks correct</strong> — records that you checked the figures and they are right.</li>
            <li><strong>Flag an issue</strong> — records a problem; a note is required.</li>
          </ul>
          <p className="mt-1">Either action writes one line to the audit log with your name. No figure changes.</p>
        </HelpPanel>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat bg-base-100 rounded-box shadow"><div className="stat-title">Status</div><div className="stat-value text-lg"><span className={`badge ${statusBadgeClass(detail?.status ?? 'pending')}`}>{statusLabel(detail?.status ?? 'pending')}</span></div></div>
        <div className="stat bg-base-100 rounded-box shadow"><div className="stat-title">Shops</div><div className="stat-value">{displayVendCount.toLocaleString()}</div></div>
        <div className="stat bg-base-100 rounded-box shadow"><div className="stat-title">Circles/Sectors</div><div className="stat-value">{(detail?.units.length ?? 0).toLocaleString()}</div></div>
        <div className="stat bg-base-100 rounded-box shadow"><div className="stat-title">Revenue</div><div className="stat-value text-primary text-xl">{fmtInr(displayTotalRevenue)}</div></div>
      </div>

      <ShopExplorer
        shops={effectiveShops}
        units={detail?.units ?? []}
        districtName={name}
        loading={loading}
        storageKeyPrefix="deputy"
        hasHbrOrPrv={hasHbrOrPrv}
        excludeHbrPrv={excludeHbrPrv}
        onExcludeHbrPrvChange={setExcludeHbrPrv}
      />

      <div className="card bg-base-100 shadow p-4">
        <h3 className="font-semibold mb-1">Your review</h3>
        {review ? (
          <p className="text-sm text-base-content/80 mb-3">
            Last recorded{' '}
            <span className={`badge badge-sm ${review.verdict === 'flagged' ? 'badge-error' : 'badge-success'}`}>
              {review.verdict === 'flagged' ? 'Flagged' : 'Looks correct'}
            </span>{' '}
            on {fmtDate(review.at)}{review.actorName ? ` by ${review.actorName}` : ''}
            {review.note ? <span className="block text-base-content/60 mt-1">Note: {review.note}</span> : null}
          </p>
        ) : (
          <p className="text-sm text-base-content/60 mb-3">Not reviewed yet.</p>
        )}
        <div className="flex gap-2">
          <button className="btn btn-sm btn-success" onClick={() => submitReview('ok')} disabled={saving || loading}>
            {saving ? <span className="loading loading-spinner loading-xs" /> : 'Looks correct'}
          </button>
          <button className="btn btn-sm btn-outline btn-error" onClick={() => submitReview('flagged')} disabled={saving || loading}>
            Flag an issue
          </button>
        </div>
      </div>
    </div>
  );
}
