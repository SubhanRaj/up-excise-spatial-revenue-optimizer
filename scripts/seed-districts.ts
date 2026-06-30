#!/usr/bin/env node
/**
 * Seeds the `districts` master/reference table with all 75 UP districts and
 * their 18 divisions, with bbox computed from the GeoJSON boundary file.
 * Idempotent — upserts on district name, never touches deo_name/deo_email/
 * deo_id/status (those are owned by /api/admin/bulk-provision and the
 * District Master edit drawer).
 *
 * Usage:
 *   pnpm seed:districts             # seed into prod D1
 *   pnpm seed:districts -- --local  # seed into local dev D1
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_NAME = 'up-excise-spatial-revenue-optimizer-prod';
const GEOJSON_PATH = join(__dirname, '..', 'apps', 'web', 'public', 'geodata', 'up-districts.geojson');

// Verified against Wikipedia "Administrative divisions of Uttar Pradesh" (18 divisions, 75 districts).
const DIVISIONS: Record<string, string[]> = {
  Agra: ['Agra', 'Firozabad', 'Mathura', 'Mainpuri'],
  Aligarh: ['Aligarh', 'Etah', 'Hathras', 'Kasganj'],
  Ayodhya: ['Ambedkar Nagar', 'Amethi', 'Ayodhya', 'Barabanki', 'Sultanpur'],
  Azamgarh: ['Azamgarh', 'Ballia', 'Mau'],
  Bareilly: ['Badaun', 'Bareilly', 'Pilibhit', 'Shahjahanpur'],
  Basti: ['Basti', 'Sant Kabir Nagar', 'Siddharth Nagar'],
  Chitrakoot: ['Banda', 'Chitrakoot', 'Hamirpur', 'Mahoba'],
  Devipatan: ['Bahraich', 'Balrampur', 'Gonda', 'Shravasti'],
  Gorakhpur: ['Deoria', 'Gorakhpur', 'Kushinagar', 'Maharajganj'],
  Jhansi: ['Jalaun', 'Jhansi', 'Lalitpur'],
  Kanpur: ['Auraiya', 'Etawah', 'Farrukhabad', 'Kannauj', 'Kanpur Dehat', 'Kanpur Nagar'],
  Lucknow: ['Hardoi', 'Lakhimpur Kheri', 'Lucknow', 'Rae Bareli', 'Sitapur', 'Unnao'],
  Meerut: ['Baghpat', 'Bulandshahr', 'Gautam Buddha Nagar', 'Ghaziabad', 'Hapur', 'Meerut'],
  Moradabad: ['Amroha', 'Bijnor', 'Moradabad', 'Rampur', 'Sambhal'],
  Prayagraj: ['Fatehpur', 'Kaushambi', 'Pratapgarh', 'Prayagraj'],
  Saharanpur: ['Muzaffarnagar', 'Saharanpur', 'Shamli'],
  Varanasi: ['Chandauli', 'Ghazipur', 'Jaunpur', 'Varanasi'],
  Vindhyachal: ['Bhadohi', 'Mirzapur', 'Sonbhadra'],
};

const districtToDivision = new Map<string, string>();
for (const [division, names] of Object.entries(DIVISIONS)) {
  for (const name of names) districtToDivision.set(name, division);
}

interface GeoFeature {
  properties: { district: string };
  geometry: { coordinates: unknown };
}

function flattenCoords(c: unknown, out: [number, number][]) {
  if (Array.isArray(c) && typeof c[0] === 'number') {
    out.push(c as [number, number]);
  } else if (Array.isArray(c)) {
    for (const x of c) flattenCoords(x, out);
  }
}

const esc = (s: string) => s.replace(/'/g, "''");

const geojson = JSON.parse(readFileSync(GEOJSON_PATH, 'utf-8')) as { features: GeoFeature[] };
if (geojson.features.length !== 75) {
  throw new Error(`Expected 75 district features in GeoJSON, found ${geojson.features.length}`);
}

const now = Math.floor(Date.now() / 1000);
const lines: string[] = ['-- Seed: 75 UP districts + 18 divisions, bbox from GeoJSON. Idempotent upsert by name.'];

for (const f of geojson.features) {
  const name = f.properties.district;
  const division = districtToDivision.get(name);
  if (!division) throw new Error(`No division mapping for district "${name}" — update DIVISIONS in this script.`);

  const pts: [number, number][] = [];
  flattenCoords(f.geometry.coordinates, pts);
  const lats = pts.map((p) => p[1]);
  const lons = pts.map((p) => p[0]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);

  lines.push(
    `INSERT INTO districts (name, division, expected_vend_count, bbox_min_lat, bbox_max_lat, bbox_min_lon, bbox_max_lon, status, created_at) ` +
    `VALUES ('${esc(name)}', '${esc(division)}', 0, ${minLat}, ${maxLat}, ${minLon}, ${maxLon}, 'pending', ${now}) ` +
    `ON CONFLICT(name) DO UPDATE SET division=excluded.division, bbox_min_lat=excluded.bbox_min_lat, bbox_max_lat=excluded.bbox_max_lat, bbox_min_lon=excluded.bbox_min_lon, bbox_max_lon=excluded.bbox_max_lon;`
  );
}

const sql = lines.join('\n');
const local = process.argv.includes('--local');
const tmp = join(tmpdir(), `excise-seed-districts-${Date.now()}.sql`);
writeFileSync(tmp, sql, 'utf-8');
const locationFlag = local ? '--local' : '--remote';
const cmd = `pnpm --filter web exec wrangler d1 execute ${DB_NAME} ${locationFlag} --file="${tmp}"`; // wrangler lives in apps/web's deps
console.log(`Running: ${cmd}`);
execSync(cmd, { stdio: 'inherit', cwd: join(__dirname, '..') });
console.log(`Seeded 75 districts / 18 divisions into D1 (${local ? 'local' : 'prod'}).`);
