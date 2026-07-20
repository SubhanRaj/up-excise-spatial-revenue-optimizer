#!/usr/bin/env node
/**
 * Seeds real DEO accounts (email + CUG-hash login) from department contact sheets.
 * Source CSVs (raw PII — gitignored, never committed): scripts/data/deo-contact.csv
 * (क्रमांक, पद नाम, नाम, कोड, कार्यालय, आवास, मो० नम्बर, सी०यू०जी०) and
 * scripts/data/deo-emails.csv (Entity Name, Email Address). Both are hashed before
 * ever reaching D1 — see CLAUDE.md's Zero-Knowledge PII Storage rule.
 *
 * For each district with both a valid CUG and an email: upserts `auth_users`
 * (emailHash, deoCugHash, role='deo', deoId, districtName — name left as a generic
 * English placeholder since the source sheet's DEO names are in Hindi and this
 * project's Data Language rule requires English-only stored data; correct via the
 * admin District Master page) and updates `districts` (deo_email_hash, deo_id).
 * DEO name and CUG number are never inserted in plaintext.
 *
 * Usage:
 *   pnpm seed:deo-accounts             # seed into prod D1
 *   pnpm seed:deo-accounts -- --local  # seed into local dev D1
 */

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_NAME = 'up-excise-spatial-revenue-optimizer-prod';

