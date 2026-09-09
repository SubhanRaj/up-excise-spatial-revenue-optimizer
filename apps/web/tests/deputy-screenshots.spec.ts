import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Not a correctness test — walks the Deputy Excise Commissioner portal end to end against the
 * local dev D1 and saves a numbered screenshot at each step. build-deputy-manual-pdf.spec.ts
 * turns these into the bilingual Deputy User Manual PDF. Run against `--local` D1 only.
 *
 * The deputy account (role='deputy', division='Agra') is seeded by `pnpm seed:deputy-accounts
 * -- --local`; this spec re-seeds it and gives the division's Agra district a small submitted
 * dataset so the dashboard, figures, and review sign-off have something real to show.
 */

const SHOTS_DIR = path.join(__dirname, '..', '..', '..', 'docs', 'manual', 'deputy-screenshots');
const DIVISION = 'Agra';
const DISTRICT = 'Agra';
const DB = 'up-excise-spatial-revenue-optimizer-prod';

let shotIndex = 0;
async function shot(page: import('@playwright/test').Page, name: string) {
  shotIndex += 1;
  // Drop transient overlays so they don't sit in the manual screenshot: Notyf toasts and
  // the Next.js dev-mode issues indicator (dev-only, never in production).
  await page.evaluate(() =>
    document.querySelectorAll('.notyf, nextjs-portal, [data-nextjs-toast]').forEach((n) => n.remove()),
  );
  await page.screenshot({ path: path.join(SHOTS_DIR, `${String(shotIndex).padStart(2, '0')}-${name}.png`), fullPage: true });
}

function d1(sql: string) {
  execSync(`pnpm --filter web exec wrangler d1 execute ${DB} --local --command="${sql.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
}

async function loginAs(page: import('@playwright/test').Page, emailHash: string) {
  const rawToken = crypto.randomUUID();
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  d1(`INSERT INTO auth_magic_links (email_hash, token_hash, expires_at, used) VALUES ('${emailHash}', '${tokenHash}', '${expiresAt}', 0);`);
  await page.goto(`/api/auth/verify?token=${rawToken}`);
}

test.describe('Deputy Manual — screenshot walkthrough', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
  });

  test('walk the deputy division-review flow and capture screenshots', async ({ page }) => {
    test.setTimeout(120000);

    const deputyEmailHash = crypto.createHash('sha256').update(`deputy-${DIVISION.toLowerCase()}`).digest('hex');
    d1(
      `INSERT INTO auth_users (email_hash, name, role, deo_id, district_name, division, designation) ` +
      `VALUES ('${deputyEmailHash}', 'Deputy Excise Commissioner, ${DIVISION} Charge', 'deputy', 'DEC-${DIVISION.toUpperCase()}', NULL, '${DIVISION}', 'Deputy Excise Commissioner, ${DIVISION}') ` +
      `ON CONFLICT(email_hash) DO UPDATE SET role='deputy', division='${DIVISION}', district_name=NULL;`,
    );

    // Give the Agra district a small submitted dataset (idempotent — wipes and re-inserts).
    const now = Math.floor(Date.now() / 1000);
    d1(`DELETE FROM phase1_raw_collection WHERE district_name='${DISTRICT}';`);
    d1(`DELETE FROM district_circles_sectors WHERE district_name='${DISTRICT}';`);
    d1(`DELETE FROM audit_log WHERE district_name='${DISTRICT}' AND event_type='deputy_district_reviewed';`);
    d1(
      `INSERT INTO district_circles_sectors (district_name, name, type, created_by_deo, created_at) VALUES ` +
      `('${DISTRICT}', 'Sector - 1', 'sector', 'DEO-AGRA', ${now}),` +
      `('${DISTRICT}', 'Circle 2 - Fatehabad', 'circle', 'DEO-AGRA', ${now});`,
    );
    const shop = (id: string, unit: string, thana: string, type: string, total: number) =>
      `('${DISTRICT}', '${unit}', '${thana}', 'Hariparvat', '${id}', '${id} ${type}', '${type}', 0, ${total}, 'DEO-AGRA', ${now})`;
    d1(
      `INSERT INTO phase1_raw_collection (district_name, circle_sector_name, thana_name, adjacent_thanas_raw, shop_id, shop_name, shop_type, has_cl5cc, total_revenue, uploaded_by_deo, created_at) VALUES ` +
      [
        shop('AG0001', 'Sector - 1', 'Hariparvat', 'MODEL_SHOP', 750000),
        shop('AG0002', 'Sector - 1', 'Sadar Bazar', 'PRV', 320000),
        shop('AG0003', 'Circle 2 - Fatehabad', 'Fatehabad', 'COUNTRY_LIQUOR', 240000),
        shop('AG0004', 'Circle 2 - Fatehabad', 'Kheragarh', 'HBR', 650000),
      ].join(',') + ';',
    );
    d1(`UPDATE districts SET status='submitted', deo_name='Rajesh Kumar' WHERE name='${DISTRICT}';`);

    await loginAs(page, deputyEmailHash);

    // The review-responsibility acknowledgment modal fires on the first page load — capture it,
    // then auto-dismiss it on every later load so it doesn't sit over the other screenshots.
    await page.goto(`/deputy-${DIVISION.toLowerCase()}`);
    await expect(page.locator('.swal2-popup')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(SHOTS_DIR, '00-deputy-acknowledgment.png'), fullPage: true });
    await page.click('button.swal2-confirm');
    await page.addLocatorHandler(
      page.locator('button.swal2-confirm', { hasText: 'I understand' }),
      async (el) => { await el.click(); },
    );

    // Dashboard — division map + stat cards + district table
    await page.goto(`/deputy-${DIVISION.toLowerCase()}`);
    await expect(page.locator('h1').filter({ hasText: `${DIVISION} Division` })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1200); // let the choropleth render
    await shot(page, 'deputy-dashboard');

    // Districts list — searchable / sortable / status-filtered table
    await page.goto(`/deputy-${DIVISION.toLowerCase()}/districts`);
    await expect(page.locator('h1').filter({ hasText: 'Districts' })).toBeVisible();
    await expect(page.locator('td', { hasText: DISTRICT }).first()).toBeVisible({ timeout: 15000 });
    await shot(page, 'deputy-districts-list');

    // One district's shop-level figures + the review panel
    await page.goto(`/deputy-${DIVISION.toLowerCase()}/districts/${encodeURIComponent(DISTRICT)}`);
    await expect(page.locator('h1').filter({ hasText: DISTRICT })).toBeVisible();
    await expect(page.locator('td', { hasText: 'AG0001' }).first()).toBeVisible({ timeout: 15000 });
    await shot(page, 'deputy-district-figures');

    // "Looks correct" sign-off — the confirmation dialog, then the recorded state
    await page.click('button:has-text("Looks correct")');
    await expect(page.locator('.swal2-title', { hasText: `Mark ${DISTRICT} as reviewed?` })).toBeVisible();
    await page.fill('.swal2-textarea', 'Figures cross-checked against the district register.');
    await shot(page, 'deputy-review-dialog');
    await page.click('button.swal2-confirm');

    await expect(page.locator('text=Last recorded')).toBeVisible({ timeout: 10000 });
    await shot(page, 'deputy-review-recorded');

    console.log(`Saved ${shotIndex} deputy screenshots to ${SHOTS_DIR}`);
  });
});
