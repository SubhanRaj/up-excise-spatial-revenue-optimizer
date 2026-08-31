/**
 * One-time production data-quality audit — run ad hoc, not part of any deploy or CI step.
 *
 * Finds two patterns of real submitted data quietly being wrong even though it passed
 * validation on the way in:
 *
 *  1. Money entered in a field this shop's type doesn't count — `computeRevenue()` never
 *     sums that field for this type, so it never reached Total Revenue (see
 *     `isStrayMoneyValue()` / MONEY_FIELD_GATES in packages/schema/src/constants.ts).
 *  2. Thana names within one district that look like spelling variants of the same place
 *     (e.g. "Kotwali" / "Kotwaali"), inflating the district's real Thana count.
 *
 * Both are now caught going forward — (1) by a new blocking check in validateRow(), (2) by
 * ShopExplorer surfacing near-duplicate clusters for review. This script is for the backlog
 * of data submitted before that: it reads directly from prod D1 and prints what to fix.
 *
 * Usage:
 *   pnpm --filter web exec tsx scripts/audit-data-quality.mts             # prod D1
 *   pnpm --filter web exec tsx scripts/audit-data-quality.mts -- --local  # local dev D1
 */
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { MONEY_FIELD_GATES, MONEY_FIELD_LABELS, isStrayMoneyValue } from '@excise/schema';
import { findThanaNameVariants } from '../src/lib/thana-name.ts';

const DB_NAME = 'up-excise-spatial-revenue-optimizer-prod';
const locationFlag = process.argv.includes('--local') ? '--local' : '--remote';

const MONEY_COLS = [
  'license_fee_lf', 'basic_license_fee_blf', 'mgr_amount',
  'composite_lf_fl', 'composite_lf_beer', 'composite_mgr_fl', 'composite_mgr_beer',
  'mgq_quantity', 'consideration_fee', 'special_beer_lf', 'special_beer_mgr',
];
// snake_case DB column -> camelCase field key MONEY_FIELD_GATES/isStrayMoneyValue expect
const COL_TO_KEY: Record<string, string> = {
  license_fee_lf: 'licenseFeeLf', basic_license_fee_blf: 'basicLicenseFeeBlf', mgr_amount: 'mgrAmount',
  composite_lf_fl: 'compositeLfFl', composite_lf_beer: 'compositeLfBeer',
  composite_mgr_fl: 'compositeMgrFl', composite_mgr_beer: 'compositeMgrBeer',
  mgq_quantity: 'mgqQuantity', consideration_fee: 'considerationFee',
  special_beer_lf: 'specialBeerLf', special_beer_mgr: 'specialBeerMgr',
};

const sql = `SELECT district_name, shop_id, shop_name, shop_type, has_cl5cc, thana_name, ${MONEY_COLS.join(', ')} FROM phase1_raw_collection;`;

console.log(`Querying ${DB_NAME} (${locationFlag})…`);
const out = execSync(
  `npx wrangler d1 execute ${DB_NAME} ${locationFlag} --json --command=${JSON.stringify(sql)}`,
  { cwd: join(import.meta.dirname, '..'), maxBuffer: 1024 * 1024 * 200 },
).toString();

const parsed = JSON.parse(out) as { results: Record<string, unknown>[] }[];
const rows = parsed[0]!.results;
console.log(`${rows.length.toLocaleString()} shop rows loaded.\n`);

// --- 1. Stray money (wrong-column entry) --------------------------------------------------
let strayCount = 0;
const strayByDistrict = new Map<string, { shopId: string; shopType: string; field: string; value: number }[]>();
for (const r of rows) {
  const district = String(r.district_name);
  const shopType = String(r.shop_type);
  const hasCl5cc = !!r.has_cl5cc;
  for (const gate of MONEY_FIELD_GATES) {
    const col = Object.entries(COL_TO_KEY).find(([, key]) => key === gate.key)![0];
    const value = Number(r[col] ?? 0);
    if (isStrayMoneyValue(gate.key, value, shopType, hasCl5cc)) {
      strayCount++;
      if (!strayByDistrict.has(district)) strayByDistrict.set(district, []);
      strayByDistrict.get(district)!.push({ shopId: String(r.shop_id), shopType, field: MONEY_FIELD_LABELS[gate.key] ?? gate.key, value });
    }
  }
}

// Group by (shopType, field) across all districts — a combo appearing consistently in many
// districts with similar amounts looks like a trained/systemic data-entry habit (or a formula
// gap worth confirming with the department), not scattered individual typos. Print this first
// so the two categories aren't skimmed together.
const byCombo = new Map<string, { count: number; total: number; districts: Set<string> }>();
for (const [district, items] of strayByDistrict) {
  for (const it of items) {
    const key = `${it.shopType} — ${it.field}`;
    if (!byCombo.has(key)) byCombo.set(key, { count: 0, total: 0, districts: new Set() });
    const agg = byCombo.get(key)!;
    agg.count++; agg.total += it.value; agg.districts.add(district);
  }
}
console.log(`=== By shop type + field (systemic patterns worth confirming with the department first) ===`);
for (const [combo, agg] of Array.from(byCombo.entries()).sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  ${combo}: ${agg.count} rows across ${agg.districts.size} district(s), ₹${agg.total.toLocaleString('en-IN')} total not counted`);
}

console.log(`\n=== Wrong-column money entries: ${strayCount} across ${strayByDistrict.size} district(s) ===`);
for (const [district, items] of Array.from(strayByDistrict.entries()).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${district} (${items.length}):`);
  for (const it of items.slice(0, 20)) {
    console.log(`  ${it.shopId} [${it.shopType}] — ${it.field}: ₹${it.value.toLocaleString('en-IN')}`);
  }
  if (items.length > 20) console.log(`  … and ${items.length - 20} more`);
}

// --- 2. Thana name spelling variants, per district --------------------------------------
console.log(`\n\n=== Possible duplicate Thana names, by district ===`);
const thanasByDistrict = new Map<string, string[]>();
for (const r of rows) {
  const district = String(r.district_name);
  const thana = String(r.thana_name ?? '').trim();
  if (!thana) continue;
  if (!thanasByDistrict.has(district)) thanasByDistrict.set(district, []);
  thanasByDistrict.get(district)!.push(thana);
}
let districtsWithVariants = 0;
for (const [district, names] of thanasByDistrict) {
  const clusters = findThanaNameVariants(names);
  if (clusters.length === 0) continue;
  districtsWithVariants++;
  console.log(`\n${district}:`);
  for (const cluster of clusters) console.log(`  ${cluster.join(' ≈ ')}`);
}
if (districtsWithVariants === 0) console.log('None found.');

console.log(`\n\nSummary: ${strayCount} wrong-column entries in ${strayByDistrict.size} district(s); Thana name variants in ${districtsWithVariants} district(s).`);
