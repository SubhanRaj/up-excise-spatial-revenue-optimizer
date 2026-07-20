import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { auditLog } from '@excise/schema';
import { getSession, deleteSession } from '@/lib/auth';
import { withErrorHandling } from '@/lib/with-error-handling';

async function POST_(req: NextRequest): Promise<NextResponse> {
  const user = await getSession();
  await deleteSession();

  if (user) {
    const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
    const db = drizzle(env.DB);
    await db.insert(auditLog).values({
      eventType: 'logout',
      deoId: user.deoId ?? '',
      districtName: user.districtName,
      ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
      userAgent: req.headers.get('User-Agent') ?? null,
      metadata: null,
      actorName: user.role === 'deo' ? null : user.name,
      actorDesignation: user.role === 'deo' ? null : user.designation,
      createdAt: new Date(),
    });
  }

  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandling('auth/logout:POST', POST_);
