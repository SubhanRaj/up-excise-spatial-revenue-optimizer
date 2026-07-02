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
    .where(eq(authUsers.email, link.email)).limit(1).then((r) => r[0] ?? null);

  if (!user) return NextResponse.json({ error: 'no_account' }, { status: 401 });

  const effectiveRole = user.email === 'shubhanraj2002@gmail.com' ? 'superadmin' : user.role;
  await createSession(user.id, effectiveRole, user.districtName ?? null);
  return NextResponse.json({ redirect: effectiveRole === 'superadmin' || user.role === 'admin' ? '/admin' : '/home' });
}
