import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as os from 'os';

test.describe('E2E Local Demo - Superadmin Bypass & Excel Upload Flow', () => {

  test.beforeAll(() => {
    console.log('Seeding demo data locally...');
    // Seed the database to ensure shubhanraj2002@gmail.com and Demo District exist
    execSync('pnpm run seed:demo --local', { stdio: 'inherit' });
  });

  test('Complete lifecycle: Login, Create Unit, Upload Excel, Verify, Submit', async ({ page }) => {
    test.setTimeout(60000); // Allow up to 60 seconds for this full workflow

    // 1. Generate a magic link directly via wrangler d1 to bypass email delivery
    const rawToken = crypto.randomUUID();
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    
    const insertCmd = `pnpm --filter web exec wrangler d1 execute up-excise-spatial-revenue-optimizer-prod --local --command="INSERT INTO auth_magic_links (email, token_hash, expires_at, used) VALUES ('shubhanraj2002@gmail.com', '${tokenHash}', '${expiresAt}', 0);"`;
    execSync(insertCmd);

    // 2. Login by visiting the verify route
    console.log('Logging in...');
    await page.goto(`/api/auth/verify?token=${rawToken}`);
    
    // As a superadmin, we land on /admin. Let's verify we are in.
    await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible({ timeout: 10000 });

    // 3. Navigate to DEO Units page to create a sector
    console.log('Navigating to DEO portal...');
    await page.goto('/units');
    await expect(page.locator('h2').filter({ hasText: 'Manage Circles & Sectors' })).toBeVisible();

    // Create a new sector for testing
    const testSector = `Test Sector ${Date.now()}`;
    await page.fill('input[placeholder="e.g. Sector A or Circle 1"]', testSector);
    await page.selectOption('select', 'sector');
    await page.click('button:has-text("Add Unit")');
    // Ensure it appears in the list
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

    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, row]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Entry');
    XLSX.writeFile(wb, excelPath);

    // 5. Navigate to Upload and upload the Excel file
    console.log('Uploading Excel...');
    await page.goto('/upload');
    await expect(page.locator('h2').filter({ hasText: 'Upload Excel Data' })).toBeVisible();
    
    const fileInput = await page.$('input[type="file"]');
    await fileInput?.setInputFiles(excelPath);
    await page.click('button:has-text("Upload & Preview")');

    // Proceed to verify
    await page.click('a:has-text("Proceed to verification")');

    // 6. Verify Page
    console.log('Verifying and submitting district...');
    await expect(page.locator('h2').filter({ hasText: 'Verify & Submit' })).toBeVisible();
    // Wait for the rows to render
    await expect(page.locator('td', { hasText: 'TSHOP001' })).toBeVisible();
    await expect(page.locator('td', { hasText: 'Test Model Shop' })).toBeVisible();
    
    // Submit District
    await page.click('button:has-text("Submit District")');
    // Confirm SweetAlert success modal
    await expect(page.locator('h2#swal2-title')).toHaveText('District submitted!', { timeout: 15000 });
    await page.click('button:has-text("OK")');

    // 7. Verify in Admin Portal
    console.log('Checking Admin Dashboard...');
    await page.goto('/admin');
    // Ensure it doesn't redirect
    await expect(page.locator('h1').filter({ hasText: 'Dashboard' })).toBeVisible();

    console.log('E2E Demo completed successfully!');
  });
});
