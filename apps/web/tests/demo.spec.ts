import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as crypto from 'crypto';
import ExcelJS from 'exceljs';
import * as path from 'path';
import * as os from 'os';

test.describe('E2E Local Demo - Superadmin Bypass & Excel Upload Flow', () => {

  test.beforeAll(() => {
    console.log('Seeding demo data locally...');
    // Seed the database to ensure the superadmin test account exists
    execSync('pnpm -w run seed:demo -- --local', { stdio: 'inherit' });
  });

  test('Complete lifecycle: Login, Create Unit, Upload Excel, Verify, Submit', async ({ page }) => {
    test.setTimeout(60000); // Allow up to 60 seconds for this full workflow

    // 1. Generate a magic link directly via wrangler d1 to bypass email delivery
    const rawToken = crypto.randomUUID();
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    
    // auth_magic_links uses email_hash — compute SHA-256 of the superadmin's email.
    // Never hardcode the raw address (see CLAUDE.md "Superadmin Configuration").
    const OWNER_EMAIL = process.env.SUPERADMIN_TEST_EMAIL;
    if (!OWNER_EMAIL) throw new Error('SUPERADMIN_TEST_EMAIL env var is required to run this test');
    const emailHash = crypto.createHash('sha256').update(OWNER_EMAIL.trim().toLowerCase()).digest('hex');

    const insertCmd = `pnpm --filter web exec wrangler d1 execute up-excise-spatial-revenue-optimizer-prod --local --command="INSERT INTO auth_magic_links (email_hash, token_hash, expires_at, used) VALUES ('${emailHash}', '${tokenHash}', '${expiresAt}', 0);"`;
    execSync(insertCmd);

    // 2. Login via GET /api/auth/verify?token=... (Playwright navigates; route handles GET)
    console.log('Logging in...');
    await page.goto(`/api/auth/verify?token=${rawToken}`);
    
    // As a superadmin, we land on /admin. Let's verify we are in.
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator('div').filter({ hasText: 'Headquarters Dashboard' }).first()).toBeVisible({ timeout: 10000 });

    // 3. Navigate to DEO Units page and register one sector via the count → name wizard
    console.log('Navigating to DEO portal...');
    await page.goto('/units');
    await expect(page.locator('h2').filter({ hasText: 'Circles & Sectors' })).toBeVisible();

    const testSector = `Test Sector ${Date.now()}`;
    await page.fill('input[aria-label="Number of sectors"]', '1');
    await page.click('button:has-text("Continue")');
    await page.fill('input[aria-label="Sector 1 name"]', testSector);
    await page.click('button:has-text("Submit & Lock")');
    // SweetAlert2 confirmation before the one-shot, irreversible submit
    await page.click('button:has-text("Yes, Lock & Submit")');
    // Ensure it appears in the locked read-only list
    await expect(page.locator(`text=${testSector}`)).toBeVisible();

    // 4. Generate a mock Excel file targeting our new sector
    console.log('Generating dummy Excel upload...');
    const tmpDir = os.tmpdir();
    const excelPath = path.join(tmpDir, 'test-upload.xlsx');

    const TEMPLATE_HEADERS = [
      'circle_sector_name', 'thana_name', 'adjacent_thanas_raw',
      'shop_id', 'shop_name', 'shop_type', 'has_cl5cc',
      'latitude', 'longitude',
      'license_fee_lf', 'basic_license_fee_blf',
      'mgr_amount', 'composite_lf_fl', 'composite_lf_beer',
      'composite_mgr_fl', 'composite_mgr_beer', 'mgq_quantity',
      'consideration_fee', 'special_beer_lf', 'special_beer_mgr',
    ];

    // Create one valid MODEL_SHOP row
    const row = [
      testSector, 'Gomti Nagar', '',
      'TSHOP001', 'Test Model Shop', 'MODEL_SHOP', 0,
      26.85, 81.0, // DD coordinates directly in the new 2-column format
      100000, 0,
      200000, 0, 0,
      0, 0, 0,
      0, 0, 0
    ];

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data Entry');
    ws.addRow(TEMPLATE_HEADERS);
    ws.addRow(row);
    await wb.xlsx.writeFile(excelPath);

    // 5. Navigate to Upload and upload the Excel file
    console.log('Uploading Excel...');
    await page.goto('/upload');
    await expect(page.locator('h2').filter({ hasText: 'Upload District Excel' })).toBeVisible();
    
    const fileInput = await page.$('input[type="file"]');
    await fileInput?.setInputFiles(excelPath);

    // Proceed to verify
    await page.click('a:has-text("Go to Verify →")');

    // 6. Verify Page
    console.log('Verifying and submitting district...');
    await expect(page.locator('h2').filter({ hasText: 'Verify & Submit' })).toBeVisible();
    // Wait for the rows to render
    await expect(page.locator('td', { hasText: 'TSHOP001' })).toBeVisible();
    await expect(page.locator('td', { hasText: 'Test Model Shop' })).toBeVisible();
    
    // Submit District — SweetAlert2 confirmation, then the success modal
    await page.click('button:has-text("Submit District")');
    await page.click('button:has-text("Yes, Submit")');
    await expect(page.locator('h2#swal2-title')).toHaveText('District submitted!', { timeout: 15000 });
    await page.click('button:has-text("OK")');

    // 7. Verify in Admin Portal
    console.log('Checking Admin Dashboard...');
    await page.goto('/admin');
    // Ensure it doesn't redirect
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator('div').filter({ hasText: 'Headquarters Dashboard' }).first()).toBeVisible({ timeout: 10000 });

    console.log('E2E Demo completed successfully!');
  });
});
