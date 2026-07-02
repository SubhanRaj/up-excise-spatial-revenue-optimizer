# Deployment Guide — UP Excise Spatial Revenue Optimizer

## Live URL

| Service | URL |
|---|---|
| **Portal + API (single CF Worker)** | https://up-excise-spatial-revenue-optimizer-web.shubhanraj2002.workers.dev |
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

## CI/CD — GitHub Actions

Deploys automatically on push to `main` when source files change.

**Workflow:** `.github/workflows/deploy.yml`

| Job | Trigger | Steps |
|---|---|---|
| `check` | Every push to `main` | `pnpm typecheck && pnpm test` |
| `deploy-portal` | After `check` passes | `opennextjs-cloudflare build && deploy` |

**Source paths (deploy trigger):** `apps/web/app/**`, `apps/web/src/**`, `apps/web/public/**`, `apps/web/package.json`, `apps/web/wrangler.jsonc`, `packages/schema/src/**`

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
| `RESEND_FROM_EMAIL` | Sender address (`onboarding@resend.dev` until custom domain) |
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

Note: wrangler tracks applied migrations by **filename**, not content. If `0001_initial.sql` is ever edited in place again (rather than adding a new numbered file), `migrations apply` will report "No migrations to apply!" even though the SQL changed — force-apply with `npx wrangler d1 execute up-excise-spatial-revenue-optimizer-prod --remote --file=migrations/0001_initial.sql` instead.

After migrating, seed the district reference data (idempotent, safe to re-run):
```bash
pnpm seed:districts   # all 75 districts + 18 divisions + bbox, from up-districts.geojson
```

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

| Email | Role | Notes |
|---|---|---|
| `shubhanraj2002@gmail.com` | `admin` | HQ account, lands on `/admin` |
| `shubhanraj2002+deo@gmail.com` | `deo` | Demo DEO, district: Lucknow |

**Provision a DEO** (via admin UI or direct D1 insert):
```sql
INSERT INTO auth_users (email, name, role, deo_id, district_name)
VALUES ('deo@example.gov.in', 'DEO Name', 'deo', 'DEO-XXX-001', 'District Name');
```

Or use the admin portal's **District Master** page (`/admin/provision`) — either the per-district edit drawer (`PATCH /api/admin/districts/[district]`, where coordinates and vend counts can be explicitly cleared to `null` if needed) for a single DEO, or bulk Excel upload (`POST /api/admin/bulk-provision`) for many at once.

---

## Demo Data & DB Management

The seed script at `scripts/seed-demo.ts` populates **Demo District** (Lucknow) with 1500 realistic shops covering all five shop types.

| Command | Effect |
|---|---|
| `pnpm seed:demo` | Seed Demo District into prod D1 (idempotent) |
| `pnpm seed:demo -- --excel-only` | Regenerate Excel demo file only |
| `pnpm seed:demo -- --truncate` | Remove Demo District data from prod D1 |
| `pnpm seed:demo -- --reset-all` | **Truncate ALL tables** (use before real campaign) |
| `pnpm seed:demo -- --local` | Seed into local D1 dev DB |

**Excel demo file:** `docs/templates/demo-district-data.xlsx`

---

## Local Development

```bash
pnpm install

# Dev server (Next.js on :3000)
pnpm --filter web dev
```

No `.env.local` required — secrets are CF Worker Secrets, not env vars. `getCloudflareContext()` works locally via `wrangler dev` bindings. For magic links in local dev, check Resend dashboard for delivered emails.
