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
  // MODEL_SHOP | COMPOSITE_SHOP | BHANG_SHOP | PRV | COUNTRY_LIQUOR
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
  deoEmail: text('deo_email').unique(),
  deoId: text('deo_id'),

  expectedVendCount: integer('expected_vend_count'),

  // District bbox — populated during bulk-provision from GeoJSON
  bboxMinLat: real('bbox_min_lat'),
  bboxMaxLat: real('bbox_max_lat'),
  bboxMinLon: real('bbox_min_lon'),
  bboxMaxLon: real('bbox_max_lon'),

  // 'pending' | 'in_progress' | 'submitted'
  status: text('status').default('pending').notNull(),
  submittedAt: integer('submitted_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  nameIdx: index('dist_name_idx').on(t.name),
  emailIdx: index('dist_email_idx').on(t.deoEmail),
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

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // 'login' | 'logout' | 'session_revoked' | 'upload_chunk' | 'district_submitted' | 'unit_registered'
  eventType: text('event_type').notNull(),
  deoId: text('deo_id').notNull(),
  districtName: text('district_name'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  metadata: text('metadata'), // JSON string for event-specific detail
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  deoIdx: index('al_deo_idx').on(t.deoId),
  createdAtIdx: index('al_created_at_idx').on(t.createdAt),
}));
