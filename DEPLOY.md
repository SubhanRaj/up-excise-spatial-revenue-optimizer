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
- `/login` — public, unauthenticated entry point (Clerk `<SignIn routing="hash" />`)
- `/` — root redirector: reads Clerk role from JWT, sends `admin` → `/admin`, everyone else → `/home`
- `/home` — DEO portal (role: `deo`)
- `/admin` — Admin/HQ portal (role: `admin`)

**Auth pattern:**
- All pages use `auth()` from `@clerk/nextjs/server` — parses JWT locally, no Clerk backend API call. Works on CF edge.
- Never use `currentUser()` — it makes a Clerk API call that is unreliable on CF Workers edge runtime.
- Sign-out is client-side: `useClerk().signOut({ redirectUrl: '/login' })`. There is no `/api/auth/signout` route.
- `middleware.ts` uses manual `userId` check (not `auth.protect()`) to avoid `?redirect_url=` appended to redirect URLs.

---

## CI/CD — GitHub Actions

### When runs trigger

Both CI and Deploy only trigger when source files change. Docs/config-only pushes skip both entirely.

| Trigger | CI (typecheck + tests) | Deploy |
|---|---|---|
| Push to `main` — source files changed | ✅ runs | ✅ runs |
| Push to `main` — docs/config only | skipped | skipped |
| Manual dispatch → `both` | — | deploys portal + worker |
| Manual dispatch → `portal` | — | deploys portal only |
| Manual dispatch → `worker` | — | deploys worker only |

**Source paths that trigger CI:** `apps/**`, `packages/**`, `pnpm-lock.yaml`, `package.json`, `.github/workflows/ci.yml`

**Source paths that trigger Deploy:** `apps/web/app/**`, `apps/web/public/**`, `apps/web/package.json`, `apps/web/wrangler.jsonc`, `apps/web/open-next.config.ts`, `apps/worker/src/**`, `apps/worker/package.json`, `apps/worker/wrangler.toml`, `packages/schema/src/**`

**To manually trigger a deploy:** GitHub → Actions → Deploy → Run workflow → choose target.

### Required GitHub Actions Secrets

Go to repo → Settings → Secrets and variables → Actions.

| Secret | Source | Notes |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | CF Dashboard → My Profile → API Tokens | "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | CF Dashboard → right sidebar | `4d93d751987b8d9ff101445570e72711` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard → API Keys | `pk_test_*` (dev instance) |

All 3 already set.

---

## Worker Secrets (set via wrangler, never in files)

### API Worker (`up-excise-spatial-revenue-optimizer`)

```bash
pnpm --filter worker exec wrangler secret put CLERK_SECRET_KEY
pnpm --filter worker exec wrangler secret put CLERK_WEBHOOK_SIGNING_SECRET
```

### Portal Worker (`up-excise-portal`)

```bash
npx wrangler secret put CLERK_SECRET_KEY --name up-excise-portal
```

`CLERK_SECRET_KEY` must be on **both** Workers. Missing it on the portal causes 500 on every page load.

---

## Clerk Configuration

**Instance:** Development (`pk_test_*` / `sk_test_*`). Production instance requires a custom domain — switch when the department's domain is ready.

**Key settings (already applied via `clerk config patch`):**

| Setting | Value | Reason |
|---|---|---|
| `email_link_require_same_client` | `false` | Magic link works from any browser/device, not just where sign-in was initiated |
| Magic-link routing | `routing="hash"` on `<SignIn>` | Prevents 404 at `/login/verify` — verification stays at `/login#...` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/login` | Without this, Clerk redirects to `/sign-in` (not public) → infinite redirect loop |

**Clerk Webhook (already configured):**
- URL: `https://up-excise-spatial-revenue-optimizer.shubhanraj2002.workers.dev/api/webhooks/clerk`
- Events: `session.created`, `session.ended`, `session.revoked`, `user.updated`, `user.created`
- Signing secret: set via `wrangler secret put CLERK_WEBHOOK_SIGNING_SECRET` on the API Worker

---

## Theme System

Dark/light mode is implemented without any React state at the root level to avoid flash on load:

1. An inline `<script>` in `apps/web/app/layout.tsx` runs before first paint, reads `localStorage.getItem('theme')`, and sets `data-theme` on `<html>`. This eliminates the flash.
2. The `ThemeToggle` client component (`app/_components/ThemeToggle.tsx`) toggles `data-theme` on `document.documentElement` and writes to `localStorage`.
3. `data-theme` must only ever be set on `<html>` — never on child `<div>` elements, as that overrides the root and breaks the anti-flash script.
4. Valid theme values: `light` and `dark` only. These are DaisyUI 5 built-in names. Custom names produce no styling.

---

## Local Development

```bash
# Install (Node 24, pnpm 11)
pnpm install

# Apply DB migrations locally
pnpm --filter worker exec wrangler d1 migrations apply up-excise-spatial-revenue-optimizer-dev --local

# Terminal 1 — Hono API on :8787
pnpm --filter worker dev

# Terminal 2 — Next.js on :3000
pnpm --filter web dev
```

**`apps/worker/.dev.vars`** (gitignored):
```
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...
ENVIRONMENT=development
```

**`apps/web/.env.local`** (gitignored):
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_WORKER_URL=http://localhost:8787
CLERK_SECRET_KEY=sk_test_...
```

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

## Test Accounts

| Email | Role | District | Notes |
|---|---|---|---|
| `shubhanraj2002@gmail.com` | `admin` | — | HQ/headquarters account, lands on `/admin` |
| `claudeupexcise@gmail.com` | `deo` | Demo District | Demo DEO account for testing the DEO portal |

To log in: visit portal URL → enter email → check inbox for magic link.

To add more admins: `clerk api /users/<user_id>/metadata -X PATCH -d '{"public_metadata": {"role": "admin"}}'`

To provision a real DEO: same command with `{"role": "deo", "districtName": "<district>"}`.

**Note:** `tailwindcss@4.3.2/dist/lib.min.js` is the Node PostCSS plugin — it does NOT work in a browser. The browser CDN that scans the DOM and generates CSS at runtime is `@tailwindcss/browser@4` from jsDelivr. Never swap these.
