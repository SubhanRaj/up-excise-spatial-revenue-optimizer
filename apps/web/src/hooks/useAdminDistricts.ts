'use client';

import { useEffect, useState } from 'react';
import { adminDistrictsCache, changedDistrictsSince } from '@/lib/db';

export interface AdminDistrictRow {
  name: string; division: string | null; deoName: string | null; deoEmail: string | null;
  deoId: string | null; expectedVendCount: number | null; status: string;
  vendCount: number; totalRevenue: number; unitCount: number;
  centerLat: number | null; centerLon: number | null;
  bboxMinLat: number | null; bboxMaxLat: number | null;
  bboxMinLon: number | null; bboxMaxLon: number | null;
  submittedAt: string | null; // ISO string — Drizzle's `mode: 'timestamp'` columns serialize to this over JSON, not raw epoch seconds
  fyDataClearedAt: string | null; // ISO string; non-null once an admin has run the one-time FY 2026-27 cleanup for this district (M-101)
  deputyReview: { verdict: string; note: string; at: number; actorName: string | null } | null; // latest Deputy sign-off (M-103)
  divisionLocked: boolean; // this district's division has been locked by the Deputy (M-103)
}

export interface DivisionLockInfo { division: string; lockedAt: number; lockedBy: string; note: string | null }

interface ApiResponse {
  districts: AdminDistrictRow[];
  stateTotals: { totalVendCount: number; totalRevenue: number; divisionsTotal: number; divisionsLocked: number };
  divisionLocks: DivisionLockInfo[];
}

const EMPTY_TOTALS = { totalVendCount: 0, totalRevenue: 0, divisionsTotal: 0, divisionsLocked: 0 };

// Module-level in-flight deduplication — only one fetch at a time per tab.
let _inflight: Promise<ApiResponse> | null = null;

async function fetchDistricts(): Promise<ApiResponse> {
  if (_inflight) return _inflight;
  _inflight = fetch('/api/admin/districts')
    .then((r) => {
      if (!r.ok) return { districts: [], stateTotals: EMPTY_TOTALS, divisionLocks: [] } as ApiResponse;
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
  const [stateTotals, setStateTotals] = useState(EMPTY_TOTALS);
  const [divisionLocks, setDivisionLocks] = useState<DivisionLockInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminDistrictsCache.get().then((cached) => {
      if (cached) {
        const data = cached as ApiResponse;
        setDistricts(data.districts ?? []);
        setStateTotals(data.stateTotals ?? EMPTY_TOTALS);
        setDivisionLocks(data.divisionLocks ?? []);
        setLoading(false);
        // Cache was within its 5-min TTL, so it was served as-is — but "within TTL" isn't the
        // same as "still current": a district submitted/verified/unlocked seconds after this
        // entry was written stays invisible for however much of the TTL window remains. Ask
        // cheaply whether anything actually changed since this entry was written and, if so,
        // upgrade to a real refetch — same check the district detail page already does (M-74),
        // now applied to the aggregate every page on this hook shares (overview map,
        // districts list, divisions, division detail).
        adminDistrictsCache.getFetchedAt().then((fetchedAt) => {
          if (fetchedAt == null) return;
          changedDistrictsSince(fetchedAt).then((changed) => {
            if (changed.length === 0) return;
            adminDistrictsCache.invalidate();
            fetchDistricts().then((fresh) => {
              setDistricts(fresh.districts);
              setStateTotals(fresh.stateTotals);
              setDivisionLocks(fresh.divisionLocks ?? []);
            });
          });
        });
      } else {
        fetchDistricts().then((data) => {
          setDistricts(data.districts);
          setStateTotals(data.stateTotals);
          setDivisionLocks(data.divisionLocks ?? []);
          setLoading(false);
        });
      }
    });
  }, []);

  // Returns the freshly-fetched rows directly — a caller that needs guaranteed-current data
  // right now (e.g. a PDF export for a meeting) can await this instead of racing the next
  // render for the state update above.
  async function refresh(): Promise<AdminDistrictRow[]> {
    setLoading(true);
    adminDistrictsCache.invalidate();
    const data = await fetchDistricts();
    setDistricts(data.districts);
    setStateTotals(data.stateTotals);
    setDivisionLocks(data.divisionLocks ?? []);
    setLoading(false);
    return data.districts;
  }

  return { districts, stateTotals, divisionLocks, loading, refresh };
}
