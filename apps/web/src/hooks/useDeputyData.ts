'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { deputyDistrictsCache, deputyReviewsCache, changedDistrictsSince } from '@/lib/db';
import { deputyDivisionKey } from '@/lib/deputy';

export interface DeputyDistrictRow {
  name: string; division: string | null; deoName: string | null; status: string;
  vendCount: number; totalRevenue: number; unitCount: number;
  bboxMinLat: number | null; bboxMaxLat: number | null; bboxMinLon: number | null; bboxMaxLon: number | null;
}
export interface DeputyReview { verdict: string; note: string; at: number; actorName: string | null }
export interface DivisionLock { lockedAt: number; lockedBy: string; note: string | null }
export interface DeputyReviewsResult {
  reviews: Record<string, DeputyReview>;
  divisionLock: DivisionLock | null;
  eligibleToLock: boolean;
  blockers: { notVerified: string[]; notReviewedOk: string[] };
}

const EMPTY_REVIEWS: DeputyReviewsResult = {
  reviews: {}, divisionLock: null, eligibleToLock: false,
  blockers: { notVerified: [], notReviewedOk: [] },
};

async function fetchDistricts(): Promise<DeputyDistrictRow[]> {
  const r = await fetch('/api/admin/districts'); // server-scoped to the session's division
  if (!r.ok) return [];
  const d = await r.json() as { districts?: DeputyDistrictRow[] };
  return d.districts ?? [];
}

async function fetchReviews(): Promise<DeputyReviewsResult> {
  const r = await fetch('/api/deputy/reviews');
  if (!r.ok) return EMPTY_REVIEWS;
  const d = await r.json() as Partial<DeputyReviewsResult>;
  return { ...EMPTY_REVIEWS, ...d };
}

// Local-first (matches useAdminDistricts): serve the excise-deputy IndexedDB copy first for
// an instant paint, then check GET /api/admin/changed-districts (division-scoped for a
// deputy) and refetch only if something in this division actually changed, or if the reviews
// entry has aged past its 60s TTL. Every cache read/write is keyed by the division so a
// shared browser never mixes two deputies' data.
export function useDeputyData() {
  const { session } = useSession();
  const divKey = deputyDivisionKey(session?.division);
  const [districts, setDistricts] = useState<DeputyDistrictRow[]>([]);
  const [reviewsResult, setReviewsResult] = useState<DeputyReviewsResult>(EMPTY_REVIEWS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    if (session.role !== 'deputy' && session.role !== 'superadmin') { setLoading(false); return; }
    if (!divKey) { setLoading(false); return; }

    let alive = true;
    (async () => {
      const cachedD = await deputyDistrictsCache.get(divKey) as DeputyDistrictRow[] | null;
      const cachedR = await deputyReviewsCache.get(divKey) as DeputyReviewsResult | null;
      if (cachedD) {
        if (!alive) return;
        setDistricts(cachedD);
        if (cachedR) setReviewsResult({ ...EMPTY_REVIEWS, ...cachedR });
        setLoading(false);

        const fetchedAt = await deputyDistrictsCache.getFetchedAt(divKey);
        const changed = fetchedAt != null ? await changedDistrictsSince(fetchedAt) : ['*'];
        if (!alive) return;
        if (changed.length === 0 && cachedR?.reviews) return; // still current (old-shape cache falls through to refetch)
      }

      const [d, rv] = await Promise.all([fetchDistricts(), fetchReviews()]);
      if (!alive) return;
      void deputyDistrictsCache.set(divKey, d);
      void deputyReviewsCache.set(divKey, rv);
      setDistricts(d);
      setReviewsResult(rv);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [session, divKey]);

  async function refresh() {
    setLoading(true);
    const [d, rv] = await Promise.all([fetchDistricts(), fetchReviews()]);
    if (divKey) {
      void deputyDistrictsCache.set(divKey, d);
      void deputyReviewsCache.set(divKey, rv);
    }
    setDistricts(d);
    setReviewsResult(rv);
    setLoading(false);
    return { districts: d, reviews: rv.reviews };
  }

  return {
    districts,
    reviews: reviewsResult.reviews,
    divisionLock: reviewsResult.divisionLock,
    eligibleToLock: reviewsResult.eligibleToLock,
    blockers: reviewsResult.blockers,
    loading,
    refresh,
  };
}
