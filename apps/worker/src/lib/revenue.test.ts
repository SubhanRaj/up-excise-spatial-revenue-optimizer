import { describe, it, expect } from 'vitest';
import { computeRevenue } from './revenue.js';
import type { Phase1Row } from '../types.js';

const base: Phase1Row = {
  districtName: 'Lucknow', circleSectorName: 'Circle 1', thanaName: 'Gomti Nagar',
  adjacentThanasRaw: null, shopId: 'S001', shopName: 'Test Shop', shopType: 'MODEL_SHOP',
  hasCl5cc: false, latitudeDms: null, longitudeDms: null, latitudeDecimal: null, longitudeDecimal: null,
  licenseFeeLf: 0, basicLicenseFeeBlf: 0, mgrAmount: 0,
  compositeLfFl: 0, compositeLfBeer: 0, compositeMgrFl: 0, compositeMgrBeer: 0,
  mgqQuantity: 0, considerationFee: 0, specialBeerLf: 0, specialBeerMgr: 0,
  totalRevenue: 0, uploadedByDeo: 'deo001',
};

describe('computeRevenue', () => {
  it('MODEL_SHOP: licenseFeeLf + mgrAmount + ON_PREMISES_CONSUMPTION_FEE (₹3,00,000 fixed)', () => {
    // 100000 + 50000 + 300000 (constant) = 450000
    expect(computeRevenue({ ...base, shopType: 'MODEL_SHOP', licenseFeeLf: 100000, mgrAmount: 50000 })).toBe(450000);
  });

  it('COMPOSITE_SHOP: all four sub-components', () => {
    expect(computeRevenue({ ...base, shopType: 'COMPOSITE_SHOP', compositeLfFl: 60000, compositeLfBeer: 40000, compositeMgrFl: 30000, compositeMgrBeer: 20000 })).toBe(150000);
  });

  it('PRV: licenseFeeLf + mgrAmount', () => {
    expect(computeRevenue({ ...base, shopType: 'PRV', licenseFeeLf: 80000, mgrAmount: 40000 })).toBe(120000);
  });

  it('BHANG_SHOP: licenseFeeLf + mgqQuantity * 20', () => {
    expect(computeRevenue({ ...base, shopType: 'BHANG_SHOP', licenseFeeLf: 10000, mgqQuantity: 50 })).toBe(11000);
  });

  it('COUNTRY_LIQUOR (standard): basicLicenseFeeBlf + considerationFee', () => {
    expect(computeRevenue({ ...base, shopType: 'COUNTRY_LIQUOR', basicLicenseFeeBlf: 200000, considerationFee: 50000 })).toBe(250000);
  });

  it('COUNTRY_LIQUOR + CL5CC: adds specialBeerLf + specialBeerMgr', () => {
    expect(computeRevenue({ ...base, shopType: 'COUNTRY_LIQUOR', hasCl5cc: true, basicLicenseFeeBlf: 200000, considerationFee: 50000, specialBeerLf: 30000, specialBeerMgr: 20000 })).toBe(300000);
  });

  it('unknown shopType returns 0', () => {
    expect(computeRevenue({ ...base, shopType: 'UNKNOWN' })).toBe(0);
  });
});
