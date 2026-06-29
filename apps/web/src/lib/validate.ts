import { SHOP_TYPES, UP_BBOX } from '@excise/schema';
import type { Phase1RowInput } from './types';
import { computeRevenue } from './revenue';

export interface RowError {
  field: string;
  message: string;
}

/** Browser-side row validation — mirrors Worker validation for early feedback. */
export function validateRow(r: Phase1RowInput): RowError[] {
  const errors: RowError[] = [];
  const req = (v: string | null | undefined, f: string) => {
    if (!v?.trim()) errors.push({ field: f, message: 'Required' });
  };

  req(r.districtName, 'districtName');
  req(r.circleSectorName, 'circleSectorName');
  req(r.thanaName, 'thanaName');
  req(r.shopId, 'shopId');
  req(r.shopName, 'shopName');
  req(r.uploadedByDeo, 'uploadedByDeo');

  if (!(SHOP_TYPES as readonly string[]).includes(r.shopType)) {
    errors.push({ field: 'shopType', message: `Must be one of: ${SHOP_TYPES.join(', ')}` });
  }

  if (r.hasCl5cc && r.shopType !== 'COUNTRY_LIQUOR') {
    errors.push({ field: 'hasCl5cc', message: 'CL5CC requires COUNTRY_LIQUOR shop type' });
  }

  if (r.shopType === 'COMPOSITE_SHOP') {
    if (r.compositeLfFl + r.compositeLfBeer !== r.licenseFeeLf) {
      errors.push({ field: 'licenseFeeLf', message: 'Must equal compositeLfFl + compositeLfBeer' });
    }
    if (r.compositeMgrFl + r.compositeMgrBeer !== r.mgrAmount) {
      errors.push({ field: 'mgrAmount', message: 'Must equal compositeMgrFl + compositeMgrBeer' });
    }
  }

  if (r.latitudeDecimal != null && r.longitudeDecimal != null) {
    if (
      r.latitudeDecimal < UP_BBOX.minLat || r.latitudeDecimal > UP_BBOX.maxLat ||
      r.longitudeDecimal < UP_BBOX.minLon || r.longitudeDecimal > UP_BBOX.maxLon
    ) {
      errors.push({ field: 'coordinates', message: 'Outside UP bounding box' });
    }
  }

  const computed = computeRevenue(r);
  if (computed !== r.totalRevenue) {
    errors.push({ field: 'totalRevenue', message: `Mismatch: computed ${computed}, sent ${r.totalRevenue}` });
  }

  return errors;
}
