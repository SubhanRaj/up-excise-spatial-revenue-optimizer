import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as crypto from 'crypto';

/**
 * Correctness E2E for the Deputy Excise Commissioner portal (M-102). Runs against local dev D1.
 * Verifies the division data boundary, the audit-only review sign-off, the DEO/deputy route
 * split in middleware, and the uniform CUG-login failure for a wrong-tab number.
 */

const DB = 'up-excise-spatial-revenue-optimizer-prod';
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

// Agra district is in the Agra division; Lucknow is in the Lucknow division.
const IN_DIVISION = 'Agra';
const IN_DIVISION_NAME = 'Agra';
const OUT_OF_DIVISION = 'Lucknow';

const DEPUTY_HASH = sha('deputy-e2e@example.local');
const DEO_HASH = sha('deo-e2e@example.local');
const ADMIN_HASH = sha('admin-e2e@example.local');

// Every district in the Agra division — a division locks only when all of these are
// 'verified' and deputy-reviewed 'ok'.
const AGRA_DIVISION_DISTRICTS = ['Agra', 'Firozabad', 'Mainpuri', 'Mathura'];
const DEPUTY_CUG_HASH = sha('deputy-e2e-cug-0000000000');
const DEO_CUG_HASH = sha('deo-e2e-cug-0000000000');

