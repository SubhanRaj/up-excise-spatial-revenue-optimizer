import { SHOP_TYPES, UP_BBOX } from '@excise/schema';
import type { Phase1Row, RejectedRow } from '../types.js';
import { computeRevenue } from './revenue.js';

/** Validates a single Phase1Row per the checklist in roadmap Section 3.4. */
export function validateRow(r: Phase1Row, i: number): RejectedRow | null {
  const req = (v: unknown, name: string) => {
    if (typeof v !== 'string' || v.trim() === '') return `${name} is required`;
    return null;
  };

  const strCheck =
    req(r.districtName, 'districtName') ??
    req(r.circleSectorName, 'circleSectorName') ??
    req(r.thanaName, 'thanaName') ??
    req(r.shopId, 'shopId') ??
    req(r.shopName, 'shopName') ??
    req(r.uploadedByDeo, 'uploadedByDeo');

  if (strCheck) return { rowIndex: i, reason: strCheck };

  if (!(SHOP_TYPES as readonly string[]).includes(r.shopType)) {
    return { rowIndex: i, reason: `Invalid shopType: ${r.shopType}` };
  }

  if (r.hasCl5cc && r.shopType !== 'COUNTRY_LIQUOR') {
    return { rowIndex: i, reason: 'hasCl5cc requires shopType COUNTRY_LIQUOR' };
  }

  if (r.shopType === 'COMPOSITE_SHOP') {
    if (r.compositeLfFl + r.compositeLfBeer !== r.licenseFeeLf) {
      return { rowIndex: i, reason: 'COMPOSITE_SHOP: compositeLfFl + compositeLfBeer must equal licenseFeeLf' };
    }
    if (r.compositeMgrFl + r.compositeMgrBeer !== r.mgrAmount) {
      return { rowIndex: i, reason: 'COMPOSITE_SHOP: compositeMgrFl + compositeMgrBeer must equal mgrAmount' };
    }
  }

  if (r.latitudeDecimal != null && r.longitudeDecimal != null) {
    if (
      r.latitudeDecimal < UP_BBOX.minLat || r.latitudeDecimal > UP_BBOX.maxLat ||
      r.longitudeDecimal < UP_BBOX.minLon || r.longitudeDecimal > UP_BBOX.maxLon
    ) {
      return { rowIndex: i, reason: 'Coordinates outside UP bounding box' };
    }
  }

  const expected = computeRevenue(r);
  if (expected !== r.totalRevenue) {
    return {
      rowIndex: i,
      reason: `totalRevenue mismatch: sent ${r.totalRevenue}, expected ${expected}`,
    };
  }

  return null;
}
