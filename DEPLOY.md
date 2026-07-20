# Deployment Guide — UP Excise Spatial Revenue Optimizer

See also [docs/app-flow.md](docs/app-flow.md) for Mermaid diagrams of the auth flow, DEO workflow, admin data loading, and API error handling.

## Live URL

| Service | URL |
|---|---|
| **Portal + API (single CF Worker)** | https://sro.exciseup.in — live custom domain as of 2026-07-20 (see "Custom Domain Migration" below). The old `*.workers.dev` URL is disabled — Cloudflare turns it off automatically once a `custom_domain` route exists. |
| **D1 Database** | `up-excise-spatial-revenue-optimizer-prod` (`2955ce2d-8459-45b4-89f4-04afc9e42488`) |

---

## Architecture

```
Browser
  │
  └── up-excise-spatial-revenue-optimizer-web.shubhanraj2002.workers.dev
        │  (Single Cloudflare Worker — Next.js via @opennextjs/cloudflare)
        │
        ├── Pages: /login, /auth/verify, /home, /upload, /verify, /units
        │          /admin, /admin/provision, /admin/audit, /admin/export
        │          /admin/districts/[district]
        │
        ├── API:  /api/auth/verify, /api/auth/session, /api/auth/logout
        │         /api/upload/chunk, /api/districts/**, /api/admin/**
        │
        └── Cloudflare D1 (up-excise-spatial-revenue-optimizer-prod)
              phase1_raw_collection, districts, district_circles_sectors
              auth_users, auth_magic_links, auth_sessions, audit_log
```

---

## Custom Domain Migration — `sro.exciseup.in`

The Worker is planned to move from the `*.workers.dev` URL to `sro.exciseup.in` ("SRO" = Spatial Revenue Optimizer — deliberately distinct branding from the sibling `excise-revenue-recovery-portal` project, which already uses "Excise Portal" naming). Cloudflare's "Add a Site" onboarding only accepts root/registrable domains, not bare subdomains, so this requires moving the whole `exciseup.in` zone's DNS to Cloudflare — not just delegating the subdomain.

**Why this needs care:** `exciseup.in` also carries Google Workspace email (MX + SPF on the root) and was DNSSEC-signed. The root domain itself is just a disposable default Squarespace landing page — nothing to preserve there. Resend's magic-link sending domain lives under `mail.exciseup.in`.

### Migration steps

1. **Disable DNSSEC first, at the registrar** (Squarespace → Domains → `exciseup.in` → DNS Settings → DNSSEC → off), confirming the DS record is removed at the `.in` registry. Skipping this breaks resolution mid-migration for validating resolvers.
2. **Cloudflare dashboard → Add a Site → `exciseup.in`** (root domain). Let it auto-scan existing records, then manually cross-check the scan against what's actually live before cutover — auto-scan is not guaranteed complete.
3. **Squarespace → Domains → exciseup.in → DNS Settings → Nameservers** → replace the Google nameservers (`ns-cloud-d1..d4.googledomains.com`) with the two Cloudflare-assigned ones.
4. Wait for the Cloudflare zone to show **Active**.
5. **Verify immediately** — `dig MX exciseup.in`, `dig TXT exciseup.in` (SPF), `dig TXT _dmarc.exciseup.in`, and the Resend record(s) under `mail.exciseup.in` — against pre-migration values. Send a real test email and confirm Resend still delivers.
6. **Re-enable DNSSEC** via Cloudflare (DNS → DNSSEC → Enable) and add the new DS record back at Squarespace's registrar panel.
7. Add the Worker custom domain: Workers & Pages → `up-excise-spatial-revenue-optimizer-web` → Settings → Domains & Routes → Add → `sro.exciseup.in`. Once confirmed live, add to `apps/web/wrangler.jsonc`:
   ```jsonc
   "routes": [{ "pattern": "sro.exciseup.in", "custom_domain": true }]
   ```
   so it's deployed via CI like every other config, not a manual dashboard-only setting.
8. Test `https://sro.exciseup.in/api/healthz`, then a real CUG login and a real admin magic-link login end to end.

### Known issue hit during migration (2026-07-20)

Cloudflare's DNS auto-scan did **not** correctly preserve `mail.exciseup.in` — it was originally a `CNAME → ext-sq.squarespace.com` (DNS-only, not proxied) and came out the other side as a proxied `A` record pointing at Cloudflare's edge IPs instead, with no CNAME/MX/TXT under that hostname anymore. Google Workspace's root MX/SPF/DMARC all survived the scan correctly — only the `mail` subdomain was affected. If Resend shows the domain as unverified after a migration, go to Cloudflare's DNS tab for `exciseup.in`, find the `mail` record, and restore it to a `CNAME` → `ext-sq.squarespace.com`, DNS-only (gray cloud, not proxied).

