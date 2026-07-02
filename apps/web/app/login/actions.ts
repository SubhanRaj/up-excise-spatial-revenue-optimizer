'use server';

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, count, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { authUsers, authMagicLinks } from '@excise/schema';
import { hashToken } from '@/lib/auth';
import { sendMagicLinkEmail } from '@/lib/email';

const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  'up-excise-spatial-revenue-optimizer-web.shubhanraj2002.workers.dev',
  'localhost:3000',
]);
const FALLBACK_HOST = 'up-excise-spatial-revenue-optimizer-web.shubhanraj2002.workers.dev';

export async function requestMagicLink(email: string): Promise<{ error?: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) return { error: 'Enter a valid email address.' };

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  
  const { sha256hex } = await import('@/lib/auth');
  const emailHashStr = await sha256hex(trimmed);

  const user = await db.select().from(authUsers).where(eq(authUsers.emailHash, emailHashStr)).limit(1).then((r) => r[0] ?? null);
  // generic message — don't reveal whether email is registered
  if (!user) return { error: 'If that email is registered, a sign-in link has been sent.' };

  // Rate limit: 3 per 15 minutes
  const rateRows = await db
    .select({ cnt: count() })
    .from(authMagicLinks)
    .where(and(
      eq(authMagicLinks.emailHash, emailHashStr),
      sql`${authMagicLinks.createdAt} >= datetime('now', '-15 minutes')`,
    ));
  if ((rateRows[0]?.cnt ?? 0) >= 3) return { error: 'If that email is registered, a sign-in link has been sent.' };

  // Delete unused, unexpired links for this email before creating a fresh one
  await db.delete(authMagicLinks).where(and(eq(authMagicLinks.emailHash, emailHashStr), eq(authMagicLinks.used, 0)));

  const rawToken  = crypto.randomUUID();
  const tokenHash = await hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await db.insert(authMagicLinks).values({ emailHash: emailHashStr, tokenHash, expiresAt, used: 0 });

  const headersList = await headers();
  const rawHost = headersList.get('host') ?? '';
  const host    = ALLOWED_HOSTS.has(rawHost) ? rawHost : FALLBACK_HOST;
  const proto   = host.startsWith('localhost') ? 'http' : 'https';
  const verifyUrl = `${proto}://${host}/auth/verify?token=${rawToken}`;

  await sendMagicLinkEmail(trimmed, verifyUrl, user.name);
  return {};
}
