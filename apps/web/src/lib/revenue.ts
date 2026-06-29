import { BHANG_MGQ_MULTIPLIER, ON_PREMISES_CONSUMPTION_FEE } from '@excise/schema';
import type { Phase1RowInput } from './types';

/** Browser-side revenue computation — Worker recomputes independently for dual-verification. */
export function computeRevenue(r: Phase1RowInput): number {
  switch (r.shopType) {
    case 'MODEL_SHOP':
      return r.licenseFeeLf + r.mgrAmount + ON_PREMISES_CONSUMPTION_FEE;
    case 'COMPOSITE_SHOP':
      return r.compositeLfFl + r.compositeLfBeer + r.compositeMgrFl + r.compositeMgrBeer;
    case 'PRV':
      return r.licenseFeeLf + r.mgrAmount;
    case 'BHANG_SHOP':
      return r.licenseFeeLf + r.mgqQuantity * BHANG_MGQ_MULTIPLIER;
    case 'COUNTRY_LIQUOR':
      if (r.hasCl5cc) {
        return r.basicLicenseFeeBlf + r.considerationFee + r.specialBeerLf + r.specialBeerMgr;
      }
      return r.basicLicenseFeeBlf + r.considerationFee;
    default:
      return 0;
  }
}