function d1(sql: string) {
  execSync(`pnpm --filter web exec wrangler d1 execute ${DB} --local --command="${sql.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
}

async function loginAs(page: import('@playwright/test').Page, emailHash: string) {
  const rawToken = crypto.randomUUID();
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  d1(`INSERT INTO auth_magic_links (email_hash, token_hash, expires_at, used) VALUES ('${emailHash}', '${tokenHash}', '${expiresAt}', 0);`);
  await page.goto(`/api/auth/verify?token=${rawToken}`);
}

test.beforeAll(() => {
  d1(
    `INSERT INTO auth_users (email_hash, name, role, deo_id, district_name, division, deo_cug_hash) VALUES ` +
    `('${DEPUTY_HASH}', 'Deputy E2E', 'deputy', 'DEC-E2E', NULL, '${IN_DIVISION}', '${DEPUTY_CUG_HASH}') ` +
    `ON CONFLICT(email_hash) DO UPDATE SET role='deputy', division='${IN_DIVISION}', district_name=NULL, deo_cug_hash='${DEPUTY_CUG_HASH}';`,
  );
  d1(
    `INSERT INTO auth_users (email_hash, name, role, deo_id, district_name, deo_cug_hash) VALUES ` +
    `('${DEO_HASH}', 'DEO E2E', 'deo', 'DEO-AGRA', '${IN_DIVISION_NAME}', '${DEO_CUG_HASH}') ` +
    `ON CONFLICT(email_hash) DO UPDATE SET role='deo', district_name='${IN_DIVISION_NAME}', deo_cug_hash='${DEO_CUG_HASH}';`,
  );
  d1(
    `INSERT INTO auth_users (email_hash, name, role, deo_id, district_name) VALUES ` +
    `('${ADMIN_HASH}', 'Admin E2E', 'admin', 'ADMIN-E2E', NULL) ` +
    `ON CONFLICT(email_hash) DO UPDATE SET role='admin';`,
  );
});

test.describe('deputy division data boundary', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEPUTY_HASH);
  });

  test('GET /api/admin/districts is scoped to the deputy division', async ({ page }) => {
    const res = await page.request.get('/api/admin/districts');
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { districts: { name: string; division: string | null }[] };
    expect(body.districts.length).toBeGreaterThan(0);
    expect(body.districts.every((d) => d.division === IN_DIVISION)).toBeTruthy();
  });

  test('own-division district detail + shops are readable', async ({ page }) => {
    expect((await page.request.get(`/api/admin/districts/${IN_DIVISION_NAME}`)).status()).toBe(200);
    expect((await page.request.get(`/api/admin/districts/${IN_DIVISION_NAME}/shops?pageSize=all`)).status()).toBe(200);
  });

  test('out-of-division district detail + shops are 403', async ({ page }) => {
    expect((await page.request.get(`/api/admin/districts/${OUT_OF_DIVISION}`)).status()).toBe(403);
    expect((await page.request.get(`/api/admin/districts/${OUT_OF_DIVISION}/shops?pageSize=all`)).status()).toBe(403);
  });

  test('GET /api/admin/settings returns only the CARTO key, no statewide counts', async ({ page }) => {
    const body = await (await page.request.get('/api/admin/settings')).json() as Record<string, unknown>;
    expect(body).toHaveProperty('cartoApiKey');
    expect(body.submittedCount).toBe(0);
    expect(body.totalDistricts).toBe(0);
  });

  test('mutating admin routes stay 403 for a deputy', async ({ page }) => {
    expect((await page.request.patch(`/api/admin/districts/${IN_DIVISION_NAME}`, { data: { deoName: 'x' } })).status()).toBe(403);
    expect((await page.request.post(`/api/admin/districts/${IN_DIVISION_NAME}/clear-data`, { data: { reason: 'x' } })).status()).toBe(403);
  });

  test('review sign-off writes one audit row and reads back', async ({ page }) => {
    d1(`DELETE FROM audit_log WHERE district_name='${IN_DIVISION_NAME}' AND event_type='deputy_district_reviewed';`);
    const post = await page.request.post(`/api/deputy/districts/${IN_DIVISION_NAME}/review`, {
      data: { verdict: 'flagged', note: 'e2e check' },
    });
    expect(post.status()).toBe(200);

    const reviews = await (await page.request.get('/api/deputy/reviews')).json() as { reviews: Record<string, { verdict: string; note: string }> };
    expect(reviews.reviews[IN_DIVISION_NAME]?.verdict).toBe('flagged');
    expect(reviews.reviews[IN_DIVISION_NAME]?.note).toBe('e2e check');

    // flagged requires a note
    expect((await page.request.post(`/api/deputy/districts/${IN_DIVISION_NAME}/review`, { data: { verdict: 'flagged' } })).status()).toBe(400);
    // out-of-division review is refused
    expect((await page.request.post(`/api/deputy/districts/${OUT_OF_DIVISION}/review`, { data: { verdict: 'ok' } })).status()).toBe(403);
  });
});

test('M-104: a DEO verifies their own district the moment it is submitted (no round gate)', async ({ page }) => {
  d1(`UPDATE districts SET status='submitted' WHERE name='${IN_DIVISION_NAME}';`);
  await loginAs(page, DEO_HASH);

  const res = await page.request.post(`/api/districts/${IN_DIVISION_NAME}/verify`, { data: { submittedByName: 'Sunil Verma' } });
  expect(res.status()).toBe(200);

  const status = await (await page.request.get(`/api/districts/${IN_DIVISION_NAME}/status`)).json() as { districtStatus: string; verificationPhaseOpen?: unknown };
  expect(status.districtStatus).toBe('verified');
  expect(status).not.toHaveProperty('verificationPhaseOpen');
});

test.describe('division lock hierarchy (M-103)', () => {
  function setDivisionEligible() {
    for (const d of AGRA_DIVISION_DISTRICTS) {
      d1(`UPDATE districts SET status='verified' WHERE name='${d}';`);
      d1(`DELETE FROM audit_log WHERE district_name='${d}' AND event_type='deputy_district_reviewed';`);
      d1(`INSERT INTO audit_log (event_type, deo_id, district_name, metadata, actor_name, created_at) VALUES ('deputy_district_reviewed', 'DEC-E2E', '${d}', '{"verdict":"ok","note":""}', 'Deputy E2E', ${Date.now()});`);
    }
  }
  function clearLock() {
    d1(`DELETE FROM division_locks WHERE division='${IN_DIVISION}';`);
  }

  test.beforeEach(() => { clearLock(); setDivisionEligible(); });
  test.afterAll(() => {
    clearLock();
    for (const d of AGRA_DIVISION_DISTRICTS) {
      d1(`DELETE FROM audit_log WHERE district_name='${d}' AND event_type='deputy_district_reviewed';`);
    }
  });

  test('deputy locks the division once every district is verified + signed off', async ({ page }) => {
    await loginAs(page, DEPUTY_HASH);

    // name is required
    expect((await page.request.post(`/api/deputy/divisions/${IN_DIVISION}/lock`, { data: {} })).status()).toBe(400);

    const lock = await page.request.post(`/api/deputy/divisions/${IN_DIVISION}/lock`, { data: { lockedByName: 'Ramesh Chand' } });
    expect(lock.status()).toBe(200);

    const reviews = await (await page.request.get('/api/deputy/reviews')).json() as { divisionLock: { lockedBy: string } | null; eligibleToLock: boolean };
    expect(reviews.divisionLock?.lockedBy).toBe('Ramesh Chand');

    // locking again is refused
    expect((await page.request.post(`/api/deputy/divisions/${IN_DIVISION}/lock`, { data: { lockedByName: 'Ramesh Chand' } })).status()).toBe(409);
  });

  test('lock is refused while any district is not verified', async ({ page }) => {
    d1(`UPDATE districts SET status='submitted' WHERE name='Firozabad';`);
    await loginAs(page, DEPUTY_HASH);
    const res = await page.request.post(`/api/deputy/divisions/${IN_DIVISION}/lock`, { data: { lockedByName: 'Ramesh Chand' } });
    expect(res.status()).toBe(409);
    const body = await res.json() as { notVerified: string[] };
    expect(body.notVerified).toContain('Firozabad');
    d1(`UPDATE districts SET status='verified' WHERE name='Firozabad';`);
  });

  test('a locked division blocks a DEO self-service unlock request', async ({ page }) => {
    await loginAs(page, DEPUTY_HASH);
    await page.request.post(`/api/deputy/divisions/${IN_DIVISION}/lock`, { data: { lockedByName: 'Ramesh Chand' } });

    await loginAs(page, DEO_HASH);
    const req = await page.request.post(`/api/districts/${IN_DIVISION_NAME}/request-unlock`, { data: { reason: 'fix a shop' } });
    expect(req.status()).toBe(409);
    const get = await (await page.request.get(`/api/districts/${IN_DIVISION_NAME}/request-unlock`)).json() as { divisionLocked: boolean };
    expect(get.divisionLocked).toBe(true);
  });

  test('only an admin can unlock a division; a deputy cannot', async ({ page }) => {
    await loginAs(page, DEPUTY_HASH);
    await page.request.post(`/api/deputy/divisions/${IN_DIVISION}/lock`, { data: { lockedByName: 'Ramesh Chand' } });

    // deputy has no unlock route access
    expect((await page.request.delete(`/api/admin/divisions/${IN_DIVISION}/lock`, { data: { note: 'x' } })).status()).toBe(403);

    await loginAs(page, ADMIN_HASH);
    expect((await page.request.delete(`/api/admin/divisions/${IN_DIVISION}/lock`, { data: {} })).status()).toBe(400); // note required
    expect((await page.request.delete(`/api/admin/divisions/${IN_DIVISION}/lock`, { data: { note: 'reopening for a correction' } })).status()).toBe(200);
    expect((await page.request.delete(`/api/admin/divisions/${IN_DIVISION}/lock`, { data: { note: 'again' } })).status()).toBe(409); // not locked
  });
});

test('deputy acknowledgment route: deputy 200, DEO 403', async ({ page }) => {
  await loginAs(page, DEPUTY_HASH);
  expect((await page.request.post('/api/deputy/ack-reminder')).status()).toBe(200);
  await loginAs(page, DEO_HASH);
  expect((await page.request.post('/api/deputy/ack-reminder')).status()).toBe(403);
});

test('a DEO session cannot use the deputy review routes', async ({ page }) => {
  await loginAs(page, DEO_HASH);
  expect((await page.request.get('/api/deputy/reviews')).status()).toBe(403);
  expect((await page.request.post(`/api/deputy/districts/${IN_DIVISION_NAME}/review`, { data: { verdict: 'ok' } })).status()).toBe(403);
});

test('middleware keeps the DEO and deputy portals apart', async ({ page }) => {
  await loginAs(page, DEPUTY_HASH);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/deputy/);
  await page.goto('/home');
  await expect(page).toHaveURL(/\/deputy/);

  await loginAs(page, DEO_HASH);
  await page.goto('/deputy-agra');
  await expect(page).toHaveURL(/\/home/);
});

test('CUG login: a number entered under the wrong tab fails exactly like an unknown number', async ({ request }) => {
  const unknown = await request.post('/api/auth/verify-cug', { data: { cugHash: sha('nope'), expect: 'deputy' } });
  const deoUnderDeputyTab = await request.post('/api/auth/verify-cug', { data: { cugHash: DEO_CUG_HASH, expect: 'deputy' } });
  const deputyUnderDeoTab = await request.post('/api/auth/verify-cug', { data: { cugHash: DEPUTY_CUG_HASH, expect: 'deo' } });

  for (const r of [unknown, deoUnderDeputyTab, deputyUnderDeoTab]) {
    expect(r.status()).toBe(401);
    expect((await r.json()).error).toBe('Invalid CUG number');
  }

  // right tab still works
  const deputyOk = await request.post('/api/auth/verify-cug', { data: { cugHash: DEPUTY_CUG_HASH, expect: 'deputy' } });
  expect(deputyOk.status()).toBe(200);
  expect((await deputyOk.json()).redirect).toBe('/deputy-agra');
});
