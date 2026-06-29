# Deployment Guide — UP Excise Portal

## Live URLs

| Service | URL | Status |
|---|---|---|
| **Portal (Next.js)** | https://up-excise-portal.shubhanraj2002.workers.dev | ✅ Live |
| **API Worker (Hono)** | https://up-excise-spatial-revenue-optimizer.shubhanraj2002.workers.dev | ✅ Live |
| **D1 Dev DB** | `up-excise-spatial-revenue-optimizer-dev` (`587198fb-4541-41c6-9cde-29088729ed45`) | ✅ Migrated |
| **D1 Prod DB** | `up-excise-spatial-revenue-optimizer-prod` (`2955ce2d-8459-45b4-89f4-04afc9e42488`) | ✅ Migrated |

---

## Architecture

```
Browser
  │
  ├── loads UI from  up-excise-portal.*.workers.dev          (Next.js via @opennextjs/cloudflare)
  │     unauthenticated → /login   (clean redirect, no ?redirect_url= query param)
  │
  ├── auth via Clerk magic-link (email)
  │
  └── API calls → up-excise-spatial-revenue-optimizer.*.workers.dev  (Hono API Worker)
                          │
                          └── Cloudflare D1 database
```

Both are Cloudflare Workers. No Cloudflare Pages. No other hosting.

**Route structure:**
- `/login` — public, unauthenticated entry point (Clerk `<SignIn />`)
- `/` — root redirector: reads Clerk role, sends `admin` → `/admin`, everyone else → `/home`
- `/home` — DEO portal (role: `deo`)
- `/admin` — Admin/HQ portal (role: `admin`)

---

## GitHub Actions Secrets Required

Go to your GitHub repo → Settings → Secrets and variables → Actions → New repository secret.

| Secret Name | Where to get it | Notes |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | CF Dashboard → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template | Required for `wrangler deploy` in CI |
| `CLOUDFLARE_ACCOUNT_ID` | CF Dashboard → right sidebar | `4d93d751987b8d9ff101445570e72711` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard → API Keys | Starts with `pk_live_` |

All 3 are already set. Every push to `main` auto-deploys both Workers via `.github/workflows/deploy.yml`.

---

## Worker Secrets

Set via `wrangler secret put` — never in any file or `wrangler.toml`.

### API Worker (`up-excise-spatial-revenue-optimizer`)

```bash
pnpm --filter worker exec wrangler secret put CLERK_SECRET_KEY
pnpm --filter worker exec wrangler secret put CLERK_WEBHOOK_SIGNING_SECRET
```

Already set. Update only when keys rotate.

### Portal Worker (`up-excise-portal`)

```bash
# From apps/web/ directory (or use --name flag from anywhere)
npx wrangler secret put CLERK_SECRET_KEY --name up-excise-portal
```

`CLERK_SECRET_KEY` is required by the Next.js Clerk middleware (`clerkMiddleware` in `middleware.ts`) for server-side session validation. Must be set on **both** Workers — the portal for middleware auth, the API Worker for route guards and webhook verification.

Already set. Update when the key rotates.

---

## Clerk Webhook (already configured)

- **URL:** `https://up-excise-spatial-revenue-optimizer.shubhanraj2002.workers.dev/api/webhooks/clerk`
- **Events:** `session.created`, `session.ended`, `session.revoked`, `user.updated`, `user.created`
- **Signing secret:** Set via `wrangler secret put CLERK_WEBHOOK_SIGNING_SECRET` on the API Worker

To update the signing secret after rotating it in Clerk Dashboard:
```bash
pnpm --filter worker exec wrangler secret put CLERK_WEBHOOK_SIGNING_SECRET
```

---

## Local Development

```bash
# Install dependencies
pnpm install

# Apply DB migrations locally
pnpm --filter worker exec wrangler d1 migrations apply up-excise-spatial-revenue-optimizer-dev --local

# Terminal 1 — Hono API on :8787
pnpm --filter worker dev

# Terminal 2 — Next.js on :3000
pnpm --filter web dev
```

### Required local env files

**`apps/worker/.dev.vars`** (gitignored):
```
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...
ENVIRONMENT=development
```

**`apps/web/.env.local`** (gitignored):
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_WORKER_URL=http://localhost:8787
CLERK_SECRET_KEY=sk_live_...
```

`NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login` is critical — without it Clerk redirects unauthenticated requests to `/sign-in` (Clerk default), which is not a public route and causes an infinite redirect loop.

---

## Manual Deploy (without CI)

```bash
# Deploy API Worker
pnpm --filter worker exec wrangler deploy

# Build + deploy portal Worker
cd apps/web
npx @opennextjs/cloudflare build
npx @opennextjs/cloudflare deploy
```

---

## Admin Account

`shubhanraj2002@gmail.com` is provisioned as admin.

To log in: visit the portal URL → enter your email → check inbox for magic link → lands on `/admin`.

To add more admins: Clerk Dashboard → Users → find user → Edit public metadata → set `{ "role": "admin" }`.
