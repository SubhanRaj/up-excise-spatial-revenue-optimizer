'use client';

import { useMemo } from 'react';
import { compareUnitName } from '@/lib/unit-sort';
import { normalizeThanaName, findThanaNameVariants } from '@/lib/thana-name';

export interface AggregateShop {
  shopType: string;
  hasCl5cc: boolean;
  totalRevenue: number;
  circleSectorName: string;
  thanaName: string;
}

export interface CircleStat {
  name: string;
  type: string;
  thanas: Set<string>;
  count: number;
  revenue: number;
  byType: Record<string, number>;
}

/** Shared aggregation over a district's shop rows — type counts, CL5CC count, distinct
 * circle/sector names, and per-circle/sector stats (thana count, shop count, revenue, type
 * breakdown). Used by both the admin district detail page and the DEO final-verification
 * screen (ShopExplorer) so their stats can never drift apart from each other. Seeds from
 * `units` first so a registered-but-empty circle/sector still shows a real 0-shop row. */
export function useShopAggregates<T extends AggregateShop>(
  shops: T[],
  units: { name: string; type: string }[],
) {
  const typeCounts = useMemo(() => {
    const counts: Record<string, { count: number; revenue: number }> = {};
    for (const s of shops) {
      if (!counts[s.shopType]) counts[s.shopType] = { count: 0, revenue: 0 };
      const entry = counts[s.shopType]!;
      entry.count++;
      entry.revenue += s.totalRevenue;
    }
    return counts;
  }, [shops]);

  const cl5ccCount = useMemo(() => shops.filter((s) => s.hasCl5cc).length, [shops]);

  const circles = useMemo(
    () => Array.from(new Set(shops.map((s) => s.circleSectorName).filter(Boolean))).sort(compareUnitName),
    [shops],
  );

  const circleStats = useMemo(() => {
    const map = new Map<string, CircleStat>();
    for (const u of units) {
      map.set(u.name, { name: u.name, type: u.type, thanas: new Set(), count: 0, revenue: 0, byType: {} });
    }
    for (const s of shops) {
      let entry = map.get(s.circleSectorName);
      if (!entry) {
        entry = { name: s.circleSectorName, type: 'unit', thanas: new Set(), count: 0, revenue: 0, byType: {} };
        map.set(s.circleSectorName, entry);
      }
      entry.thanas.add(normalizeThanaName(s.thanaName));
      entry.count += 1;
      entry.revenue += s.totalRevenue;
      entry.byType[s.shopType] = (entry.byType[s.shopType] ?? 0) + 1;
    }
    return Array.from(map.values()).sort((a, b) => compareUnitName(a.name, b.name));
  }, [shops, units]);

  // Same-district Thana names that look like typos of each other (e.g. "Kotwali" /
  // "Kotwaali") — surfaced for human review, not auto-merged (see findThanaNameVariants).
  // This is why a district's Circle/Sector Breakdown "Thanas" column can read 5-6 when the
  // real count is 2: exact-string counting (even after the case/whitespace normalization
  // above) still treats a genuine spelling variant as a distinct Thana.
  const thanaVariants = useMemo(
    () => findThanaNameVariants(shops.map((s) => s.thanaName).filter(Boolean)),
    [shops],
  );

  return { typeCounts, cl5ccCount, circles, circleStats, thanaVariants };
}
