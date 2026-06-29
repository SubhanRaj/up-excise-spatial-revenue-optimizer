# Deployment Guide — UP Excise Portal

> Fill in your credentials below and share this file with Claude to complete deployment.
> **NEVER commit this file with real values filled in — keep it as a template only.**

---

## Credentials Needed

### 1. Clerk (Authentication)
Go to [clerk.com](https://clerk.com) → Your App → API Keys

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_REPLACE_ME
CLERK_SECRET_KEY=sk_live_REPLACE_ME
```

Go to Clerk → Webhooks → Add Endpoint:
- URL: `https://up-excise-spatial-revenue-optimizer.<YOUR_CF_ACCOUNT>.workers.dev/api/webhooks/clerk`
- Select events: `session.created`, `session.ended`, `session.revoked`, `user.updated`, `user.created`
- Copy the signing secret:

```
CLERK_WEBHOOK_SIGNING_SECRET=whsec_REPLACE_ME
```

### 2. Cloudflare (already set up — just verify login)
Run: `wrangler whoami`

---

## Deployment Checklist

Claude will run these once you provide credentials above:

- [ ] `wrangler secret put CLERK_SECRET_KEY`
- [ ] `wrangler secret put CLERK_WEBHOOK_SIGNING_SECRET`
- [ ] `wrangler deploy` → Worker goes live, get Worker URL
- [ ] Cloudflare Pages deployment → Frontend goes live, get Pages URL
- [ ] Update Clerk allowed origins with Pages URL
- [ ] Update Clerk webhook URL with Worker URL

---

## What is already done (no action needed)

- [x] Cloudflare D1 databases created:
  - Dev: `up-excise-spatial-revenue-optimizer-dev` (ID: `587198fb-4541-41c6-9cde-29088729ed45`)
  - Prod: `up-excise-spatial-revenue-optimizer-prod` (ID: `2955ce2d-8459-45b4-89f4-04afc9e42488`)
- [x] Both databases migrated (4 tables, all indexes)
- [x] All 6 milestones code-complete and typechecked
- [x] 12/12 unit tests passing

---

## Post-Deployment: Create Admin Account

After deployment, create the first admin account via Clerk dashboard:
1. Clerk Dashboard → Users → Create user → enter your email
2. Clerk Dashboard → Users → click the user → Edit public metadata:
   ```json
   { "role": "admin" }
   ```
3. Send magic link → login at your Pages URL

---

## Environment Variables for Cloudflare Pages

Set these in Cloudflare Dashboard → Pages → your project → Settings → Environment Variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_...` from Clerk |
| `NEXT_PUBLIC_WORKER_URL` | Worker URL (e.g. `https://up-excise-spatial-revenue-optimizer.YOUR_CF_SUBDOMAIN.workers.dev`) |
