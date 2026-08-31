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
  adjacentThanasRaw: 'Adjacent Thanas',
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
  // Mandatory as of 2026-08-04: presence only (at least one Thana name entered), not
  // cross-district correctness — there is still no state-wide Thana master list to validate
  // names against, so the red-pill mismatch check on /verify remains a non-blocking heuristic.
  req(r.adjacentThanasRaw, 'adjacentThanasRaw');

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

  // A money value entered in a field this shop type's formula doesn't use never reaches
  // Total Revenue — computeRevenue() below only sums the fields the type actually dispatches
  // on, so a row with money stuck in the wrong column still passes the total-matches check
  // that follows (the wrong total is self-consistent with the wrong fields), quietly
  // undercounting that shop's revenue. This used to also push a blocking RowError here (M-70),
  // same mistake the coordinate-bbox check below already made and was fixed for: a district
  // where this stray-money pattern is systemic across most/all rows (a real, common habit —
  // the prod audit that motivated this check found it in 39 of 75 districts) had every one of
  // those rows silently dropped from submission, not just flagged, reproducing as "0 of 60
  // rows uploaded" for any DEO whose district has this pattern. `isStrayMoneyValue()` still
  // runs independently in `RevenueCell` (shared by the admin district page and the DEO
  // final-verification screen) for the ⚠ badge and breakdown, which is unaffected by this —
  // that check recomputes from the row's own fields, it never depended on this list of errors.
  // Do not re-add a blocking check here.

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
