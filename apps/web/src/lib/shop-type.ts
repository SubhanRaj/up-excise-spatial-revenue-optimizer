// Single source for the shop-type badge color mapping — was copy-pasted as TYPE_BADGE in the
// admin district detail page, the DEO /verify final-verification screen, and now the admin
// overview's state-wide breakdown card. Distinct, non-purple palette using DaisyUI semantic
// classes; kept separate from SHOP_TYPE_LABELS (@excise/schema) since badge color is a UI
// concern, not shared server/client data.
export const SHOP_TYPE_BADGE_CLASS: Record<string, string> = {
  MODEL_SHOP: 'badge-info',
  COMPOSITE_SHOP: 'badge-accent',
  PRV: 'badge-success',
  BHANG_SHOP: 'badge-warning',
  COUNTRY_LIQUOR: 'badge-neutral',
  HBR: 'badge-secondary',
};

// Short form for tight spaces (circle/sector breakdown badges) — HBR stays verbatim, never
// truncated from SHOP_TYPE_LABELS' spelled-out prose form (CLAUDE.md: "HBR is shown verbatim
// everywhere... never spelled out").
export const SHOP_TYPE_SHORT_LABEL: Record<string, string> = {
  MODEL_SHOP: 'Model',
  COMPOSITE_SHOP: 'Composite',
  PRV: 'PRV',
  BHANG_SHOP: 'Bhang',
  COUNTRY_LIQUOR: 'Country Liquor',
  HBR: 'HBR',
};
