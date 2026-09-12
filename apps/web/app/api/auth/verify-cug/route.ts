import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { authUsers, auditLog } from '@excise/schema';
import { createSession } from '@/lib/auth';
import { deputyBasePath } from '@/lib/deputy';
import { checkIpRateLimit } from '@/lib/rate-limit';
import { withErrorHandling } from '@/lib/with-error-handling';

const CUG_HASH_RE = /^[a-f0-9]{64}$/;
const MAX_ATTEMPTS_PER_WINDOW = 10;

// Frontend hashes the DEO's 10-digit CUG mobile number via Web Crypto SHA-256 before sending
// it here (see src/lib/crypto-client.ts) — the server never sees or stores the raw number.
// Alternate to the magic-link flow in /api/auth/verify, for while RESEND_FROM_EMAIL's domain
// isn't verified and email delivery can't be relied on for login.
async function POST_(req: NextRequest): Promise<NextResponse> {
  const { cugHash, expect } = await req.json() as { cugHash?: unknown; expect?: unknown };
  if (typeof cugHash !== 'string' || !CUG_HASH_RE.test(cugHash)) {
    return NextResponse.json({ error: 'Invalid CUG number' }, { status: 400 });
  }
  const expectRole = expect === 'deo' || expect === 'deputy' ? expect : null;

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  // Per-IP brute-force guard — see the sibling excise-revenue-recovery-portal project's
  // SECURITY.md (H-01). Checked before the DB lookup so a sustained guessing run gets rejected
  // without even touching the auth_users table.
  const allowed = await checkIpRateLimit(db, req, MAX_ATTEMPTS_PER_WINDOW);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many attempts — please try again later.' }, { status: 429 });
  }

  const user = await db.select().from(authUsers).where(eq(authUsers.deoCugHash, cugHash)).limit(1).then((r) => r[0] ?? null);

  const superadminHash = env.SUPERADMIN_EMAIL_HASH || '3d7c1aa91263a2c5b1ed9bc4233205aa2907cdacbb3afcc4eaf09d666bd42610';

  // CUG login mints only field-role sessions (deo, deputy). Every reject below returns the
  // exact same 401 as an unrecognised number — identical body, status, and rate-limit
  // accounting — so nothing is confirmed about whether a number is registered or what it holds.
  //   - admin / superadmin: /admin and every /api/admin/* route stay email-authenticated
  //     only, regardless of what credential a row carries. Such an account signs in through
  //     the magic-link flow (/api/auth/verify), never here.
  //   - wrong login tab: `expect` from LoginForm must match the row's role.
  if (!user
    || user.role === 'admin'
    || user.role === 'superadmin'
    || user.emailHash === superadminHash
    || (expectRole != null && user.role !== expectRole)
  ) {
    return NextResponse.json({ error: 'Invalid CUG number' }, { status: 401 });
  }

  await createSession(user.id, user.role, user.districtName ?? null);
  // Best-effort: the session above is the real login and is already committed. A failure here
  // (e.g. a D1 write-quota blip) must not turn an actual successful login into a 500 — the
  // audit trail is supplementary, not the thing being authorized.
  try {
    await db.insert(auditLog).values({
      eventType: 'login_cug',
      deoId: user.deoId ?? '',
      districtName: user.districtName ?? null,
      ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
      userAgent: req.headers.get('User-Agent') ?? null,
      metadata: null,
      actorName: user.role === 'deo' ? null : user.name,
      actorDesignation: user.role === 'deo' ? null : user.designation,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error('auth/verify-cug: login audit-log insert failed, session already created', err);
  }

  return NextResponse.json({ redirect: user.role === 'deputy' ? deputyBasePath(user.division) : '/home' });
}

export const POST = withErrorHandling('auth/verify-cug:POST', POST_);
