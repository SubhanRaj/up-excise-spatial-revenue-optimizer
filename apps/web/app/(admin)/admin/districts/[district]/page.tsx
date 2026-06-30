'use client';

import { use, useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';

const WORKER = process.env.NEXT_PUBLIC_WORKER_URL ?? '';

interface ShopRow { id: number; shopId: string; shopName: string; thanaName: string; shopType: string; totalRevenue: number; status?: string }
interface DistrictDetail {
  name: string; division?: string; deoName?: string; deoEmail?: string; status: string;
  vendCount: number; totalRevenue: number; units: { name: string; type: string }[];
}

export default function DistrictDetailPage({ params }: { params: Promise<{ district: string }> }) {
  const { getToken } = useAuth();
  const { district } = use(params);
  const name = decodeURIComponent(district);
  const [detail, setDetail] = useState<DistrictDetail | null>(null);
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  async function load(p: number) {
    setLoading(true);
    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}` };

    const [d, s] = await Promise.all([
      page === 1 ? fetch(`${WORKER}/api/admin/districts/${encodeURIComponent(name)}`, { headers }).then((r) => r.json()) : Promise.resolve(detail),
      fetch(`${WORKER}/api/admin/districts/${encodeURIComponent(name)}/shops?page=${p}`, { headers }).then((r) => r.json()),
    ]);
    if (page === 1) setDetail(d as DistrictDetail);
    const sp = s as { rows: ShopRow[]; total: number };
    setShops(sp.rows);
    setTotal(sp.total);
    setLoading(false);
  }

  useEffect(() => { void load(page); }, [page, name]);

  const totalPages = Math.ceil(total / 100);

  async function exportCsv() {
    const token = await getToken();
    const res = await fetch(`${WORKER}/api/admin/districts/${encodeURIComponent(name)}/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${name}-shops.csv`; a.click();
    URL.revokeObjectURL(url);
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
          {/* tabler:download */}
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

      {loading ? (
        <div className="flex justify-center p-12"><span className="loading loading-spinner loading-lg" /></div>
      ) : (
        <div className="card bg-base-100 shadow p-4">
          <div className="overflow-x-auto">
            <table className="table table-sm w-full" role="grid" aria-label={`${name} shop rows`}>
              <thead><tr><th>Shop ID</th><th>Shop Name</th><th>Thana</th><th>Type</th><th>Revenue</th></tr></thead>
              <tbody>
                {shops.map((s) => (
                  <tr key={s.id} role="row">
                    <td role="gridcell" className="font-mono text-xs">{s.shopId}</td>
                    <td role="gridcell">{s.shopName}</td>
                    <td role="gridcell" className="text-xs">{s.thanaName}</td>
                    <td role="gridcell"><span className="badge badge-xs badge-outline">{s.shopType}</span></td>
                    <td role="gridcell" className="font-mono text-xs">₹{s.totalRevenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-3">
              <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>«</button>
              <span className="text-sm">Page {page} of {totalPages}</span>
              <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>»</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
