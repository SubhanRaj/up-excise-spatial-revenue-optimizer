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

  // A number entered under the wrong login tab (`expect` from LoginForm) must not create a
  // session for whatever role the number actually holds. The response is byte-for-byte the
  // same as an unrecognised number — same body, same status, same rate-limit accounting — so
  // the check leaks nothing about whether the number is registered or what role it has. Only
  // a `superadmin` (derived below from the email hash, not the row's role) is let past a
  // 'deo' expectation, since that account signs in through the DEO tab.
  const superadminHash = env.SUPERADMIN_EMAIL_HASH || '3d7c1aa91263a2c5b1ed9bc4233205aa2907cdacbb3afcc4eaf09d666bd42610';
  const roleMismatch = user != null && expectRole != null && user.role !== expectRole
    && !(expectRole === 'deo' && user.emailHash === superadminHash);
  if (!user || roleMismatch) return NextResponse.json({ error: 'Invalid CUG number' }, { status: 401 });

  const isSuper = superadminHash && user.emailHash === superadminHash;
  const effectiveRole = isSuper ? 'superadmin' : user.role;
  const effectiveDistrict = user.districtName ?? null;

  await createSession(user.id, effectiveRole, effectiveDistrict);
  await db.insert(auditLog).values({
    eventType: 'login_cug',
    deoId: user.deoId ?? '',
    districtName: effectiveDistrict,
    ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
    userAgent: req.headers.get('User-Agent') ?? null,
    metadata: null,
    actorName: effectiveRole === 'deo' ? null : user.name,
    actorDesignation: effectiveRole === 'deo' ? null : user.designation,
    createdAt: new Date(),
  });

  const redirect = user.role === 'deputy' ? deputyBasePath(user.division)
    : (effectiveRole === 'superadmin' || user.role === 'admin') ? '/admin'
    : '/home';
  return NextResponse.json({ redirect });
}

export const POST = withErrorHandling('auth/verify-cug:POST', POST_);
