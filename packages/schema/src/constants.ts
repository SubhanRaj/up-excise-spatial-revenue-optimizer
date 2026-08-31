/** ₹20 per MGQ unit — annual INR contribution for BHANG_SHOP revenue */
export const BHANG_MGQ_MULTIPLIER = 20 as const;

/** Fixed annual On Premises Consumption Fee for MODEL_SHOP — ₹3,00,000 (not a variable field) */
export const ON_PREMISES_CONSUMPTION_FEE = 300000 as const;

export const SHOP_TYPES = [
  'MODEL_SHOP',
  'COMPOSITE_SHOP',
  'BHANG_SHOP',
  'PRV',
  'COUNTRY_LIQUOR',
  'HBR',
] as const;

export type ShopType = (typeof SHOP_TYPES)[number];

/** Human-friendly display label per shop type — the Excel dropdown's exact option text and
 * every DEO/admin-facing label. Single source shared by the Excel template (dropdown +
 * parse-time reverse mapping) and validation error messages, so a rejected shop_type value
 * is always explained using the same words the DEO actually sees in the dropdown. */
export const SHOP_TYPE_LABELS: Record<ShopType, string> = {
  MODEL_SHOP: 'Model Shop',
  COMPOSITE_SHOP: 'Composite Shop (FL + Beer)',
  PRV: 'PRV (Premium Retail Vend)',
  BHANG_SHOP: 'Bhang Shop',
  COUNTRY_LIQUOR: 'Country Liquor',
  HBR: 'HBR',
};

/** Which shop types (and, where noted, hasCl5cc state) each money field is active for —
 * matches the Revenue Formulas table in CLAUDE.md/roadmap.md §4.4 exactly. A value entered
 * in a field outside its gate is never counted by `computeRevenue()`, so it silently doesn't
 * reach Total Revenue — this is the shared source `validateRow()` and `RevenueCell` both use
 * to catch that ("DEO put the fee in the wrong column") instead of only checking the row's
 * total against its own (also wrong) sum. COMPOSITE_SHOP is a deliberate exception for
 * `licenseFeeLf`/`mgrAmount`: those two are auto-computed as the sub-component sums for
 * cross-type SQL aggregation (see CLAUDE.md's Revenue Formulas section), so a nonzero value
 * there is expected, not a mistake — callers must skip this gate for that combination. */
export interface MoneyFieldGate { key: string; allowedTypes: ShopType[]; requireCl5cc?: boolean }

export const MONEY_FIELD_GATES: MoneyFieldGate[] = [
  { key: 'licenseFeeLf', allowedTypes: ['MODEL_SHOP', 'PRV', 'BHANG_SHOP', 'HBR'] },
  { key: 'basicLicenseFeeBlf', allowedTypes: ['COUNTRY_LIQUOR'] },
  { key: 'mgrAmount', allowedTypes: ['MODEL_SHOP', 'PRV'] },
  { key: 'compositeLfFl', allowedTypes: ['COMPOSITE_SHOP'] },
  { key: 'compositeLfBeer', allowedTypes: ['COMPOSITE_SHOP'] },
  { key: 'compositeMgrFl', allowedTypes: ['COMPOSITE_SHOP'] },
  { key: 'compositeMgrBeer', allowedTypes: ['COMPOSITE_SHOP'] },
  { key: 'mgqQuantity', allowedTypes: ['BHANG_SHOP'] },
  { key: 'considerationFee', allowedTypes: ['COUNTRY_LIQUOR', 'HBR'] },
  { key: 'specialBeerLf', allowedTypes: ['COUNTRY_LIQUOR'], requireCl5cc: true },
  { key: 'specialBeerMgr', allowedTypes: ['COUNTRY_LIQUOR'], requireCl5cc: true },
];

/** Fields COMPOSITE_SHOP legitimately populates as computed totals — exempt from MONEY_FIELD_GATES. */
export const COMPOSITE_COMPUTED_FIELDS = ['licenseFeeLf', 'mgrAmount'] as const;

export const MONEY_FIELD_LABELS: Record<string, string> = {
  licenseFeeLf: 'License Fee (LF)',
  basicLicenseFeeBlf: 'Basic License Fee (BLF)',
  mgrAmount: 'Min. Guaranteed Revenue (MGR)',
  compositeLfFl: 'Composite LF – Foreign Liquor',
  compositeLfBeer: 'Composite LF – Beer',
  compositeMgrFl: 'Composite MGR – Foreign Liquor',
  compositeMgrBeer: 'Composite MGR – Beer',
  mgqQuantity: 'MGQ Quantity',
  considerationFee: 'Consideration Fee',
  specialBeerLf: 'Special Beer LF',
  specialBeerMgr: 'Special Beer MGR',
};

/** True if `value` in `field` won't count toward this row's Total Revenue — either because
 * the field doesn't apply to `shopType` at all, or (for the two CL5CC-only fields) applies
 * only when `hasCl5cc` is also true. Skips COMPOSITE_SHOP's two computed-total fields. */
export function isStrayMoneyValue(field: string, value: number, shopType: string, hasCl5cc: boolean): boolean {
  if (!value) return false;
  if (shopType === 'COMPOSITE_SHOP' && (COMPOSITE_COMPUTED_FIELDS as readonly string[]).includes(field)) return false;
  const gate = MONEY_FIELD_GATES.find((g) => g.key === field);
  if (!gate) return false;
  const allowed = (gate.allowedTypes as readonly string[]).includes(shopType) && (!gate.requireCl5cc || hasCl5cc);
  return !allowed;
}

export const UP_BBOX = {
  minLat: 23.8,
  maxLat: 30.4,
  minLon: 77.1,
  maxLon: 84.6,
} as const;

/** UP's 18 administrative divisions (mandals). Verified against Wikipedia's
 * "Administrative divisions of Uttar Pradesh". Bare names — no "Division" suffix.
 * Single source of truth for the District Master edit drawer dropdown and
 * scripts/seed-districts.ts. */
export const UP_DIVISIONS = [
  'Agra', 'Aligarh', 'Ayodhya', 'Azamgarh', 'Bareilly', 'Basti', 'Chitrakoot',
  'Devipatan', 'Gorakhpur', 'Jhansi', 'Kanpur', 'Lucknow', 'Meerut', 'Moradabad',
  'Prayagraj', 'Saharanpur', 'Varanasi', 'Vindhyachal',
] as const;