const sha256hex = (s: string) => createHash('sha256').update(s).digest('hex');
const esc = (s: string) => s.replace(/'/g, "''");

// Minimal quoted-CSV line parser — department sheets have commas inside quoted fields
// (e.g. designation "जिला आबकारी अधिकारी, गाजियाबाद"), so a plain split(',') breaks.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const cells: string[] = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else cur += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { cells.push(cur); cur = ''; }
      else cur += c;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

// Hindi district name -> English name matching `districts.name` in D1 (mirrors
// scripts/seed-districts.ts's DIVISIONS keys).
const DISTRICT_MAP: Record<string, string> = {
  'प्रयागराज': 'Prayagraj', 'फतेहपुर': 'Fatehpur', 'कौशाम्बी': 'Kaushambi',
  'प्रतापगढ़': 'Pratapgarh', 'प्रतापगढ': 'Pratapgarh', 'वाराणसी': 'Varanasi',
  'चंदौली': 'Chandauli', 'जौनपुर': 'Jaunpur', 'गाजीपुर': 'Ghazipur',
  'मिर्जापुर': 'Mirzapur', 'सोनभद्र': 'Sonbhadra',
  'भदोही': 'Bhadohi', 'संत रविदासनगर, भदोही': 'Bhadohi', 'संत रविदासनगर भदोही': 'Bhadohi',
  'आजमगढ़': 'Azamgarh', 'आजमगढ': 'Azamgarh', 'मऊ': 'Mau',
  'बलिया': 'Ballia', 'गोरखपुर': 'Gorakhpur', 'देवरिया': 'Deoria',
  'कुशीनगर': 'Kushinagar', 'महराजगंज': 'Maharajganj', 'बस्ती': 'Basti',
  'सिद्धार्थनगर': 'Siddharth Nagar', 'संतकबीरनगर': 'Sant Kabir Nagar',
  'संत कबीर नगर': 'Sant Kabir Nagar', 'अयोध्या': 'Ayodhya', 'सुल्तानपुर': 'Sultanpur',
  'बाराबंकी': 'Barabanki', 'अम्बेडकरनगर': 'Ambedkar Nagar',
  'अम्बेडकर नगर': 'Ambedkar Nagar', 'अमेठी': 'Amethi', 'गोण्डा': 'Gonda',
  'बलरामपुर': 'Balrampur', 'बहराइच': 'Bahraich', 'श्रावस्ती': 'Shravasti',
  'लखनऊ': 'Lucknow', 'रायबरेली': 'Rae Bareli', 'उन्नाव': 'Unnao',
  'लखीमपुर खीरी': 'Lakhimpur Kheri', 'लखीमपुर': 'Lakhimpur Kheri', 'हरदोई': 'Hardoi',
  'सीतापुर': 'Sitapur', 'बरेली': 'Bareilly', 'बदायूँ': 'Budaun',
  'पीलीभीत': 'Pilibhit', 'शाहजहाँपुर': 'Shahjahanpur', 'मुरादाबाद': 'Moradabad',
  'रामपुर': 'Rampur', 'बिजनौर': 'Bijnor', 'अमरोहा': 'Amroha', 'मेरठ': 'Meerut',
  'गाजियाबाद': 'Ghaziabad', 'बागपत': 'Baghpat', 'गौतमबुद्धनगर': 'Gautam Buddha Nagar',
  'गौतम बुद्ध नगर': 'Gautam Buddha Nagar', 'बुलन्दशहर': 'Bulandshahr',
  'हापुड़': 'Hapur', 'हापुड': 'Hapur', 'सहारनपुर': 'Saharanpur',
  'मुजफ्फरनगर': 'Muzaffarnagar', 'शामली': 'Shamli', 'आगरा': 'Agra',
  'फिरोजाबाद': 'Firozabad', 'मथुरा': 'Mathura', 'अलीगढ़': 'Aligarh', 'एटा': 'Etah',
  'कासगंज': 'Kasganj', 'हाथरस': 'Hathras', 'झाँसी': 'Jhansi', 'झांसी': 'Jhansi',
  'ललितपुर': 'Lalitpur', 'जालौन': 'Jalaun', 'बाँदा': 'Banda', 'बांदा': 'Banda',
  'हमीरपुर': 'Hamirpur', 'चित्रकूट': 'Chitrakoot', 'महोबा': 'Mahoba',
  'कानपुर नगर': 'Kanpur Nagar', 'कानपुर देहात': 'Kanpur Dehat', 'कन्नौज': 'Kannauj',
  'इटावा': 'Etawah', 'फर्रुखाबाद': 'Farrukhabad', 'औरैया': 'Auraiya',
  'औरया': 'Auraiya', 'मैनपुरी': 'Mainpuri', 'सम्भल': 'Sambhal', 'संभल': 'Sambhal',
};

function englishDistrict(designation: string): string | null {
  const hindi = designation.replace('जिला आबकारी अधिकारी', '').replace(',', '').trim();
  return DISTRICT_MAP[hindi] ?? null;
}

const dataDir = join(__dirname, 'data');
const contactRows = parseCsv(readFileSync(join(dataDir, 'deo-contact.csv'), 'utf-8'));
const emailRows = parseCsv(readFileSync(join(dataDir, 'deo-emails.csv'), 'utf-8'));

const contactHeader = contactRows[0]!;
const designationIdx = contactHeader.indexOf('पद नाम');
const cugIdx = contactHeader.indexOf('सी०यू०जी०');

type DeoRow = { cugHash?: string; email?: string };
const byDistrict = new Map<string, DeoRow>();

for (const row of contactRows.slice(1)) {
  const designation = row[designationIdx]?.trim() ?? '';
  if (!designation.includes('जिला आबकारी अधिकारी')) continue;
  const district = englishDistrict(designation);
  if (!district) { console.warn(`contact.csv: no district mapping for "${designation}"`); continue; }

  const cug = row[cugIdx]?.trim() ?? '';
  if (cug.length === 10 && cug.startsWith('94544')) {
    byDistrict.set(district, { ...byDistrict.get(district), cugHash: sha256hex(cug) });
  } else if (cug) {
    console.warn(`contact.csv: invalid CUG for ${district}: ${cug}`);
  }
}

for (const row of emailRows) {
  const designation = row[0]?.trim() ?? '';
  if (!designation.includes('जिला आबकारी अधिकारी')) continue;
  const district = englishDistrict(designation);
  if (!district) { console.warn(`emails.csv: no district mapping for "${designation}"`); continue; }

  const email = row[1]?.trim().toLowerCase() ?? '';
  if (email) byDistrict.set(district, { ...byDistrict.get(district), email });
}

const now = Math.floor(Date.now() / 1000);
const lines: string[] = ['-- Seed: real DEO accounts (email + CUG hash) from department contact sheets. Idempotent upsert.'];
let count = 0;

for (const [district, row] of byDistrict) {
  if (!row.cugHash || !row.email) {
    console.warn(`Skipping ${district}: missing ${!row.cugHash ? 'CUG' : ''} ${!row.email ? 'email' : ''}`.trim());
    continue;
  }
  const emailHash = sha256hex(row.email);
  const deoId = `DEO-${district.toUpperCase().replace(/\s+/g, '-')}`;
  const name = `${district} DEO`; // English placeholder — source sheet's name is Hindi; correct via District Master UI

  lines.push(
    `UPDATE districts SET deo_email_hash = '${esc(emailHash)}', deo_id = '${esc(deoId)}' WHERE name = '${esc(district)}';`
  );
  lines.push(
    `INSERT INTO auth_users (email_hash, name, role, deo_id, district_name, deo_cug_hash, created_at) ` +
    `VALUES ('${esc(emailHash)}', '${esc(name)}', 'deo', '${esc(deoId)}', '${esc(district)}', '${esc(row.cugHash)}', datetime(${now}, 'unixepoch')) ` +
    `ON CONFLICT(email_hash) DO UPDATE SET deo_id = excluded.deo_id, district_name = excluded.district_name, deo_cug_hash = excluded.deo_cug_hash;`
  );
  count++;
}

if (count === 0) {
  console.log('No complete (CUG + email) DEO rows found — nothing to seed.');
  process.exit(0);
}

const sql = lines.join('\n');
const local = process.argv.includes('--local');
const tmp = join(tmpdir(), `excise-seed-deo-accounts-${Date.now()}.sql`);
writeFileSync(tmp, sql, 'utf-8');
const locationFlag = local ? '--local' : '--remote';
const cmd = `pnpm --filter web exec wrangler d1 execute ${DB_NAME} ${locationFlag} --file="${tmp}"`;
console.log(`Running: ${cmd}`);
execSync(cmd, { stdio: 'inherit', cwd: join(__dirname, '..') });
console.log(`Seeded ${count} DEO accounts into D1 (${local ? 'local' : 'prod'}).`);
