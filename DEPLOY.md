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
