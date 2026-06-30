import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { authMagicLinks, authUsers } from '@excise/schema';
import { hashToken, createSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) redirect('/login');

  const tokenHash = await hashToken(token);
  const { env }   = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db        = drizzle(env.DB);

  const link = await db.select().from(authMagicLinks)
    .where(and(eq(authMagicLinks.tokenHash, tokenHash), eq(authMagicLinks.used, 0)))
    .limit(1).then((r) => r[0] ?? null);

  // Always mark used to prevent reuse attempts
  if (link) await db.update(authMagicLinks).set({ used: 1 }).where(eq(authMagicLinks.id, link.id));

  if (!link || new Date(link.expiresAt) < new Date()) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="card bg-base-100 shadow-xl p-8 w-full max-w-md text-center space-y-4">
          <p className="text-xl font-semibold text-error">Link expired or already used</p>
          <p className="text-sm text-base-content/60">Sign-in links expire after 15 minutes and can only be used once.</p>
          <a href="/login" className="btn btn-primary">Request a new link</a>
        </div>
      </main>
    );
  }

  const user = await db.select().from(authUsers).where(eq(authUsers.email, link.email)).limit(1).then((r) => r[0] ?? null);
  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="card bg-base-100 shadow-xl p-8 w-full max-w-md text-center space-y-4">
          <p className="text-xl font-semibold text-error">Account not found</p>
          <p className="text-sm text-base-content/60">Contact your administrator to have your account provisioned.</p>
          <a href="/login" className="btn btn-primary">Back to login</a>
        </div>
      </main>
    );
  }

  await createSession(user.id, user.role, user.districtName ?? null);
  redirect(user.role === 'admin' ? '/admin' : '/home');
}
