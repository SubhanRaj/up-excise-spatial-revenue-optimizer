# Deployment Guide — UP Excise Portal

## Live URLs

| Service | URL |
|---|---|
| **Portal (Next.js → Cloudflare Worker)** | https://up-excise-portal.shubhanraj2002.workers.dev |
| **API Worker (Hono → Cloudflare Worker)** | https://up-excise-spatial-revenue-optimizer.shubhanraj2002.workers.dev |
| **D1 Database** | `up-excise-spatial-revenue-optimizer-prod` (`2955ce2d-8459-45b4-89f4-04afc9e42488`) |

---

## Architecture

```
Browser
  │
  ├── Portal  → up-excise-portal.shubhanraj2002.workers.dev        (Next.js / @opennextjs/cloudflare)
  │               unauthenticated → /login
  │               role: admin    → /admin
  │               role: deo      → /home
  │
  └── API     → up-excise-spatial-revenue-optimizer.shubhanraj2002.workers.dev  (Hono)
                    └── Cloudflare D1  (up-excise-spatial-revenue-optimizer-prod)
```

---

## CI/CD — GitHub Actions

Deploys trigger automatically on push to `main` when source files change. Docs-only pushes are skipped.

| Trigger | CI | Deploy |
|---|---|---|
| Push to `main` — source changed | ✅ | ✅ |
| Push to `main` — docs/config only | skipped | skipped |
| Manual dispatch → `both` | — | portal + worker |
| Manual dispatch → `portal` | — | portal only |
| Manual dispatch → `worker` | — | worker only |

**Source paths (CI):** `apps/**`, `packages/**`, `pnpm-lock.yaml`, `package.json`, `.github/workflows/ci.yml`

**Source paths (Deploy):** `apps/web/app/**`, `apps/web/public/**`, `apps/web/package.json`, `apps/web/wrangler.jsonc`, `apps/web/open-next.config.ts`, `apps/worker/src/**`, `apps/worker/package.json`, `wrangler.toml`, `packages/schema/src/**`

**Manual deploy:** GitHub → Actions → Deploy → Run workflow → choose target.

### GitHub Actions Secrets

Repo → Settings → Secrets and variables → Actions. All three already set.

| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | CF Dashboard → My Profile → API Tokens → "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | CF Dashboard → right sidebar (`4d93d751987b8d9ff101445570e72711`) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard → API Keys |

---

## Worker Secrets

Set via `wrangler secret put` — never committed to files.

**API Worker (`up-excise-spatial-revenue-optimizer`):**
```bash
pnpm --filter worker exec wrangler secret put CLERK_SECRET_KEY
pnpm --filter worker exec wrangler secret put CLERK_WEBHOOK_SIGNING_SECRET
```

**Portal Worker (`up-excise-portal`):**
```bash
npx wrangler secret put CLERK_SECRET_KEY --name up-excise-portal
```

`CLERK_SECRET_KEY` is confirmed set on both Workers. ✓

---

## Manual Deploy (without CI)

```bash
# API Worker
pnpm --filter worker exec wrangler deploy

# Portal Worker
cd apps/web
npx @opennextjs/cloudflare build
npx @opennextjs/cloudflare deploy
```

---

## Clerk Configuration

**Instance:** Development (`pk_test_*` / `sk_test_*`). Switch to production instance when the department domain is ready.

| Setting | Value |
|---|---|
| `email_link_require_same_client` | `false` — magic link works from any device |
| `<SignIn routing>` | `"hash"` — keeps verification at `/login#...`, no 404 at `/login/verify` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/login` — required; missing it causes an infinite redirect loop to `/sign-in` |
| `allowed_origins` | `https://up-excise-portal.shubhanraj2002.workers.dev` — **required** for Clerk JS to load on the deployed portal; without it `clerk.browser.js` returns 404/CORS |

**Webhook (already configured):**
- URL: `https://up-excise-spatial-revenue-optimizer.shubhanraj2002.workers.dev/api/webhooks/clerk`
- Events: `session.created`, `session.ended`, `session.revoked`, `user.updated`, `user.created`
- Signing secret: `wrangler secret put CLERK_WEBHOOK_SIGNING_SECRET` on the API Worker

---

## Accounts

| Email | Role | Notes |
|---|---|---|
| `shubhanraj2002@gmail.com` | `admin` | HQ account, lands on `/admin` |
| `deodemo+clerk_test@up-excise.dev` | `deo` (Demo District) | Clerk test account — use code `424242`, no real email sent |

**Provision a DEO:**
```bash
clerk api /users/<user_id> -X PATCH -d '{"public_metadata": {"role": "deo", "districtName": "<district>"}}'
```

**Promote to admin:**
```bash
clerk api /users/<user_id> -X PATCH -d '{"public_metadata": {"role": "admin"}}'
```

---

## Demo Data & DB Management

The seed script at `scripts/seed-demo.ts` populates **Demo District** with 1500 realistic shops covering all five shop types (MODEL_SHOP × 300, COMPOSITE_SHOP × 150, PRV × 200, BHANG_SHOP × 150, COUNTRY_LIQUOR × 625, COUNTRY_LIQUOR+CL5CC × 75). It also writes the matching Excel file to `docs/templates/demo-district-data.xlsx`.

| Command | Effect |
|---|---|
| `pnpm seed:demo` | Seed Demo District into **prod** D1 (idempotent — clears then re-inserts) |
| `pnpm seed:demo -- --excel-only` | Regenerate Excel demo file only, no D1 writes |
| `pnpm seed:demo -- --truncate` | Remove Demo District data from prod D1 |
| `pnpm seed:demo -- --reset-all` | **Truncate ALL tables** — wipes every row across all districts (use before real campaign) |
| `pnpm seed:demo -- --local` | Seed into local D1 dev DB instead of prod |

**Excel demo file:** `docs/templates/demo-district-data.xlsx`
- 1500 rows, all shop types, decimal-degree coordinates in Lucknow area sub-box
- Use this file to test the DEO upload → parse → verify → submit flow end-to-end with the demo DEO account (`deodemo+clerk_test@up-excise.dev`, code `424242`)

**HQ demo:** After seeding, Demo District appears in the admin dashboard with status `submitted`, full revenue totals, and all 1500 shop records browseable via the district drill-down.

---

## Local Development

```bash
pnpm install

# Terminal 1 — API Worker on :8787
pnpm --filter worker dev

# Terminal 2 — Portal on :3000
pnpm --filter web dev
```

**`apps/worker/.dev.vars`** (gitignored):
```
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...
```

**`apps/web/.env.local`** (gitignored):
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_WORKER_URL=http://localhost:8787
CLERK_SECRET_KEY=sk_test_...
```
