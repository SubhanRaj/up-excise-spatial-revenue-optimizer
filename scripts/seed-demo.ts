#!/usr/bin/env node
/**
 * Demo data seed script for UP Excise Portal.
 *
 * Usage:
 *   pnpm seed:demo                  # seed 1500 shops into prod D1 (idempotent)
 *   pnpm seed:demo -- --truncate    # remove demo data only (Demo District)
 *   pnpm seed:demo -- --reset-all   # truncate ALL tables — fresh DB for real campaign
 *   pnpm seed:demo -- --local       # target local D1 dev DB instead of prod
 *   pnpm seed:demo -- --excel-only  # regenerate Excel file only (no D1 writes)
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { faker } from '@faker-js/faker';
import * as XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ────────────────────────────────────────────────────────────────
const DISTRICT       = 'Demo District';
const DIVISION       = 'Lucknow'; // bare name — must match the real 75 districts' division strings exactly
const DEO_NAME       = 'Demo DEO Officer';
const DEO_EMAIL      = 'subhanraj2002@gmail.com';
const DEO_ID         = 'DEO-DEMO-001';
const EXP_VEND_COUNT = 1500;

// Revenue formula constants (from packages/schema/src/constants.ts)
const ON_PREMISES_CONSUMPTION_FEE = 300_000;
const BHANG_MGQ_MULTIPLIER        = 20;

// Lucknow-area sub-box for Demo District (within UP bbox 23.8–30.4°N, 77.1–84.6°E)
const LAT_MIN = 26.60, LAT_MAX = 27.10;
const LON_MIN = 80.40, LON_MAX = 81.05;

const ADMIN_EMAIL = 'shubhanraj2002@gmail.com';
const ADMIN_NAME  = 'Subhan Raj';

const DB_NAME = 'up-excise-spatial-revenue-optimizer-prod';
const EXCEL_OUT = join(__dirname, '..', 'docs', 'templates', 'demo-district-data.xlsx');

// ─── Reference data ─────────────────────────────────────────────────────────
const CIRCLES_SECTORS = [
  { name: 'Circle 1', type: 'circle' as const },
  { name: 'Circle 2', type: 'circle' as const },
  { name: 'Circle 3', type: 'circle' as const },
  { name: 'Circle 4', type: 'circle' as const },
  { name: 'Circle 5', type: 'circle' as const },
  { name: 'Sector A', type: 'sector' as const },
  { name: 'Sector B', type: 'sector' as const },
  { name: 'Sector C', type: 'sector' as const },
];

const THANAS = [
  'Kotwali', 'Hazratganj', 'Aliganj', 'Chinhat', 'Gomti Nagar',
  'Sarojini Nagar', 'Ashiyana', 'Alambagh', 'Hussainganj', 'Chowk',
  'Thakurganj', 'Naka', 'Wazirganj', 'Mahanagar', 'Rajajipuram',
  'Vibhuti Khand', 'Bakshi Ka Talab', 'Mal', 'Mohanlalganj', 'Sarosa Bharosa',
];

// ─── Helpers ────────────────────────────────────────────────────────────────
const rint  = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const rfloat = (lo: number, hi: number) => +(lo + Math.random() * (hi - lo)).toFixed(6);

function adjThanas(exclude: string): string {
  const pool = THANAS.filter((t) => t !== exclude);
  const n = rint(1, 3);
  const out: string[] = [];
  while (out.length < n) {
    const t = pool[rint(0, pool.length - 1)]!;
    if (!out.includes(t)) out.push(t);
  }
  return out.join(', ');
}

const esc = (s: string) => s.replace(/'/g, "''");

// ─── Shop generation ────────────────────────────────────────────────────────
type ShopType = 'MODEL_SHOP' | 'COMPOSITE_SHOP' | 'PRV' | 'BHANG_SHOP' | 'COUNTRY_LIQUOR';

interface Shop {
  shopId: string; shopName: string; shopType: ShopType; hasCl5cc: boolean;
  circleSectorName: string; thanaName: string; adjacentThanasRaw: string;
  latDd: number; lonDd: number;
  licenseFeeLf: number; basicLicenseFeeBlf: number; mgrAmount: number;
  compositeLfFl: number; compositeLfBeer: number;
  compositeMgrFl: number; compositeMgrBeer: number;
  mgqQuantity: number; considerationFee: number;
  specialBeerLf: number; specialBeerMgr: number;
  totalRevenue: number;
}

function makeShop(idx: number, type: ShopType, cl5cc: boolean, unit: string, thana: string): Shop {
  const label: Record<ShopType, string> = {
    MODEL_SHOP:    'Model Liquor Store',
    COMPOSITE_SHOP:'Composite Wine Shop',
    PRV:           'Premium Retail Vend',
    BHANG_SHOP:    'Bhang Shop',
    COUNTRY_LIQUOR:'Country Liquor Shop',
  };
  faker.seed(idx); // deterministic per index → same data on re-run
  const shopName = `${faker.person.lastName()} ${label[type]}`;

  let lf = 0, blf = 0, mgr = 0;
  let cfFl = 0, cfBeer = 0, cmFl = 0, cmBeer = 0;
  let qty = 0, cf = 0, sbLf = 0, sbMgr = 0, rev = 0;

  switch (type) {
    case 'MODEL_SHOP':
      lf  = rint(100_000, 500_000);
      mgr = rint(200_000, 1_000_000);
      rev = lf + mgr + ON_PREMISES_CONSUMPTION_FEE;
      break;
    case 'COMPOSITE_SHOP':
      cfFl   = rint(100_000, 400_000);
      cfBeer = rint(50_000,  250_000);
      cmFl   = rint(200_000, 600_000);
      cmBeer = rint(100_000, 400_000);
      lf  = cfFl + cfBeer;   // stored composite totals
      mgr = cmFl + cmBeer;
      rev = lf + mgr;
      break;
    case 'PRV':
      lf  = rint(100_000, 400_000);
      mgr = rint(150_000, 800_000);
      rev = lf + mgr;
      break;
    case 'BHANG_SHOP':
      lf  = rint(50_000, 200_000);
      qty = rint(2_000,  10_000);
      rev = lf + qty * BHANG_MGQ_MULTIPLIER;
      break;
    case 'COUNTRY_LIQUOR':
      blf = rint(100_000, 500_000);
      cf  = rint(100_000, 600_000);
      if (cl5cc) {
        sbLf  = rint(50_000,  200_000);
        sbMgr = rint(100_000, 400_000);
        rev   = blf + cf + sbLf + sbMgr;
      } else {
        rev = blf + cf;
      }
      break;
  }

  return {
    shopId: `DM${String(idx).padStart(5, '0')}`, shopName, shopType: type, hasCl5cc: cl5cc,
    circleSectorName: unit, thanaName: thana, adjacentThanasRaw: adjThanas(thana),
    latDd: rfloat(LAT_MIN, LAT_MAX), lonDd: rfloat(LON_MIN, LON_MAX),
    licenseFeeLf: lf, basicLicenseFeeBlf: blf, mgrAmount: mgr,
    compositeLfFl: cfFl, compositeLfBeer: cfBeer, compositeMgrFl: cmFl, compositeMgrBeer: cmBeer,
    mgqQuantity: qty, considerationFee: cf,
    specialBeerLf: sbLf, specialBeerMgr: sbMgr,
    totalRevenue: rev,
  };
}

// Distribution: 300 MODEL + 150 COMPOSITE + 200 PRV + 150 BHANG + 625 CL + 75 CL5CC = 1500
const DIST: [ShopType, boolean, number][] = [
  ['MODEL_SHOP',    false, 300],
  ['COMPOSITE_SHOP',false, 150],
  ['PRV',           false, 200],
  ['BHANG_SHOP',    false, 150],
  ['COUNTRY_LIQUOR',false, 625],
  ['COUNTRY_LIQUOR',true,   75],
];

function generateShops(): Shop[] {
  const shops: Shop[] = [];
  let idx = 1;
  for (const [type, cl5cc, count] of DIST) {
    for (let i = 0; i < count; i++) {
      const unit  = CIRCLES_SECTORS[idx % CIRCLES_SECTORS.length]!.name;
      const thana = THANAS[idx % THANAS.length]!;
      shops.push(makeShop(idx, type, cl5cc, unit, thana));
      idx++;
    }
  }
  return shops;
}

// ─── SQL builders ────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto';
function hashEmail(email: string) {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

function sqlTruncate(): string {
  return [
    `DELETE FROM phase1_raw_collection WHERE district_name = '${esc(DISTRICT)}';`,
    `DELETE FROM district_circles_sectors WHERE district_name = '${esc(DISTRICT)}';`,
    `DELETE FROM districts WHERE name = '${esc(DISTRICT)}';`,
    `DELETE FROM audit_log WHERE district_name = '${esc(DISTRICT)}';`,
    `DELETE FROM auth_users WHERE email_hash = '${esc(hashEmail(DEO_EMAIL))}';`,
  ].join('\n');
}

function sqlResetAll(): string {
  return [
    'DELETE FROM phase1_raw_collection;',
    'DELETE FROM district_circles_sectors;',
    'DELETE FROM districts;',
    'DELETE FROM audit_log;',
    `DELETE FROM auth_users WHERE role = 'deo';`,
  ].join('\n');
}

function sqlSeed(shops: Shop[]): string {
  const now = Math.floor(Date.now() / 1000);
  const lines: string[] = [
    '-- Clear existing demo data (idempotent)',
    sqlTruncate(),
    '',
    '-- Demo District row (status submitted so HQ dashboard shows it)',
    `INSERT INTO districts (name, division, deo_name, deo_email_hash, deo_id, expected_vend_count, status, created_at) VALUES ('${esc(DISTRICT)}', '${esc(DIVISION)}', '${esc(DEO_NAME)}', '${esc(hashEmail(DEO_EMAIL))}', '${esc(DEO_ID)}', ${EXP_VEND_COUNT}, 'submitted', ${now});`,
    '',
    '-- Portal accounts (idempotent — admin and demo DEO both restored after any migration wipe)',
    `INSERT INTO auth_users (email_hash, name, role) VALUES ('${esc(hashEmail(ADMIN_EMAIL))}', '${esc(ADMIN_NAME)}', 'admin') ON CONFLICT(email_hash) DO UPDATE SET name=excluded.name;`,
    `INSERT INTO auth_users (email_hash, name, role, deo_id, district_name) VALUES ('${esc(hashEmail(DEO_EMAIL))}', '${esc(DEO_NAME)}', 'deo', '${esc(DEO_ID)}', '${esc(DISTRICT)}') ON CONFLICT(email_hash) DO UPDATE SET name=excluded.name, deo_id=excluded.deo_id, district_name=excluded.district_name;`,
    '',
    '-- Circles and sectors',
  ];

  for (const cs of CIRCLES_SECTORS) {
    lines.push(`INSERT INTO district_circles_sectors (district_name, name, type, created_by_deo, created_at) VALUES ('${esc(DISTRICT)}', '${esc(cs.name)}', '${cs.type}', '${esc(DEO_ID)}', ${now});`);
  }

  lines.push('', `-- ${shops.length} shop records`);
  for (const s of shops) {
    lines.push(
      `INSERT INTO phase1_raw_collection ` +
      `(district_name, circle_sector_name, thana_name, adjacent_thanas_raw, shop_id, shop_name, shop_type, has_cl5cc, latitude_decimal, longitude_decimal, license_fee_lf, basic_license_fee_blf, mgr_amount, composite_lf_fl, composite_lf_beer, composite_mgr_fl, composite_mgr_beer, mgq_quantity, consideration_fee, special_beer_lf, special_beer_mgr, total_revenue, uploaded_by_deo, created_at) VALUES ` +
      `('${esc(DISTRICT)}', '${esc(s.circleSectorName)}', '${esc(s.thanaName)}', '${esc(s.adjacentThanasRaw)}', '${esc(s.shopId)}', '${esc(s.shopName)}', '${s.shopType}', ${s.hasCl5cc ? 1 : 0}, ${s.latDd}, ${s.lonDd}, ${s.licenseFeeLf}, ${s.basicLicenseFeeBlf}, ${s.mgrAmount}, ${s.compositeLfFl}, ${s.compositeLfBeer}, ${s.compositeMgrFl}, ${s.compositeMgrBeer}, ${s.mgqQuantity}, ${s.considerationFee}, ${s.specialBeerLf}, ${s.specialBeerMgr}, ${s.totalRevenue}, '${esc(DEO_ID)}', ${now});`
    );
  }

  return lines.join('\n');
}

// ─── Excel generator ─────────────────────────────────────────────────────────
const TEMPLATE_HEADERS = [
  'circle_sector_name', 'thana_name', 'adjacent_thanas_raw',
  'shop_id', 'shop_name', 'shop_type', 'has_cl5cc',
  'latitude_dms', 'longitude_dms', 'latitude_decimal', 'longitude_decimal',
  'license_fee_lf', 'basic_license_fee_blf',
  'mgr_amount', 'composite_lf_fl', 'composite_lf_beer',
  'composite_mgr_fl', 'composite_mgr_beer', 'mgq_quantity',
  'consideration_fee', 'special_beer_lf', 'special_beer_mgr',
];

function generateExcel(shops: Shop[], outPath: string) {
  const rows = shops.map((s) => [
    s.circleSectorName, s.thanaName, s.adjacentThanasRaw,
    s.shopId, s.shopName, s.shopType, s.hasCl5cc ? 1 : 0,
    '', '',  // latitude_dms, longitude_dms — blank (using DD columns)
    s.latDd, s.lonDd,
    s.licenseFeeLf, s.basicLicenseFeeBlf,
    s.mgrAmount, s.compositeLfFl, s.compositeLfBeer,
    s.compositeMgrFl, s.compositeMgrBeer, s.mgqQuantity,
    s.considerationFee, s.specialBeerLf, s.specialBeerMgr,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Demo District Data');

  // Column guide sheet
  const guide = [
    ['Notes', ''],
    ['District', DISTRICT],
    ['Rows', shops.length],
    ['Shop types', 'MODEL_SHOP(300), COMPOSITE_SHOP(150), PRV(200), BHANG_SHOP(150), COUNTRY_LIQUOR(625), COUNTRY_LIQUOR+CL5CC(75)'],
    ['Coordinates', `Decimal degrees, Lucknow area sub-box (${LAT_MIN}–${LAT_MAX}N, ${LON_MIN}–${LON_MAX}E)`],
    ['Purpose', 'Test file for DEO portal upload flow. Parse in browser via SheetJS, verify, submit.'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(guide), 'Notes');

  mkdirSync(dirname(outPath), { recursive: true });
  XLSX.writeFile(wb, outPath);
  console.log(`Excel written → ${outPath}`);
}

// ─── Wrangler executor ───────────────────────────────────────────────────────
function runSQL(sql: string, local: boolean) {
  const tmp = join(tmpdir(), `excise-seed-${Date.now()}.sql`);
  writeFileSync(tmp, sql, 'utf-8');
  // --remote targets prod D1; --local targets the local dev D1
  const locationFlag = local ? '--local' : '--remote';
  const cmd = `pnpm --filter web exec wrangler d1 execute ${DB_NAME} ${locationFlag} --file="${tmp}"`;
  console.log(`Running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: join(__dirname, '..') });
}

// ─── Main ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const local     = args.includes('--local');
const truncate  = args.includes('--truncate');
const resetAll  = args.includes('--reset-all');
const excelOnly = args.includes('--excel-only');

if (resetAll) {
  console.log('⚠  Truncating ALL tables — this deletes every row across all districts.');
  runSQL(sqlResetAll(), local);
  console.log('Done. DB is empty and ready for real campaign data.');
} else if (truncate) {
  console.log(`Removing all Demo District data from D1 (${local ? 'local' : 'prod'})...`);
  runSQL(sqlTruncate(), local);
  console.log('Done.');
} else {
  console.log(`Generating ${DIST.reduce((s, [,, n]) => s + n, 0)} demo shops...`);
  const shops = generateShops();
  const totalRevenue = shops.reduce((s, r) => s + r.totalRevenue, 0);
  console.log(`Total revenue: ₹${totalRevenue.toLocaleString('en-IN')} across ${shops.length} shops`);

  if (!excelOnly) {
    const sql = sqlSeed(shops);
    runSQL(sql, local);
    console.log(`Seeded Demo District into D1 (${local ? 'local' : 'prod'}).`);
  }

  generateExcel(shops, EXCEL_OUT);
  console.log('All done. Use the Excel file to test the DEO upload flow.');
}
