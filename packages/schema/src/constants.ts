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
