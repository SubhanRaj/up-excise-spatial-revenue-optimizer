import type { PriorYearShop } from '@/lib/db';

export interface FyCurrentShop {
  districtName?: string | null;
  shopId: string;
  shopName: string;
  shopType: string;
  totalRevenue: number;
}

export interface FyComparisonRow {
  district: string;
  shopId: string;
  shopName: string;
  shopType: string;
  priorRevenue: number;
  currentRevenue: number;
  unchanged: boolean;
}

export const fyRowKey = (district: string, shopId: string) => `${district}::${shopId}`;

// Joins this year's shop rows against the FY 2025-26 snapshot by district + shop_id (shop_id
// alone repeats across districts). A shop with no FY 2025-26 record just isn't comparable —
// left out rather than shown as a false "changed".
export function buildFyComparisonRows(currentRows: FyCurrentShop[], priorRows: PriorYearShop[]): FyComparisonRow[] {
  const priorByKey = new Map<string, PriorYearShop>();
  for (const r of priorRows) priorByKey.set(fyRowKey(r.districtName, r.shopId), r);

  const out: FyComparisonRow[] = [];
  for (const s of currentRows) {
    const district = s.districtName ?? '';
    const p = priorByKey.get(fyRowKey(district, s.shopId));
    if (!p) continue;
    out.push({
      district,
      shopId: s.shopId,
      shopName: s.shopName,
      shopType: s.shopType,
      priorRevenue: p.totalRevenue,
      currentRevenue: s.totalRevenue,
      unchanged: p.totalRevenue === s.totalRevenue,
    });
  }
  return out;
}

export interface FyTypeSummary {
  shopType: string;
  comparableShops: number;
  unchangedShops: number;
  priorRevenue: number;
  currentRevenue: number;
}

export function summarizeFyByType(rows: FyComparisonRow[]): FyTypeSummary[] {
  const m = new Map<string, FyTypeSummary>();
  for (const r of rows) {
    let e = m.get(r.shopType);
    if (!e) {
      e = { shopType: r.shopType, comparableShops: 0, unchangedShops: 0, priorRevenue: 0, currentRevenue: 0 };
      m.set(r.shopType, e);
    }
    e.comparableShops += 1;
    if (r.unchanged) e.unchangedShops += 1;
    e.priorRevenue += r.priorRevenue;
    e.currentRevenue += r.currentRevenue;
  }
  return Array.from(m.values());
}
