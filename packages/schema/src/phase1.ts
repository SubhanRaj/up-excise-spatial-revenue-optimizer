import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const phase1RawCollection = sqliteTable('phase1_raw_collection', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  districtName: text('district_name').notNull(),
  circleSectorName: text('circle_sector_name').notNull(),
  thanaName: text('thana_name').notNull(),
  // ponytail: comma-separated adjacent thanas; pill-parsed in frontend
  adjacentThanasRaw: text('adjacent_thanas_raw'),

  shopId: text('shop_id').notNull(),
  shopName: text('shop_name').notNull(),
  // MODEL_SHOP | COMPOSITE_SHOP | BHANG_SHOP | PRV | COUNTRY_LIQUOR | HBR
  shopType: text('shop_type').notNull(),
  hasCl5cc: integer('has_cl5cc', { mode: 'boolean' }).default(false).notNull(),

  latitudeDms: text('latitude_dms'),
  longitudeDms: text('longitude_dms'),
  latitudeDecimal: real('latitude_decimal'),
  longitudeDecimal: real('longitude_decimal'),

  // All annual INR integers — no paise, no floats
  licenseFeeLf: integer('license_fee_lf').default(0),
  // on_premises_consumption_fee is a fixed constant (₹3,00,000) — not stored per-row, baked into revenue formula
  basicLicenseFeeBlf: integer('basic_license_fee_blf').default(0),
  mgrAmount: integer('mgr_amount').default(0),
  compositeLfFl: integer('composite_lf_fl').default(0),
  compositeLfBeer: integer('composite_lf_beer').default(0),
  compositeMgrFl: integer('composite_mgr_fl').default(0),
  compositeMgrBeer: integer('composite_mgr_beer').default(0),
  // ponytail: mgqQuantity is UNIT COUNT, not INR. multiply by BHANG_MGQ_MULTIPLIER for revenue
  mgqQuantity: integer('mgq_quantity').default(0),
  considerationFee: integer('consideration_fee').default(0),
  specialBeerLf: integer('special_beer_lf').default(0),
  specialBeerMgr: integer('special_beer_mgr').default(0),

  // Browser-computed and Worker-verified; mismatches cause row rejection
  totalRevenue: integer('total_revenue').notNull().default(0),

  uploadedByDeo: text('uploaded_by_deo').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  districtIdx: index('p1_district_idx').on(t.districtName),
  thanaIdx: index('p1_thana_idx').on(t.thanaName),
  shopIdIdx: index('p1_shop_idx').on(t.shopId),
}));

export const districts = sqliteTable('districts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  division: text('division'),

  deoName: text('deo_name'),
  deoEmailHash: text('deo_email_hash').unique(),
  deoId: text('deo_id'),

  expectedVendCount: integer('expected_vend_count'),

  // District bbox — populated during bulk-provision from GeoJSON
  bboxMinLat: real('bbox_min_lat'),
  bboxMaxLat: real('bbox_max_lat'),
  bboxMinLon: real('bbox_min_lon'),
  bboxMaxLon: real('bbox_max_lon'),

  // 'pending' | 'in_progress' | 'submitted' | 'verified' (M-60 final-verification round —
  // reached only once verificationPhaseOpen is true and the DEO re-confirms their already-
  // submitted data; 'verified' is treated identically to 'submitted' by every lock check)
  status: text('status').default('pending').notNull(),
  submittedAt: integer('submitted_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),

  // Set once, at the moment a district reaches 'verified' — lets GET /api/admin/districts skip
  // re-scanning phase1_raw_collection for this district on every subsequent request. Nulled
  // back out by the Delete Shop Data route when it resets a district to 'pending'.
  cachedVendCount: integer('cached_vend_count'),
  cachedTotalRevenue: integer('cached_total_revenue'),

  // Set once when an admin clears this district's wrongly-entered FY 2026-27 shop data
  // (M-101, POST /api/admin/districts/[district]/clear-fy-data, surfaced on /admin/fy-cleanup).
  // Non-null = already cleared once; that action is one-time per district so a re-entered
  // FY 2025-26 dataset can't be wiped again by mistake.
  fyDataClearedAt: integer('fy_data_cleared_at', { mode: 'timestamp' }),
}, (t) => ({
  nameIdx: index('dist_name_idx').on(t.name),
  emailIdx: index('dist_email_hash_idx').on(t.deoEmailHash),
}));

