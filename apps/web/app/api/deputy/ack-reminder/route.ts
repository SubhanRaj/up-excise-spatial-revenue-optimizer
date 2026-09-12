import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { auditLog } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

// Deputy counterpart of POST /api/districts/[district]/ack-fy-reminder — logs that the
// signed-in Deputy Excise Commissioner clicked "I understand" on the review-responsibility
// modal (apps/web/app/(deputy)/layout.tsx). The modal still shows on every full page load —
// this route only writes once per deputy: it checks for an existing
// deputy_reminder_acknowledged row keyed by this deputy's deoId (unique per deputy, `DEC-
// <DIVISION>`, see scripts/seed-deputy-accounts.ts) first, and skips the insert if one exists.
async function POST_(req: NextRequest): Promise<NextResponse> {
  const user = await getSession();
  if (!user || user.role !== 'deputy' || !user.division) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const existing = await db.select({ id: auditLog.id }).from(auditLog)
    .where(and(eq(auditLog.eventType, 'deputy_reminder_acknowledged'), eq(auditLog.deoId, user.deoId ?? '')))
    .limit(1);
  if (existing.length === 0) {
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
  }

  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandling('deputy/ack-reminder:POST', POST_);
