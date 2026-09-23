'use client';

import { useEffect, useState } from 'react';
import { circleReorgCache, fetchCircleReorgData, type CircleReorgData } from '@/lib/db';

export interface ReorgDistrict {
  districtName: string;
  currentCircleCount: number;
  proposedCircleCount: number;
  currentDeviation: number;
  proposedDeviation: number;
  optimized: string;
  basis: string;
  shopsMoved: number;
  shopsStayFraction: number;
  noLocationCount: number;
}

// No @types/geojson dependency in this project (Leaflet itself is CDN-only, untyped — see
// each map page's own file-local `declare const L` block). A plain object is enough here: the
// value only ever flows straight into L.geoJSON(), which doesn't need a typed geometry either.
type GeoJsonGeometry = { type: string; coordinates: unknown };

export interface ReorgCircle {
  id: number;
  districtName: string;
  name: string;
  status: 'kept' | 'new' | 'abolished';
  currentRevenue: number | null;
  proposedRevenue: number | null;
  currentBoundary: GeoJsonGeometry | null;
  proposedBoundary: GeoJsonGeometry | null;
}

export interface ReorgThana {
  id: number;
  districtName: string;
  thanaName: string;
  thanaKey: string;
  revenue: number;
  shopCount: number;
  currentCircleNames: string[];
  proposedCircleName: string;
  boundary: GeoJsonGeometry | null;
  labelLat: number | null;
  labelLon: number | null;
}

export interface CircleReorgTyped { districts: ReorgDistrict[]; circles: ReorgCircle[]; thanas: ReorgThana[] }

// Cache-first, no background fetch on mount — same pattern as useAdminExportData. This data is
// static (loaded once by scripts/load-circle-reorg.ts, never at app runtime), so once cached it
// never needs invalidating; the page calls sync() itself if nothing is cached yet.
export function useCircleReorgData() {
  const [data, setData] = useState<CircleReorgTyped | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    circleReorgCache.get().then((c) => {
      if (c) setData(c as CircleReorgTyped);
      setLoading(false);
    });
  }, []);

  async function sync(): Promise<CircleReorgTyped> {
    setSyncing(true);
    try {
      const d = await fetchCircleReorgData() as CircleReorgData;
      await circleReorgCache.set(d as CircleReorgData);
      setData(d as unknown as CircleReorgTyped);
      return d as unknown as CircleReorgTyped;
    } finally {
      setSyncing(false);
    }
  }

  return { data, loading, syncing, sync };
}