export const districtCirclesSectors = sqliteTable('district_circles_sectors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  districtName: text('district_name').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'circle' | 'sector'
  createdByDeo: text('created_by_deo').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  districtIdx: index('dcs_district_idx').on(t.districtName),
}));

// Derived Thana master — one row per distinct (district, circle/sector, thana) seen in the
// shop data (migrations/0012, built by scripts/build-district-thanas.ts). A soft checklist:
// GET /api/districts/[district]/thanas serves the district's distinct thana_key set and the
// DEO Verify page warns (never blocks) on a staged row whose thana_name isn't in it. Thana
// survives an FY-data clear, so the list stays valid.
export const districtThanas = sqliteTable('district_thanas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  districtName: text('district_name').notNull(),
  circleSectorName: text('circle_sector_name').notNull(),
  thanaName: text('thana_name').notNull(),
  thanaKey: text('thana_key').notNull(), // normalizeThanaName(): trimmed, ws-collapsed, lowercased
  shopCount: integer('shop_count').notNull().default(0),
  createdAt: integer('created_at').notNull().default(0),
}, (t) => ({
  lookupIdx: index('district_thanas_lookup_idx').on(t.districtName, t.thanaKey),
}));

export const districtUnlockRequests = sqliteTable('district_unlock_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  districtName: text('district_name').notNull(),
  reason: text('reason').notNull(),
  status: text('status').default('pending').notNull(), // 'pending' | 'approved' | 'denied'
  // 'units' (pre-submission — approving deletes district_circles_sectors, DEO re-registers
  // from scratch) | 'data_correction' (post-submission — approving only resets districts.status
  // to 'in_progress', no rows deleted, DEO re-uploads/resubmits)
  requestType: text('request_type').default('units').notNull(),
  requestedByDeo: text('requested_by_deo').notNull(),
  requestedAt: integer('requested_at', { mode: 'timestamp' }).notNull(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  resolvedBy: text('resolved_by'), // resolving admin's display name
  adminNote: text('admin_note'),
}, (t) => ({
  districtIdx: index('dur_district_idx').on(t.districtName),
  statusIdx: index('dur_status_idx').on(t.status),
}));

// M-103 — one row per locked division. Absence = not locked. Written by the deputy
// (POST /api/deputy/divisions/[division]/lock, gated on every district in the division being
// 'verified' + deputy-reviewed 'ok'); removed only by an admin
// (DELETE /api/admin/divisions/[division]/lock). "State locked" = a row for every division.
export const divisionLocks = sqliteTable('division_locks', {
  division: text('division').primaryKey(),
  lockedAt: integer('locked_at', { mode: 'timestamp' }).notNull(),
  lockedBy: text('locked_by').notNull(),
  note: text('note'),
});

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // 'login' | 'logout' | 'login_cug' | 'upload_chunk' | 'district_submitted' | 'unit_registered'
  // | 'units_unlocked' | 'data_correction_unlocked' | 'district_master_updated' | 'bulk_provision'
  // | 'unlock_requested' | 'unlock_request_denied' | 'district_verified' | 'verification_phase_toggled'
  // | 'fy_reminder_acknowledged' | 'district_data_cleared' | 'fy_data_cleared'
  // | 'deputy_district_reviewed' | 'division_locked' | 'division_unlocked'
  eventType: text('event_type').notNull(),
  deoId: text('deo_id').notNull(),
  districtName: text('district_name'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  metadata: text('metadata'), // JSON string for event-specific detail
  // Admin-actor identity, captured at write time — null for DEO-actor events (deoId already
  // identifies those). See CLAUDE.md's audit_log actor-identity note.
  actorName: text('actor_name'),
  actorDesignation: text('actor_designation'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  deoIdx: index('al_deo_idx').on(t.deoId),
  createdAtIdx: index('al_created_at_idx').on(t.createdAt),
}));
