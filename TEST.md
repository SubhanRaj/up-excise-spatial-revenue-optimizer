# E2E Automation Demo

This repository includes a full automated end-to-end demo using Playwright. This script simulates a real user navigating the entire app locally. It uses Chromium (Chrome) to click through the UI automatically, allowing you to visually verify the entire platform lifecycle without manual testing.

## What the Demo Does
1. **Initializes the Environment**: Clears and seeds your local development database (`pnpm seed:demo --local`) to ensure everything is in a clean state.
2. **Superadmin Login**: Programmatically generates a magic link and logs in securely using the developer email (`shubhanraj2002@gmail.com`).
3. **Creates a Unit**: Navigates to `/units` and creates a brand-new sector (`Test Sector <timestamp>`).
4. **Generates Excel Data**: Programmatically generates a 3-sheet Excel workbook in the exact template format requested (using the unified 2-column coordinate layout) and fills it with sample data.
5. **Uploads Data**: Navigates to `/upload` and simulates a file-picker to upload the generated `.xlsx` file.
6. **Verifies and Submits**: Proceeds to the verification table (`/verify`), waits for the UI to display the successfully parsed rows, and hits "Submit District".
7. **Admin Dashboard Validation**: Navigates into the `/admin` portal to confirm the upload was recorded successfully.

## How to Run the Demo

The automation runs entirely against your local `http://localhost:3000` instance and local SQLite D1. **It will NOT hit Cloudflare limits or interact with production.**

To trigger the demo run, simply open a terminal in your project root and follow these two steps:

1. **Start the local server** (if not already running):
   ```bash
   pnpm dev
   ```

2. **In a new terminal window, run the automated demo:**
   ```bash
   pnpm --filter web run test:e2e
   ```

The script is set to run with `--headed` mode via `package.json`, which means a Chrome browser window will pop up automatically. You will see the cursor flying through the application, performing every step from login to upload and final submission.

## Security & Database Resets (PII Hashing)

Since the platform employs zero-knowledge plaintext emails (saving only SHA-256 hashes for DEOs in the database), the login flow hashes inputs on-the-fly.

If you ever manually modify the schema or want to test email hashing logic on a clean slate, you can reset all databases and re-seed the hashed values using:

```bash
# Reset & Seed Local Environment
pnpm seed:demo --reset-all --local
pnpm seed:districts -- --local
pnpm seed:demo --local

# Reset & Seed Production (Remote) Environment
pnpm --filter web exec wrangler d1 execute up-excise-spatial-revenue-optimizer-prod --remote --file=../../reset.sql
pnpm --filter web exec wrangler d1 migrations apply up-excise-spatial-revenue-optimizer-prod --remote
pnpm seed:districts
pnpm seed:demo
```
