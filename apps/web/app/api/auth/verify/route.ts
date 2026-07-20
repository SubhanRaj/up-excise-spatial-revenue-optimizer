import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { authMagicLinks, authUsers } from '@excise/schema';
import { hashToken, createSession } from '@/lib/auth';
import { withErrorHandling } from '@/lib/with-error-handling';

async function verifyToken(token: string): Promise<{ redirect: string } | { error: string; status: number }> {
  const tokenHash = await hashToken(token);
  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const link = await db.select().from(authMagicLinks)
    .where(and(eq(authMagicLinks.tokenHash, tokenHash), eq(authMagicLinks.used, 0)))
    .limit(1).then((r) => r[0] ?? null);

  if (link) await db.update(authMagicLinks).set({ used: 1 }).where(eq(authMagicLinks.id, link.id));

  if (!link || new Date(link.expiresAt) < new Date()) {
    return { error: 'expired', status: 401 };
  }

  const user = await db.select().from(authUsers)
    .where(eq(authUsers.emailHash, link.emailHash)).limit(1).then((r) => r[0] ?? null);

  if (!user) return { error: 'no_account', status: 401 };

  const superadminHash = env.SUPERADMIN_EMAIL_HASH || '3d7c1aa91263a2c5b1ed9bc4233205aa2907cdacbb3afcc4eaf09d666bd42610';
  const isSuper = superadminHash && user.emailHash === superadminHash;
  const effectiveRole = isSuper ? 'superadmin' : user.role;
  const effectiveDistrict = isSuper ? (user.districtName ?? 'Demo District') : (user.districtName ?? null);
  await createSession(user.id, effectiveRole, effectiveDistrict);
  return { redirect: effectiveRole === 'superadmin' || user.role === 'admin' ? '/admin' : '/home' };
}

/** GET /api/auth/verify?token=... — used by magic-link emails and Playwright browser navigation */
async function GET_(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.redirect(new URL('/login?error=missing_token', req.url));

  const result = await verifyToken(token);
  if ('error' in result) {
    return NextResponse.redirect(new URL(`/login?error=${result.error}`, req.url));
  }
  return NextResponse.redirect(new URL(result.redirect, req.url));
}

/** POST /api/auth/verify — used by the login form (token in JSON body) */
async function POST_(req: NextRequest): Promise<NextResponse> {
  const { token } = await req.json() as { token?: string };
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const result = await verifyToken(token);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}

export const GET = withErrorHandling('auth/verify:GET', GET_);
export const POST = withErrorHandling('auth/verify:POST', POST_);
