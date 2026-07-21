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

## DEO User Manual — Screenshot Walkthrough & PDF Generation

Two additional Playwright specs (`apps/web/tests/manual-screenshots.spec.ts` and `apps/web/tests/build-manual-pdf.spec.ts`) generate the bilingual (English/Hindi) DEO User Manual at `docs/manual/DEO-User-Manual.pdf`, screenshotting the real portal UI end to end rather than mocking it up. `docs/manual/screenshots/*.png` are the raw captures; the PDF is built from them via Chromium's own print-to-PDF (`page.pdf()`) — no new dependency, no external PDF library.

Since the removed-from-prod Demo District (see "Manual CUG Login Test" above) can no longer be used, this walkthrough runs against a real seeded district (**Agra**) on a local D1 instance instead, with the test/superadmin account's `deo_id`/`district_name` temporarily repointed at it — never against prod.

**Critical gotcha found while building this — `pnpm --filter web dev` (plain `next dev`) has no D1 binding.** `next dev` alone cannot satisfy `getCloudflareContext()` — any route touching D1 throws, which is invisible in the manual click-through UI test in TEST.md above only because that flow was never actually exercised against a fresh `next dev` process during this discovery (magic-link verify silently 500'd). Screenshotting/PDF generation must instead run against the **real built worker** via the OpenNext Cloudflare preview server, which has proper D1/secret bindings:

```bash
# 1. Build the worker (once, or after any code change)
cd apps/web && npx @opennextjs/cloudflare build

# 2. Provide dummy local-only secrets — .dev.vars is gitignored, never commit it.
#    SUPERADMIN_EMAIL_HASH here must be the SHA-256 hex of whatever test email you use
#    to insert the magic link (see manual-screenshots.spec.ts for the exact flow).
cat > apps/web/.dev.vars <<'EOF'
SESSION_SECRET=local-dev-only-session-secret-not-real
API_SECRET=local-dev-only-api-secret-not-real
RESEND_API_KEY=local-dev-only-not-real
RESEND_FROM_EMAIL=noreply@example.local
SUPERADMIN_EMAIL_HASH=<sha256 of your test email>
DEMO_CUG=0000000000
EOF

# 3. Run the preview server (real D1 + secret bindings, unlike `next dev`)
npx @opennextjs/cloudflare preview   # → http://localhost:8787

# 4. Seed a real district's row + point the test account at it (local D1 only), e.g. Agra —
#    see manual-screenshots.spec.ts's header comment for the exact SQL used.

# 5. Capture screenshots, then build the PDF
PLAYWRIGHT_TEST_BASE_URL=http://localhost:8787 SUPERADMIN_TEST_EMAIL=<your test email> \
  npx playwright test tests/manual-screenshots.spec.ts
npx playwright test tests/build-manual-pdf.spec.ts
```

`playwright.config.ts`'s `baseURL` now reads `PLAYWRIGHT_TEST_BASE_URL` (falls back to `http://localhost:3000`) so both the plain-`next-dev` demo above and this worker-preview walkthrough can coexist without editing the config each time.

**Real bug found and fixed during this work:** `getSession()` (`apps/web/src/lib/auth.ts`) hardcoded the superadmin-bypass session's `districtName` to the literal `'Demo District'` regardless of the account's actual assigned district — inconsistent with `api/auth/verify/route.ts`'s own `user.districtName ?? 'Demo District'` fallback used at login time. Since Demo District no longer exists in prod (M-22 cleanup), this silently broke the superadmin bypass account's ability to reach any DEO page in production. Fixed to `row.districtName ?? 'Demo District'`, matching the verify route's own logic.

Screenshots and the PDF are committed to the repo (`docs/manual/`) so the manual can be regenerated or handed to DEOs without re-running the walkthrough.

