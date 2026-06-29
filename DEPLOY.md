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
  │
  ├── auth via Clerk magic-link (email)
  │
  └── API calls → up-excise-spatial-revenue-optimizer.*.workers.dev  (Hono API Worker)
                          │
                          └── Cloudflare D1 database
```

Both are Cloudflare Workers. No Pages. No other hosting.

---

## GitHub Actions Secrets Required

Go to your GitHub repo → Settings → Secrets and variables → Actions → New repository secret.

| Secret Name | Where to get it | Notes |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | [CF Dashboard → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) → Create Token → "Edit Cloudflare Workers" template | Required for `wrangler deploy` in CI |
| `CLOUDFLARE_ACCOUNT_ID` | CF Dashboard → right sidebar shows Account ID | `4d93d751987b8d9ff101445570e72711` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard → API Keys | Starts with `pk_test_` or `pk_live_` |

Once these 3 secrets are set, every push to `main` auto-deploys both Workers.

---

## Worker Secrets (already set, update when keys rotate)

These are set via `wrangler secret put` and never go in any file:

```bash
# Set from apps/worker/ directory
pnpm --filter worker exec wrangler secret put CLERK_SECRET_KEY
pnpm --filter worker exec wrangler secret put CLERK_WEBHOOK_SIGNING_SECRET
```

---

## Clerk Webhook Setup (complete this to enable audit log)

1. Go to [Clerk Dashboard](https://dashboard.clerk.com) → Webhooks → Add Endpoint
2. URL: `https://up-excise-spatial-revenue-optimizer.shubhanraj2002.workers.dev/api/webhooks/clerk`
3. Select events: `session.created`, `session.ended`, `session.revoked`, `user.updated`, `user.created`
4. Copy the signing secret (`whsec_...`)
5. Run: `pnpm --filter worker exec wrangler secret put CLERK_WEBHOOK_SIGNING_SECRET`

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

Fill in `apps/worker/.dev.vars` and `apps/web/.env.local` with your keys (see example files).

---

## Admin Account

`shubhanraj2002@gmail.com` is provisioned as admin.
To log in: visit the portal URL → enter your email → check inbox for magic link.

To add more admins, use the Admin Portal → Provision page, or via Clerk Dashboard → Users → Edit public metadata → set `{ "role": "admin" }`.
