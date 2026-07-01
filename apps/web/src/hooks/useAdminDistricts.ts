'use client';

import { useEffect, useState } from 'react';
import { adminDistrictsCache } from '@/lib/db';

export interface AdminDistrictRow {
  name: string; division: string | null; deoName: string | null; deoEmail: string | null;
  deoId: string | null; expectedVendCount: number | null; status: string;
  vendCount: number; totalRevenue: number;
  centerLat: number | null; centerLon: number | null;
  bboxMinLat: number | null; bboxMaxLat: number | null;
  bboxMinLon: number | null; bboxMaxLon: number | null;
  submittedAt: number | null;
}

interface ApiResponse {
  districts: AdminDistrictRow[];
  stateTotals: { totalVendCount: number; totalRevenue: number };
}

// Module-level in-flight deduplication — only one fetch at a time per tab.
let _inflight: Promise<ApiResponse> | null = null;

async function fetchDistricts(): Promise<ApiResponse> {
  if (_inflight) return _inflight;
  _inflight = fetch('/api/admin/districts')
    .then((r) => {
      if (!r.ok) return { districts: [], stateTotals: { totalVendCount: 0, totalRevenue: 0 } } as ApiResponse;
      return r.json() as Promise<ApiResponse>;
    })
    .then((data) => {
      if (data.districts?.length) adminDistrictsCache.set(data);
      return data;
    })
    .finally(() => { _inflight = null; });
  return _inflight;
}

export function useAdminDistricts() {
  const [districts, setDistricts] = useState<AdminDistrictRow[]>([]);
  const [stateTotals, setStateTotals] = useState({ totalVendCount: 0, totalRevenue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminDistrictsCache.get().then((cached) => {
      if (cached) {
        const data = cached as ApiResponse;
        setDistricts(data.districts ?? []);
        setStateTotals(data.stateTotals ?? { totalVendCount: 0, totalRevenue: 0 });
        setLoading(false);
        // Revalidate in background — if TTL was already OK the cache.get() returns it, so
        // we only reach here if it was fresh; no background fetch needed.
      } else {
        fetchDistricts().then((data) => {
          setDistricts(data.districts);
          setStateTotals(data.stateTotals);
          setLoading(false);
        });
      }
    });
  }, []);

  function refresh() {
    setLoading(true);
    adminDistrictsCache.invalidate();
    fetchDistricts().then((data) => {
      setDistricts(data.districts);
      setStateTotals(data.stateTotals);
      setLoading(false);
    });
  }

  return { districts, stateTotals, loading, refresh };
}
