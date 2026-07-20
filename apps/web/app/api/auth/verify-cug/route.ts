import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { authUsers, auditLog } from '@excise/schema';
import { createSession } from '@/lib/auth';
import { withErrorHandling } from '@/lib/with-error-handling';

const CUG_HASH_RE = /^[a-f0-9]{64}$/;

// Frontend hashes the DEO's 10-digit CUG mobile number via Web Crypto SHA-256 before sending
// it here (see src/lib/crypto-client.ts) — the server never sees or stores the raw number.
// Alternate to the magic-link flow in /api/auth/verify, for while RESEND_FROM_EMAIL's domain
// isn't verified and email delivery can't be relied on for login.
async function POST_(req: NextRequest): Promise<NextResponse> {
  const { cugHash } = await req.json() as { cugHash?: unknown };
  if (typeof cugHash !== 'string' || !CUG_HASH_RE.test(cugHash)) {
    return NextResponse.json({ error: 'Invalid CUG number' }, { status: 400 });
  }

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const user = await db.select().from(authUsers).where(eq(authUsers.deoCugHash, cugHash)).limit(1).then((r) => r[0] ?? null);
  if (!user) return NextResponse.json({ error: 'Invalid CUG number' }, { status: 401 });

  const superadminHash = env.SUPERADMIN_EMAIL_HASH || '3d7c1aa91263a2c5b1ed9bc4233205aa2907cdacbb3afcc4eaf09d666bd42610';
  const isSuper = superadminHash && user.emailHash === superadminHash;
  const effectiveRole = isSuper ? 'superadmin' : user.role;
  const effectiveDistrict = isSuper ? (user.districtName ?? 'Demo District') : (user.districtName ?? null);

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

  return NextResponse.json({ redirect: effectiveRole === 'superadmin' || user.role === 'admin' ? '/admin' : '/home' });
}

export const POST = withErrorHandling('auth/verify-cug:POST', POST_);
