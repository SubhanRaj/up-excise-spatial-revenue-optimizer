import { SHOP_TYPES, SHOP_TYPE_LABELS } from '@excise/schema';
import type { Phase1RowInput } from './types';
import { computeRevenue } from './revenue';

export interface RowError {
  field: string;
  message: string;
}

// Human-readable name per field — used only to make "Required" errors say which field,
// instead of a bare "Required" with no context once errorReason strings are joined together
// for display on /verify.
const FIELD_LABELS: Record<string, string> = {
  districtName: 'District Name',
  circleSectorName: 'Circle/Sector Name',
  thanaName: 'Thana Name',
  shopId: 'Shop ID',
  shopName: 'Shop Name',
  uploadedByDeo: 'Uploaded By (DEO)',
};

/** Browser-side row validation — mirrors Worker validation for early feedback. */
export function validateRow(r: Phase1RowInput): RowError[] {
  const errors: RowError[] = [];
  const req = (v: string | null | undefined, f: string) => {
    if (!v?.trim()) errors.push({ field: f, message: `${FIELD_LABELS[f] ?? f} is required` });
  };

  req(r.districtName, 'districtName');
  req(r.circleSectorName, 'circleSectorName');
  req(r.thanaName, 'thanaName');
  req(r.shopId, 'shopId');
  req(r.shopName, 'shopName');
  req(r.uploadedByDeo, 'uploadedByDeo');

  if (!(SHOP_TYPES as readonly string[]).includes(r.shopType)) {
    const friendlyOptions = SHOP_TYPES.map((t) => SHOP_TYPE_LABELS[t]).join(', ');
    errors.push({
      field: 'shopType',
      message: `Shop Type "${r.shopType}" is not recognized. Please select one of the dropdown options: ${friendlyOptions}.`,
    });
  }

  if (r.hasCl5cc && r.shopType !== 'COUNTRY_LIQUOR') {
    errors.push({ field: 'hasCl5cc', message: 'The CL5CC option can only be TRUE when Shop Type is Country Liquor.' });
  }

  if (r.shopType === 'COMPOSITE_SHOP') {
    if (r.compositeLfFl + r.compositeLfBeer !== r.licenseFeeLf) {
      errors.push({ field: 'licenseFeeLf', message: 'License Fee (LF) must equal Composite LF – Foreign Liquor + Composite LF – Beer' });
    }
    if (r.compositeMgrFl + r.compositeMgrBeer !== r.mgrAmount) {
      errors.push({ field: 'mgrAmount', message: 'Min. Guaranteed Revenue (MGR) must equal Composite MGR – Foreign Liquor + Composite MGR – Beer' });
    }
  }

  // Out-of-bounds coordinates are a non-blocking warning, not a validation error — per
  // CLAUDE.md's Coordinate Handling rule, they are "flagged with a warning... never silently
  // dropped." `normalizeCoordinates()` (coordinates.ts) already computes `coordinateWarning`
  // for the ⚠/✓ icon shown on /verify; this used to *also* push a blocking RowError here,
  // which set row.status='error' and silently excluded the row from upload entirely — the
  // opposite of what the UI copy and CLAUDE.md both promise. Do not re-add a bbox check here.

  const computed = computeRevenue(r);
  if (computed !== r.totalRevenue) {
    errors.push({
      field: 'totalRevenue',
      message: `Revenue doesn't add up: the fee columns for this row calculate to ₹${computed.toLocaleString('en-IN')}, but the Revenue column has ₹${r.totalRevenue.toLocaleString('en-IN')}. Check the financial fields for this row.`,
    });
  }

  return errors;
}
