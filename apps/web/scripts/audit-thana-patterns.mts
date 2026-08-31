/**
 * One-time diagnostic — not part of any deploy or CI step, and none of these five patterns
 * are auto-flagged in the app (unlike the wrong-column-money and Thana-spelling checks in
 * audit-data-quality.mts / ShopExplorer, which are). This is a wider net for the pre-meeting
 * review: Lucknow's data (ALL CAPS, bare station names, no punctuation) was read manually
 * first and used as the "what clean looks like" reference these patterns check against.
 *
 * Usage: pnpm --filter web exec tsx scripts/audit-thana-patterns.mts
 */
import { execSync } from 'node:child_process';

const sql = `SELECT district_name, thana_name, adjacent_thanas_raw FROM phase1_raw_collection;`;
const out = execSync(`npx wrangler d1 execute up-excise-spatial-revenue-optimizer-prod --remote --json --command=${JSON.stringify(sql)}`, { cwd: process.cwd(), maxBuffer: 1024*1024*200 }).toString();
const rows = (JSON.parse(out) as any[])[0].results as { district_name: string; thana_name: string; adjacent_thanas_raw: string | null }[];

let hyphen = 0, genericSuffix = 0, digits = 0, blankAdj = 0, singleAdj = 0, trailingComma = 0, doubleSpace = 0;
const hyphenEx: string[] = [], suffixEx: string[] = [], digitsEx: string[] = [], blankExDistricts = new Set<string>(), singleExDistricts = new Map<string,number>();

const GENERIC_WORDS = ['THANA', 'P.S.', ' PS ', 'POLICE STATION', 'KOTWALI CITY', ' CITY', ' TOWN', ' KASBA', ' RURAL'];

for (const r of rows) {
  const t = (r.thana_name || '').trim();
  if (/-/.test(t)) { hyphen++; if (hyphenEx.length<15) hyphenEx.push(`${r.district_name}: "${t}"`); }
  if (/\d/.test(t)) { digits++; if (digitsEx.length<15) digitsEx.push(`${r.district_name}: "${t}"`); }
  const upper = t.toUpperCase();
  if (GENERIC_WORDS.some(w => upper.includes(w))) { genericSuffix++; if (suffixEx.length<20) suffixEx.push(`${r.district_name}: "${t}"`); }

  const adj = (r.adjacent_thanas_raw || '').trim();
  if (!adj) { blankAdj++; blankExDistricts.add(r.district_name); continue; }
  if (/,\s*$/.test(adj) || /^\s*,/.test(adj)) trailingComma++;
  if (/\s\s+/.test(adj)) doubleSpace++;
  const parts = adj.split(',').map(s=>s.trim()).filter(Boolean);
  if (parts.length === 1) { singleAdj++; singleExDistricts.set(r.district_name, (singleExDistricts.get(r.district_name)||0)+1); }
}

console.log(`Total rows: ${rows.length}`);
console.log(`\nThana Name issues:`);
console.log(`  Hyphen in thana_name: ${hyphen}`); hyphenEx.forEach(e=>console.log('   ',e));
console.log(`  Digits in thana_name: ${digits}`); digitsEx.forEach(e=>console.log('   ',e));
console.log(`  Generic word (THANA/PS/CITY/TOWN/KASBA/RURAL) in thana_name: ${genericSuffix}`); suffixEx.forEach(e=>console.log('   ',e));

console.log(`\nAdjacent Thanas issues:`);
console.log(`  Completely blank: ${blankAdj} across ${blankExDistricts.size} district(s): ${Array.from(blankExDistricts).join(', ')}`);
console.log(`  Trailing/leading comma artifact: ${trailingComma}`);
console.log(`  Double-space artifact: ${doubleSpace}`);
console.log(`  Exactly one Thana listed: ${singleAdj} rows across ${singleExDistricts.size} districts`);
const top = Array.from(singleExDistricts.entries()).sort((a,b)=>b[1]-a[1]).slice(0,15);
top.forEach(([d,c])=>console.log(`    ${d}: ${c}`));
