# E2E Automation Demo

See also [docs/app-flow.md](docs/app-flow.md) for Mermaid diagrams of the auth flow, DEO workflow, admin data loading, and API error handling.

This repository includes a full automated end-to-end demo using Playwright. The script simulates a real user navigating the entire app locally. It uses Chromium (Chrome) to click through the UI automatically, allowing you to visually verify the entire platform lifecycle without manual testing.

## What the Demo Does
1. **Seeds the database** — runs `pnpm seed:demo -- --local` to upsert the single owner account (`shubhanraj2002@gmail.com`) with `deo_id` and `district_name = Demo District`, and populates 1 500 realistic shops.
2. **Superadmin login** — programmatically inserts a magic link (`email_hash`, not plaintext email) into the local D1, then navigates to `GET /api/auth/verify?token=...` which issues a session cookie and redirects.
3. **Creates a Unit** — navigates to `/units` and creates a brand-new sector (`Test Sector <timestamp>`).
4. **Generates Excel data** — programmatically generates a 1-sheet Excel workbook in the exact template format (2-column decimal coordinate layout) filled with sample data.
5. **Uploads data** — navigates to `/upload` and simulates a file-picker to upload the generated `.xlsx` file.
6. **Verifies and Submits** — proceeds to `/verify`, waits for the parsed rows, and clicks **Submit District**.
7. **Admin validation** — navigates to `/admin` to confirm the upload was recorded.

## How to Run the Demo

The automation runs entirely against your local `http://localhost:3000` instance and local SQLite D1. **It will NOT hit Cloudflare limits or interact with production.**

1. **Start the local server** (if not already running):
   ```bash
   pnpm dev:web
   ```

2. **In a new terminal, run the automated demo:**
   ```bash
   pnpm test:e2e
   ```

The script runs with `--headed` mode (configured in `package.json`), so a Chrome window will pop up automatically. You will see the cursor flying through the application, performing every step from login to upload and final submission.

> **Note on pnpm args:** Extra flags for seed scripts must be passed with a double-dash separator: `pnpm seed:demo -- --local` (not `pnpm seed:demo --local`).

## Auth — Single Identity

The demo uses **one email** for everything:

| Email | Access |
|---|---|
| `shubhanraj2002@gmail.com` | Admin portal (`/admin`) **and** full DEO portal (`/home`, `/upload`, `/verify`, `/units`) |

The `SUPERADMIN_EMAIL_HASH` worker secret identifies this email. The seed script stores `deo_id = DEO-DEMO-001` and `district_name = Demo District` on the account row so the DEO portal has a real district context.

The magic-link INSERT uses the **SHA-256 hash** of the email (matching the `auth_magic_links.email_hash` column) — raw email is never stored in the DB.

## Auth Verify Route

`/api/auth/verify` handles **both** request methods:

| Method | Used by |
|---|---|
| `GET ?token=...` | Playwright `page.goto()`, magic-link email clicks |
| `POST { token }` | Login form JavaScript fetch |

Both paths issue the same session cookie and redirect to `/admin` or `/home`.

## Security & Database Resets

Since the platform stores only SHA-256 hashes of emails, the login flow hashes inputs on-the-fly. The owner account is **never deleted** by `--truncate` or `--reset-all`; only shop and district data is cleared.

```bash
# Reset & Seed Local Environment
pnpm seed:demo -- --reset-all --local
pnpm seed:districts -- --local
pnpm seed:demo -- --local

# Reset & Seed Production (Remote) Environment
pnpm --filter web exec wrangler d1 execute up-excise-spatial-revenue-optimizer-prod --remote --file=../../reset.sql
pnpm --filter web exec wrangler d1 migrations apply up-excise-spatial-revenue-optimizer-prod --remote
pnpm seed:districts
pnpm seed:demo
```

## Manual CUG Login Test

For manually testing the CUG login path (`/login` → "CUG Mobile (DEO)" tab, the default tab) without a real DEO's number: run `pnpm seed:demo` (prod) or `pnpm seed:demo -- --local` to create the "Demo DEO Officer" `auth_users` row (`deo_id = DEO-DEMO-001`, `district_name = Demo District`) with a test CUG hash set. The raw 10-digit number lives only in the `DEMO_CUG` Cloudflare Worker secret (`wrangler secret put DEMO_CUG --name up-excise-spatial-revenue-optimizer-web`) — never write it into source or docs. This account's `role` is `admin`, so logging in with it lands on `/admin` and can also reach every DEO page (`/home`, `/upload`, `/verify`, `/units`) — one login for testing both portals.

**As of 2026-07-20**, this account and the entire Demo District were deleted from prod D1 as part of go-live cleanup (real campaign use, not demo/test data). It no longer exists in prod — re-run `pnpm seed:demo` to recreate it for testing, and remember to `pnpm seed:demo -- --truncate` (or `--reset-all`) again afterward before real DEO data goes in. The `DEMO_CUG` secret itself is unaffected and still valid whenever the account is re-seeded.

## Sync Button Cooldown

The DEO dashboard **Sync from Server** button enforces a 12-hour cooldown stored in `localStorage['last-sync-time']`. During testing or demos you can reset it instantly with the **Reset** link that appears next to the button while it is in cooldown — no DevTools required.

