'use client';

import { use, useEffect, useState } from 'react';

const ON_PREMISES_CONSUMPTION_FEE = 300_000;
const BHANG_MGQ_MULTIPLIER = 20;

interface ShopRow {
  id: number;
  shopId: string;
  shopName: string;
  circleSectorName: string;
  thanaName: string;
  adjacentThanasRaw: string | null;
  shopType: string;
  hasCl5cc: boolean;
  latitudeDecimal: number | null;
  longitudeDecimal: number | null;
  licenseFeeLf: number;
  basicLicenseFeeBlf: number;
  mgrAmount: number;
  compositeLfFl: number;
  compositeLfBeer: number;
  compositeMgrFl: number;
  compositeMgrBeer: number;
  mgqQuantity: number;
  considerationFee: number;
  specialBeerLf: number;
  specialBeerMgr: number;
  totalRevenue: number;
  uploadedByDeo: string;
}

interface DistrictDetail {
  name: string; division?: string; deoName?: string; deoEmail?: string; status: string;
  vendCount: number; totalRevenue: number; units: { name: string; type: string }[];
}

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function RevenueBreakdown({ s }: { s: ShopRow }) {
  const lines: [string, number][] = [];
  if (s.shopType === 'MODEL_SHOP') {
    lines.push(['License Fee (LF)', s.licenseFeeLf], ['MGR Amount', s.mgrAmount], ['On-Premises Consumption Fee', ON_PREMISES_CONSUMPTION_FEE]);
  } else if (s.shopType === 'COMPOSITE_SHOP') {
    lines.push(['LF FL', s.compositeLfFl], ['LF Beer', s.compositeLfBeer], ['MGR FL', s.compositeMgrFl], ['MGR Beer', s.compositeMgrBeer]);
  } else if (s.shopType === 'PRV') {
    lines.push(['License Fee (LF)', s.licenseFeeLf], ['MGR Amount', s.mgrAmount]);
  } else if (s.shopType === 'BHANG_SHOP') {
    lines.push(['License Fee (LF)', s.licenseFeeLf], [`MGQ (${s.mgqQuantity} × ₹${BHANG_MGQ_MULTIPLIER})`, s.mgqQuantity * BHANG_MGQ_MULTIPLIER]);
  } else if (s.shopType === 'COUNTRY_LIQUOR') {
    lines.push(['Basic License Fee (BLF)', s.basicLicenseFeeBlf], ['Consideration Fee', s.considerationFee]);
    if (s.hasCl5cc) lines.push(['Special Beer LF', s.specialBeerLf], ['Special Beer MGR', s.specialBeerMgr]);
  }

  return (
    <details className="cursor-pointer">
      <summary className="font-mono text-xs list-none select-none hover:text-primary">
        {fmt(s.totalRevenue)}
      </summary>
      <div className="mt-1 bg-base-200 rounded p-2 text-xs space-y-0.5 min-w-[200px]">
        {lines.map(([label, val]) => (
          <div key={label} className="flex justify-between gap-4">
            <span className="text-base-content/60">{label}</span>
            <span className="font-mono">{fmt(val)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-base-300 pt-0.5 font-semibold">
          <span>Total</span>
          <span className="font-mono text-primary">{fmt(s.totalRevenue)}</span>
        </div>
      </div>
    </details>
  );
}

type PageSizeVal = 10 | 25 | 50 | 100 | 'all';
const PAGE_SIZES: PageSizeVal[] = [10, 25, 50, 100, 'all'];

export default function DistrictDetailPage({ params }: { params: Promise<{ district: string }> }) {
  const { district } = use(params);
  const name = decodeURIComponent(district);
  const [detail, setDetail] = useState<DistrictDetail | null>(null);
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeVal>(100);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  async function load(p: number, ps: PageSizeVal) {
    setLoading(true);
    const psParam = ps === 'all' ? 'all' : ps;
    const [d, s] = await Promise.all([
      detail === null ? fetch(`/api/admin/districts/${encodeURIComponent(name)}`).then((r) => r.json()) : Promise.resolve(detail),
      fetch(`/api/admin/districts/${encodeURIComponent(name)}/shops?page=${p}&pageSize=${psParam}`).then((r) => r.json()),
    ]);
    if (detail === null) setDetail(d as DistrictDetail);
    const sp = s as { rows: ShopRow[]; total: number };
    setShops(sp.rows);
    setTotal(sp.total);
    setLoading(false);
  }

  useEffect(() => { void load(page, pageSize); }, [page, pageSize, name]);

  const effectivePageSize = pageSize === 'all' ? total || 100 : pageSize;
  const totalPages = pageSize === 'all' ? 1 : Math.ceil(total / pageSize);
  const skeletonCount = Math.min(effectivePageSize, 25);

  async function exportCsv() {
    const res = await fetch(`/api/admin/districts/${encodeURIComponent(name)}/export`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${name}-shops.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function handlePageSize(val: PageSizeVal) {
    setPage(1);
    setPageSize(val);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center flex-wrap">
        <a href="/admin" className="btn btn-ghost btn-sm">← Back</a>
        <h2 className="text-xl font-bold">{name}</h2>
        {detail && (
          <span className={`badge ${detail.status === 'submitted' ? 'badge-success' : detail.status === 'in_progress' ? 'badge-warning' : 'badge-ghost'}`}>
            {detail.status}
          </span>
        )}
        <button className="btn btn-sm btn-outline ml-auto" onClick={exportCsv}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 11 12 16 17 11"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
          Export CSV
        </button>
      </div>

      {detail && (
        <div className="grid md:grid-cols-4 gap-3">
          <div className="stat bg-base-100 rounded-box shadow p-3"><div className="stat-title text-xs">DEO</div><div className="stat-value text-base">{detail.deoName ?? '—'}</div></div>
          <div className="stat bg-base-100 rounded-box shadow p-3"><div className="stat-title text-xs">Division</div><div className="stat-value text-base">{detail.division ?? '—'}</div></div>
          <div className="stat bg-base-100 rounded-box shadow p-3"><div className="stat-title text-xs">Vends</div><div className="stat-value text-base">{detail.vendCount.toLocaleString()}</div></div>
          <div className="stat bg-base-100 rounded-box shadow p-3"><div className="stat-title text-xs">Revenue</div><div className="stat-value text-base text-primary">₹{(detail.totalRevenue / 10_000_000).toFixed(2)} Cr</div></div>
        </div>
      )}

      <div className="card bg-base-100 shadow p-4 space-y-3">
        <div className="flex items-center gap-3 justify-between flex-wrap">
          <span className="text-sm text-base-content/60">
            {loading ? 'Loading…' : `${total.toLocaleString()} shops`}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-base-content/50">Rows per page:</span>
            <div className="join">
              {PAGE_SIZES.map((ps) => (
                <button
                  key={ps}
                  className={`join-item btn btn-xs ${pageSize === ps ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => handlePageSize(ps)}
                >
                  {ps === 'all' ? 'All' : ps}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table table-xs w-full" role="grid" aria-label={`${name} shop rows`}>
            <thead>
              <tr>
                <th>Shop ID</th>
                <th>Shop Name</th>
                <th>Circle / Sector</th>
                <th>Thana</th>
                <th>Adjacent Thanas</th>
                <th>Type</th>
                <th>CL5CC</th>
                <th>Coordinates</th>
                <th>Revenue ↕ (click for breakdown)</th>
                <th>Uploaded By</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: skeletonCount }, (_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 10 }, (_, j) => (
                        <td key={j}><div className="h-3 bg-base-300 rounded w-full" /></td>
                      ))}
                    </tr>
                  ))
                : shops.map((s) => (
                    <tr key={s.id} role="row" className="hover">
                      <td role="gridcell" className="font-mono text-xs">{s.shopId}</td>
                      <td role="gridcell" className="max-w-[160px] truncate" title={s.shopName}>{s.shopName}</td>
                      <td role="gridcell" className="text-xs max-w-[120px] truncate" title={s.circleSectorName}>{s.circleSectorName}</td>
                      <td role="gridcell" className="text-xs">{s.thanaName}</td>
                      <td role="gridcell" className="text-xs max-w-[140px] truncate" title={s.adjacentThanasRaw ?? ''}>{s.adjacentThanasRaw ?? '—'}</td>
                      <td role="gridcell"><span className="badge badge-xs badge-outline whitespace-nowrap">{s.shopType.replace('_', ' ')}</span></td>
                      <td role="gridcell" className="text-center">
                        {s.hasCl5cc ? <span className="badge badge-xs badge-accent">CL5CC</span> : '—'}
                      </td>
                      <td role="gridcell" className="font-mono text-xs whitespace-nowrap">
                        {s.latitudeDecimal != null && s.longitudeDecimal != null
                          ? `${s.latitudeDecimal.toFixed(4)}, ${s.longitudeDecimal.toFixed(4)}`
                          : '—'}
                      </td>
                      <td role="gridcell">
                        <RevenueBreakdown s={s} />
                      </td>
                      <td role="gridcell" className="text-xs text-base-content/50">{s.uploadedByDeo}</td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        {!loading && totalPages > 1 && (
          <div className="flex justify-between items-center">
            <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>«</button>
            <span className="text-sm">Page {page} of {totalPages} · {total.toLocaleString()} total</span>
            <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>»</button>
          </div>
        )}
      </div>
    </div>
  );
}
