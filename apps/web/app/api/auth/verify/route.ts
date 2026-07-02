import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { authMagicLinks, authUsers } from '@excise/schema';
import { hashToken, createSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { token } = await req.json() as { token?: string };
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const tokenHash = await hashToken(token);
  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const link = await db.select().from(authMagicLinks)
    .where(and(eq(authMagicLinks.tokenHash, tokenHash), eq(authMagicLinks.used, 0)))
    .limit(1).then((r) => r[0] ?? null);

  if (link) await db.update(authMagicLinks).set({ used: 1 }).where(eq(authMagicLinks.id, link.id));

  if (!link || new Date(link.expiresAt) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 401 });
  }

  const user = await db.select().from(authUsers)
    .where(eq(authUsers.emailHash, link.emailHash)).limit(1).then((r) => r[0] ?? null);

  if (!user) return NextResponse.json({ error: 'no_account' }, { status: 401 });

  const superadminHash = env.SUPERADMIN_EMAIL_HASH || '3d7c1aa91263a2c5b1ed9bc4233205aa2907cdacbb3afcc4eaf09d666bd42610';
  const isSuper = superadminHash && user.emailHash === superadminHash;
  const effectiveRole = isSuper ? 'superadmin' : user.role;
  const effectiveDistrict = isSuper ? 'Demo District' : (user.districtName ?? null);
  await createSession(user.id, effectiveRole, effectiveDistrict);
  return NextResponse.json({ redirect: effectiveRole === 'superadmin' || user.role === 'admin' ? '/admin' : '/home' });
}
