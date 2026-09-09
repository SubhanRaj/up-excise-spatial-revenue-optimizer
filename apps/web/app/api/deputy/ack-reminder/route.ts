import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { getSession } from '@/lib/auth';
import { auditLog } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

// Deputy counterpart of POST /api/districts/[district]/ack-fy-reminder — logs that the
// signed-in Deputy Excise Commissioner clicked "I understand" on the review-responsibility
// modal (apps/web/app/(deputy)/layout.tsx). Fired once per full page load, not once ever;
// it's an accountability log, not a dismiss-forever flag.
async function POST_(req: NextRequest): Promise<NextResponse> {
  const user = await getSession();
  if (!user || user.role !== 'deputy' || !user.division) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  await db.insert(auditLog).values({
    eventType: 'deputy_reminder_acknowledged',
    deoId: user.deoId ?? '',
    districtName: null,
    ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
    userAgent: req.headers.get('User-Agent') ?? null,
    metadata: JSON.stringify({ division: user.division }),
    actorName: user.name,
    actorDesignation: user.designation,
    createdAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandling('deputy/ack-reminder:POST', POST_);
