#!/usr/bin/env node
/**
 * M-102 — seeds the 18 Deputy Excise Commissioner accounts (CUG-hash login only, one per
 * division). Source CSV (raw CUG numbers — gitignored, never committed):
 * scripts/data/deputy-cug.csv (`division,cug`), taken from
 * ~/Sites/UP-excise-mailer/database/seeders/data/divisions.json's `dc_cug`.
 *
 * For each division: upserts one `auth_users` row —
 *   role='deputy', division=<division>, district_name=NULL,
 *   deo_id='DEC-<DIVISION>', name='Deputy Excise Commissioner, <Division> Charge',
 *   designation='Deputy Excise Commissioner, <Division>',
 *   deo_cug_hash=sha256(cug),
 *   email_hash=sha256('deputy-<division-lower>')  — synthetic: email_hash is NOT NULL UNIQUE
 *     and two divisions share a real Gmail; deputies never use email login, so a stable
 *     synthetic hash satisfies the constraint without inventing a fake address.
 * Idempotent on email_hash. The raw CUG number is never inserted in plaintext.
 *
 * Usage:
 *   pnpm seed:deputy-accounts              # seed into prod D1
 *   pnpm seed:deputy-accounts -- --local   # seed into local dev D1
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

const csv = readFileSync(join(__dirname, 'data', 'deputy-cug.csv'), 'utf-8');
const rows = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(1); // drop header

const now = Math.floor(Date.now() / 1000);
const lines: string[] = ['-- M-102: seed 18 Deputy Excise Commissioner accounts (CUG login). Idempotent upsert on email_hash.'];
let count = 0;

for (const line of rows) {
  const [division, cug] = line.split(',').map((c) => c.trim());
  if (!division || !cug) { console.warn(`skip: malformed row "${line}"`); continue; }
  if (!/^\d{10}$/.test(cug)) { console.warn(`skip ${division}: CUG is not 10 digits ("${cug}")`); continue; }

  const emailHash = sha256hex(`deputy-${division.toLowerCase()}`);
  const cugHash = sha256hex(cug);
  const deoId = `DEC-${division.toUpperCase().replace(/\s+/g, '-')}`;
  const name = `Deputy Excise Commissioner, ${division} Charge`;
  const designation = `Deputy Excise Commissioner, ${division}`;

  lines.push(
    `INSERT INTO auth_users (email_hash, name, role, deo_id, district_name, deo_cug_hash, designation, division, created_at) ` +
    `VALUES ('${esc(emailHash)}', '${esc(name)}', 'deputy', '${esc(deoId)}', NULL, '${esc(cugHash)}', '${esc(designation)}', '${esc(division)}', datetime(${now}, 'unixepoch')) ` +
    `ON CONFLICT(email_hash) DO UPDATE SET ` +
    `name = excluded.name, role = 'deputy', deo_id = excluded.deo_id, deo_cug_hash = excluded.deo_cug_hash, ` +
    `designation = excluded.designation, division = excluded.division;`,
  );
  count++;
}

if (count === 0) {
  console.log('No valid deputy rows found — nothing to seed.');
  process.exit(0);
}

const local = process.argv.includes('--local');
const tmp = join(tmpdir(), `excise-seed-deputy-${Date.now()}.sql`);
writeFileSync(tmp, lines.join('\n'), 'utf-8');
const cmd = `pnpm --filter web exec wrangler d1 execute ${DB_NAME} ${local ? '--local' : '--remote'} --file="${tmp}"`;
console.log(`Running: ${cmd}`);
execSync(cmd, { stdio: 'inherit', cwd: join(__dirname, '..') });
console.log(`Seeded ${count} deputy accounts into D1 (${local ? 'local' : 'prod'}).`);
