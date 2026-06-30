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
] as const;

export type ShopType = (typeof SHOP_TYPES)[number];

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