### Code touchpoint

`apps/web/app/login/actions.ts` has an `ALLOWED_HOSTS` allowlist (open-redirect guard) that builds the URL inside magic-link emails. `sro.exciseup.in` is already added there and set as `FALLBACK_HOST`, ahead of the DNS work being finished, so no further code change is needed once the domain goes live.

---

## CI/CD — GitHub Actions

Deploys automatically on push to `main` when source files change.

**Workflow:** `.github/workflows/deploy.yml`

| Job | Trigger | Steps |
|---|---|---|
| `check` | Every push to `main` | `pnpm typecheck && pnpm test` |
| `deploy-portal` | After `check` passes | `opennextjs-cloudflare build && deploy` |

**Source paths (deploy trigger):** `apps/web/app/**`, `apps/web/src/**`, `apps/web/public/**`, `apps/web/package.json`, `apps/web/wrangler.jsonc`, `packages/schema/src/**`

### ⚠️ Mandatory Type Check Before Push
Before committing and pushing code to GitHub (which triggers the CI deployment), AI Agents and Developers **must** run `pnpm typecheck` locally and ensure it passes. Next.js App Router enforces strict typing in the build pipeline. Failing to type check locally will break the CI build. Always verify locally first.

### GitHub Actions Secrets

Repo → Settings → Secrets and variables → Actions. Both already set.

| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | CF Dashboard → My Profile → API Tokens → "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | CF Dashboard → right sidebar |

---

## Worker Secrets

Set via `wrangler secret put` — never committed to files. All confirmed set on `up-excise-spatial-revenue-optimizer-web`.

| Secret | Purpose |
|---|---|
| `SESSION_SECRET` | HMAC-SHA256 signing key for `excise-session` cookie |
| `API_SECRET` | Reserved (not currently used) |
| `RESEND_API_KEY` | Resend email delivery for magic links |
| `RESEND_FROM_EMAIL` | Sender address — `noreply@mail.exciseup.in` (verified custom domain) |
| `SUPERADMIN_EMAIL_HASH` | SHA-256 hash of the superadmin email for emergency/testing access |

To rotate a secret:
```bash
echo "new-value" | npx wrangler secret put SESSION_SECRET --name up-excise-spatial-revenue-optimizer-web
```

---

## D1 Migrations

Migration files live in `migrations/` at repo root. `wrangler.jsonc` points at `../../migrations`.

```bash
# List applied migrations
npx wrangler d1 migrations list up-excise-spatial-revenue-optimizer-prod --remote

# Apply pending migrations
npx wrangler d1 migrations apply up-excise-spatial-revenue-optimizer-prod --remote
```

Applied migrations:
- `0001_initial.sql` — single consolidated migration: phase1_raw_collection, districts, district_circles_sectors, audit_log, auth_users, auth_magic_links, auth_sessions (all 7 tables, matches `packages/schema` exactly)
- `0002_add_deo_cug_hash.sql` — adds `auth_users.deo_cug_hash` (unique, nullable) for CUG-number login as an alternate to magic-link email
- `0003_add_designation.sql` — adds `auth_users.designation` (nullable) for admin navbar name/designation display
- `0004_add_audit_actor_identity.sql` — adds `audit_log.actor_name`/`actor_designation` (nullable) so admin-initiated audit rows show who did it, not just a blank `deo_id`

Note: wrangler tracks applied migrations by **filename**, not content. If `0001_initial.sql` is ever edited in place again (rather than adding a new numbered file), `migrations apply` will report "No migrations to apply!" even though the SQL changed — force-apply with `npx wrangler d1 execute up-excise-spatial-revenue-optimizer-prod --remote --file=migrations/0001_initial.sql` instead.

After migrating, seed the district reference data (idempotent, safe to re-run):
```bash
pnpm seed:districts   # all 75 districts + 18 divisions + bbox, from up-districts.geojson
```

Then seed real DEO accounts (idempotent, upserts by email hash):
```bash
pnpm seed:deo-accounts   # email hash + CUG hash, from scripts/data/deo-contact.csv + deo-emails.csv
```
Source CSVs contain raw PII (mobile numbers, emails) — they're gitignored and must be placed at `scripts/data/deo-contact.csv` / `deo-emails.csv` locally before running; never commit them. The script hashes both fields before any D1 write (per SECURITY.md's Zero-Knowledge PII rule) and skips any district missing either a valid CUG or an email. DEO *names* are written as an English placeholder (`"<District> DEO"`) since the source sheet's names are in Hindi and this project's Data Language rule requires English-only stored data — correct real names via the admin District Master page (`/admin/provision`).

