#!/usr/bin/env node
/**
 * Demo data generator for UP Excise Portal.
 *
 * Usage:
 *   pnpm seed:demo                  # generate a local 1500-row demo .xlsx (no D1 writes)
 *   pnpm seed:demo -- --truncate    # remove Demo District's circles/sectors + shop rows from D1
 *                                   # (keeps the districts row + auth_users owner account so login still works)
 *   pnpm seed:demo -- --reset-all   # truncate ALL tables — fresh DB for real campaign
 *   pnpm seed:demo -- --local       # target local D1 dev DB instead of prod (with --truncate/--reset-all)
 *
 * The generated Excel is meant to be uploaded manually through the DEO portal's own
 * Upload page after you create matching circles/sectors (see CIRCLES_SECTORS below)
 * via the portal's own /units wizard — this exercises the real upload path end to end
 * instead of writing rows into D1 directly.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { faker } from '@faker-js/faker';
import ExcelJS from 'exceljs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ────────────────────────────────────────────────────────────────
const DISTRICT = 'Demo District';

// Revenue formula constants (from packages/schema/src/constants.ts)
const ON_PREMISES_CONSUMPTION_FEE = 300_000;
const BHANG_MGQ_MULTIPLIER        = 20;

// Lucknow-area sub-box for Demo District (within UP bbox 23.8–30.4°N, 77.1–84.6°E)
const LAT_MIN = 26.60, LAT_MAX = 27.10;
const LON_MIN = 80.40, LON_MAX = 81.05;

const DB_NAME = 'up-excise-spatial-revenue-optimizer-prod';
const EXCEL_OUT = join(__dirname, '..', 'docs', 'templates', 'demo-district-data.xlsx');

// Create these exact circles/sectors via the portal's /units wizard before uploading —
// the generated file's circle_sector_name column must match a registered unit.
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

// ─── D1 cleanup (circles/sectors + shop rows only — district + owner account survive) ──
function sqlTruncate(): string {
  return [
    `DELETE FROM phase1_raw_collection WHERE district_name = '${esc(DISTRICT)}';`,
    `DELETE FROM district_circles_sectors WHERE district_name = '${esc(DISTRICT)}';`,
    `DELETE FROM audit_log WHERE district_name = '${esc(DISTRICT)}';`,
    `UPDATE districts SET status = 'pending', submitted_at = NULL WHERE name = '${esc(DISTRICT)}';`,
    // districts row and auth_users row are NOT deleted — DEO login must keep working
  ].join('\n');
}

function sqlResetAll(): string {
  return [
    'DELETE FROM phase1_raw_collection;',
    'DELETE FROM district_circles_sectors;',
    'DELETE FROM districts;',
    'DELETE FROM audit_log;',
    // Do not delete auth_users — the owner account must survive a reset
  ].join('\n');
}

function runSQL(sql: string, local: boolean) {
  const tmp = join(tmpdir(), `excise-seed-${Date.now()}.sql`);
  writeFileSync(tmp, sql, 'utf-8');
  const locationFlag = local ? '--local' : '--remote';
  const cmd = `pnpm --filter web exec wrangler d1 execute ${DB_NAME} ${locationFlag} --file="${tmp}"`;
  console.log(`Running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: join(__dirname, '..') });
}

// ─── Excel generator — matches the portal's own template layout (apps/web/src/lib/excel.ts) ──
const TEMPLATE_HEADERS = [
  'circle_sector_name', 'thana_name', 'adjacent_thanas_raw',
  'shop_id', 'shop_name', 'shop_type', 'has_cl5cc',
  'latitude', 'longitude',
  'license_fee_lf', 'basic_license_fee_blf',
  'mgr_amount', 'composite_lf_fl', 'composite_lf_beer',
  'composite_mgr_fl', 'composite_mgr_beer', 'mgq_quantity',
  'consideration_fee', 'special_beer_lf', 'special_beer_mgr',
];

async function generateExcel(shops: Shop[], outPath: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'UP Excise Spatial Revenue Optimizer — demo data generator';
  wb.created = new Date();

  const ws = wb.addWorksheet('Data Entry');
  ws.mergeCells(1, 1, 1, TEMPLATE_HEADERS.length);
  const title = ws.getCell(1, 1);
  title.value = `District: ${DISTRICT.toUpperCase()}   |   UP Excise Spatial Revenue Optimizer   |   Local Demo Data (${shops.length} rows)`;
  title.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A44' } };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 26;

  ws.getRow(2).values = TEMPLATE_HEADERS as ExcelJS.CellValue[];
  const headerRow = ws.getRow(2);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  for (const s of shops) {
    ws.addRow([
      s.circleSectorName, s.thanaName, s.adjacentThanasRaw,
      s.shopId, s.shopName, s.shopType, s.hasCl5cc,
      s.latDd, s.lonDd,
      s.licenseFeeLf, s.basicLicenseFeeBlf,
      s.mgrAmount, s.compositeLfFl, s.compositeLfBeer,
      s.compositeMgrFl, s.compositeMgrBeer, s.mgqQuantity,
      s.considerationFee, s.specialBeerLf, s.specialBeerMgr,
    ]);
  }

  ws.columns = TEMPLATE_HEADERS.map((h) => ({ width: Math.max(16, h.length + 4) }));
  for (let r = 3; r <= ws.rowCount; r++) {
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      cell.alignment = { wrapText: true, vertical: 'top' };
    });
  }

  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:2' };
  ws.views = [{ state: 'frozen', ySplit: 2, xSplit: 0 }];

  mkdirSync(dirname(outPath), { recursive: true });
  await wb.xlsx.writeFile(outPath);
  console.log(`Excel written → ${outPath}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const local    = args.includes('--local');
const truncate = args.includes('--truncate');
const resetAll = args.includes('--reset-all');

async function main() {
  if (resetAll) {
    console.log('⚠  Truncating ALL tables — this deletes every row across all districts.');
    runSQL(sqlResetAll(), local);
    console.log('Done. DB is empty and ready for real campaign data.');
  } else if (truncate) {
    console.log(`Removing Demo District's circles/sectors and shop rows from D1 (${local ? 'local' : 'prod'})...`);
    runSQL(sqlTruncate(), local);
    console.log('Done. Demo District row and its DEO login still exist — /units will show the empty first-step wizard again.');
  } else {
    console.log(`Generating ${DIST.reduce((s, [,, n]) => s + n, 0)} demo shop rows locally (no D1 writes)...`);
    const shops = generateShops();
    const totalRevenue = shops.reduce((s, r) => s + r.totalRevenue, 0);
    console.log(`Total revenue: ₹${totalRevenue.toLocaleString('en-IN')} across ${shops.length} shops`);
    await generateExcel(shops, EXCEL_OUT);
    console.log(`Before uploading: create these circles/sectors via the portal's own /units wizard first —`);
    console.log(CIRCLES_SECTORS.map((c) => `${c.type === 'circle' ? 'Circle' : 'Sector'}: ${c.name}`).join(', '));
    console.log('Then upload this file on the Upload page.');
  }
}

void main();
