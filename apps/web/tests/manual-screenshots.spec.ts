import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as crypto from 'crypto';
import ExcelJS from 'exceljs';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * Not a correctness test — walks the real DEO (and a bit of admin) UI end to end against the
 * local dev D1 and saves a numbered screenshot at each step. docs/manual/build-pdf.mjs turns
 * these into the bilingual DEO User Manual PDF. Run against `--local` D1 only; never prod.
 */

const SHOTS_DIR = path.join(__dirname, '..', '..', '..', 'docs', 'manual', 'screenshots');
const DISTRICT = 'Agra';

let shotIndex = 0;
async function shot(page: import('@playwright/test').Page, name: string) {
  shotIndex += 1;
  const file = path.join(SHOTS_DIR, `${String(shotIndex).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
}

test.describe('DEO Manual — screenshot walkthrough', () => {
  test.beforeAll(() => {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
  });

  test('walk the full DEO flow and capture screenshots', async ({ page }) => {
    test.setTimeout(90000);

    // Login page — captured as-is, unauthenticated, so the manual shows the real CUG/Email UI.
    await page.goto('/login');
    await expect(page.locator('h1, h2').filter({ hasText: /Sign in|Login/i }).first()).toBeVisible({ timeout: 10000 }).catch(() => {});
    await shot(page, 'login-page');

    // Authenticate via a locally-issued magic link (bypasses email delivery) — the test
    // account (auth_users id=1) has been pointed at a real seeded district (Agra) for this
    // walkthrough instead of the removed Demo District. Local D1 only.
    const rawToken = crypto.randomUUID();
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const OWNER_EMAIL = process.env.SUPERADMIN_TEST_EMAIL;
    if (!OWNER_EMAIL) throw new Error('SUPERADMIN_TEST_EMAIL env var is required to run this test');
    const emailHash = crypto.createHash('sha256').update(OWNER_EMAIL.trim().toLowerCase()).digest('hex');
    execSync(
      `pnpm --filter web exec wrangler d1 execute up-excise-spatial-revenue-optimizer-prod --local --command="INSERT INTO auth_magic_links (email_hash, token_hash, expires_at, used) VALUES ('${emailHash}', '${tokenHash}', '${expiresAt}', 0);"`,
    );
    await page.goto(`/api/auth/verify?token=${rawToken}`);

    // /home — Step 1 gate (no units yet)
    await page.goto('/home');
    await expect(page.locator('h1').filter({ hasText: 'Welcome back' })).toBeVisible({ timeout: 10000 });
    await shot(page, 'home-step1-gate');

    // /units — step 1: counts
    await page.goto('/units');
    await expect(page.locator('h2').filter({ hasText: 'Circles & Sectors' })).toBeVisible();
    await shot(page, 'units-step1-counts');

    await page.fill('input[aria-label="Number of sectors"]', '2');
    await page.fill('input[aria-label="Number of circles"]', '2');
    await page.click('button:has-text("Continue")');

    // /units — step 2: names
    await expect(page.locator('h3').filter({ hasText: 'Sectors' })).toBeVisible();
    await shot(page, 'units-step2-names-empty');

    await page.fill('input[aria-label="Sector 1 name"]', 'Sector 1');
    await page.fill('input[aria-label="Sector 2 name"]', 'Sector 2');
    // 2 sectors registered → circle placeholders start at 2, not 1 (Circle 1 is reserved
    // for the sector-covered urban area — see the circleNumber() convention in units/page.tsx)
    await page.fill('input[aria-label="Circle 2 name"]', 'Circle 2 Fatehabad');
    await page.fill('input[aria-label="Circle 3 name"]', 'Circle 3 Kheragarh');
    await shot(page, 'units-step2-names-filled');

    await page.click('button:has-text("Submit & Lock")');
    // SweetAlert2 confirmation before the one-shot, irreversible submit
    await expect(page.locator('text=Lock circles & sectors?')).toBeVisible();
    await shot(page, 'units-confirm-lock');
    await page.click('button:has-text("Yes, Lock & Submit")');

    await expect(page.locator('text=Circles & sectors are locked in.')).toBeVisible({ timeout: 10000 });
    await shot(page, 'units-locked');

    // /home — now Upload/Verify cards appear
    await page.goto('/home');
    await expect(page.locator('h1').filter({ hasText: 'Welcome back' })).toBeVisible();
    await shot(page, 'home-all-steps-unlocked');

    // Download the REAL district template (same generateTemplate() code path a DEO uses) so
    // the manual's "what's in the template" section is read from the actual distributed file,
    // not a hand-maintained copy that could drift from apps/web/src/lib/excel.ts.
    await page.goto('/upload');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Download District Template")'),
    ]);
    const templateSamplePath = path.join(os.tmpdir(), 'excise-manual-template-sample.xlsx');
    await download.saveAs(templateSamplePath);

    // Build a small valid Excel matching the district template layout
    const tmpDir = os.tmpdir();
    const excelPath = path.join(tmpDir, 'manual-demo-upload.xlsx');
    const TEMPLATE_HEADERS = [
      'circle_sector_name', 'thana_name', 'adjacent_thanas_raw',
      'shop_id', 'shop_name', 'shop_type', 'has_cl5cc',
      'latitude', 'longitude',
      'license_fee_lf', 'basic_license_fee_blf',
      'mgr_amount', 'composite_lf_fl', 'composite_lf_beer',
      'composite_mgr_fl', 'composite_mgr_beer', 'mgq_quantity',
      'consideration_fee', 'special_beer_lf', 'special_beer_mgr',
    ];
    const rows = [
      ['Sector 1', 'Hariparvat', '', 'AG0001', 'Sadar Model Shop', 'MODEL_SHOP', 0, 27.18, 78.02, 150000, 0, 300000, 0, 0, 0, 0, 0, 0, 0, 0],
      ['Sector 2', 'Sadar Bazar', 'Hariparvat', 'AG0002', 'Sadar PRV', 'PRV', 0, 27.19, 78.03, 120000, 0, 200000, 0, 0, 0, 0, 0, 0, 0, 0],
      ['Circle 2 Fatehabad', 'Fatehabad', 'Hariparvat', 'AG0003', 'Fatehabad Country Liquor', 'COUNTRY_LIQUOR', 1, 27.05, 78.25, 0, 180000, 0, 0, 0, 0, 0, 3000, 60000, 120000, 90000],
      // adjacent_thanas_raw demonstrates the comma-separated, multi-name format DEOs must use —
      // each Thana name may itself contain spaces (e.g. "Sadar Bazar"); names are separated by
      // a comma, optionally followed by a space, e.g. "Fatehabad, Hariparvat, Sadar Bazar".
      ['Circle 3 Kheragarh', 'Kheragarh', 'Fatehabad, Hariparvat, Sadar Bazar', 'AG0004', 'Kheragarh Bhang Shop', 'BHANG_SHOP', 0, 26.85, 77.95, 90000, 0, 0, 0, 0, 0, 0, 5000, 0, 0, 0],
    ];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data Entry');
    ws.addRow(TEMPLATE_HEADERS);
    for (const r of rows) ws.addRow(r);
    await wb.xlsx.writeFile(excelPath);

    // /upload
    await page.goto('/upload');
    await expect(page.locator('h2').filter({ hasText: 'Upload District Excel' })).toBeVisible();
    await shot(page, 'upload-empty');

    const fileInput = await page.$('input[type="file"]');
    await fileInput?.setInputFiles(excelPath);
    await page.waitForTimeout(1000);
    await shot(page, 'upload-parsed');

    await page.click('a:has-text("Go to Verify →")');

    // /verify
    await expect(page.locator('h2').filter({ hasText: 'Verify & Submit' })).toBeVisible();
    await expect(page.locator('td', { hasText: 'AG0001' })).toBeVisible();
    await shot(page, 'verify-rows');

    await page.click('button:has-text("Submit District")');
    await expect(page.locator('text=Yes, Submit')).toBeVisible();
    await shot(page, 'verify-confirm-submit');
    await page.click('button:has-text("Yes, Submit")');
    await expect(page.locator('h2#swal2-title')).toHaveText('District submitted!', { timeout: 15000 });
    await shot(page, 'verify-submitted');
    await page.click('button:has-text("OK")');

    // Admin side: District Master / district detail showing the submitted district
    await page.goto(`/admin/districts/${encodeURIComponent(DISTRICT)}`);
    await expect(page).toHaveURL(/\/admin\/districts\//);
    await page.waitForTimeout(1000);
    await shot(page, 'admin-district-detail');

    // Now request an unlock as the DEO, to capture that flow too
    await page.goto('/units');
    await expect(page.locator('text=Circles & sectors are locked in.')).toBeVisible();
    await page.click('button:has-text("Request Unlock")');
    await expect(page.locator('text=Request unlock?')).toBeVisible();
    await shot(page, 'units-request-unlock-dialog');
    await page.fill('textarea', 'Entered wrong circle name — need to correct "Circle 4 Kheragarh" spelling.');
    await page.click('button:has-text("Submit Request")');
    await expect(page.locator('text=Unlock request pending Admin review.')).toBeVisible({ timeout: 10000 });
    await shot(page, 'units-unlock-pending');

    // Admin resolves the unlock request
    await page.goto('/admin/unlock-requests');
    await expect(page.locator('h1').filter({ hasText: 'Unlock Requests' })).toBeVisible();
    await page.waitForTimeout(1000);
    await shot(page, 'admin-unlock-requests-list');

    console.log(`Saved ${shotIndex} screenshots to ${SHOTS_DIR}`);
  });
});