---

## Manual Deploy (without CI)

Run from `apps/web`:

```bash
cd apps/web

# Build
pnpm exec opennextjs-cloudflare build

# Deploy
pnpm exec opennextjs-cloudflare deploy
```

---

## Auth — Accounts

| Role | Notes |
|---|---|
| Owner / superadmin bypass | The `SUPERADMIN_EMAIL_HASH` worker secret identifies the owner's email and grants elevated `role: 'superadmin'` access automatically on login — full access including District Master (`/admin/provision`) and bulk-provisioning. |
| `admin` | Department accounts (Excise Commissioner, Additional Excise Commissioner, Finance Controller) — full admin portal access except District Master, which is superadmin-only. Multiple admin emails are supported; see the "Confirmed Environment Variables" table in CLAUDE.md. |

As of 2026-07-20, all leftover demo/test state was purged from prod D1: the "Demo DEO Officer" account and "Demo District" row were deleted entirely (not just truncated), all audit log rows were cleared, and all test circles/sectors and shop uploads across every district were wiped so the app is fresh for real campaign use. The owner's own `auth_users` row also had its stale `deo_id`/`district_name` (leftover from Demo District) nulled out. The "DEO Portal" quick-switch button was removed from the admin navbar since the demo dual-portal testing account no longer exists.

**Real DEO accounts:** all 75 districts have a real DEO account (`role = 'deo'`) seeded via `pnpm seed:deo-accounts` — see "D1 Migrations" above. Each can sign in via magic-link email or CUG number (see README's Authentication & PII Hashing section).

**Provision a real DEO** (via admin UI or direct D1 insert):
```sql
-- auth_users stores email_hash, not plaintext email
INSERT INTO auth_users (email_hash, name, role, deo_id, district_name)
VALUES ('<sha256_of_email>', 'DEO Name', 'deo', 'DEO-XXX-001', 'District Name');
```

Or use the admin portal's **District Master** page (`/admin/provision`) — either the per-district edit drawer (`PATCH /api/admin/districts/[district]`, where coordinates and vend counts can be explicitly cleared to `null` if needed) for a single DEO, or bulk Excel upload (`POST /api/admin/bulk-provision`) for many at once. This page is restricted to `role: 'superadmin'` — a plain `admin` account gets a restricted message in the UI and a 403 from both routes.

---

## Demo Data & DB Management

The seed script at `scripts/seed-demo.ts` can populate a **Demo District** with 1500 realistic shops covering all five shop types, for exercising the full upload → verify → submit flow. As of 2026-07-20 there is no demo data in prod D1 — it was fully removed (see "Auth — Accounts" above) ahead of going live with real DEOs. Re-run `pnpm seed:demo` only for local/testing purposes, and truncate again afterward before real campaign data goes in.

| Command | Effect |
|---|---|
| `pnpm seed:demo` | Seed Demo District into prod D1 (idempotent) |
| `pnpm seed:demo -- --excel-only` | Regenerate Excel demo file only |
| `pnpm seed:demo -- --truncate` | Remove Demo District rows from prod D1 (owner account is **never** deleted) |
| `pnpm seed:demo -- --reset-all` | **Truncate shop/district tables** — owner account survives (use before real campaign) |
| `pnpm seed:demo -- --local` | Seed into local D1 dev DB |

**Excel demo file:** `docs/templates/demo-district-data.xlsx`

**Testing against a real district (e.g. Lucknow) instead of Demo District:** log in with that district's real DEO CUG, register circles/sectors via `/units`, upload data, verify, and submit — then truncate that district's test data manually before real campaign rollout:
```sql
DELETE FROM phase1_raw_collection WHERE district_name = 'Lucknow';
DELETE FROM district_circles_sectors WHERE district_name = 'Lucknow';
UPDATE districts SET status = 'pending', submitted_at = NULL WHERE name = 'Lucknow';
```

---

## Local Development

```bash
pnpm install

# Dev server (Next.js on :3000)
pnpm --filter web dev
```

No `.env.local` required — secrets are CF Worker Secrets, not env vars. `getCloudflareContext()` works locally via `wrangler dev` bindings. For magic links in local dev, check Resend dashboard for delivered emails.
