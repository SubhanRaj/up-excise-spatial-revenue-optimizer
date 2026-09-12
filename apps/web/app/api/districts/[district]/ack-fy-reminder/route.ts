import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { auditLog } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

// Logs that the signed-in DEO clicked "I understand" on the FY 2025-26 data reminder modal
// (apps/web/app/(deo)/layout.tsx). The modal itself still shows on every full page load — this
// route only ever writes once per district: it checks for an existing
// fy_reminder_acknowledged row for this district first, and skips the insert if one is already
// there. One acknowledgment on file is enough for accountability; logging every reload wrote a
// row per page load across all 75 districts, a real contributor to hitting D1's account-wide
// write-row cap (see summary.md).
async function POST_(
  req: NextRequest,
  { params }: { params: Promise<{ district: string }> },
): Promise<NextResponse> {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { district } = await params;
  if (user.districtName !== district) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const existing = await db.select({ id: auditLog.id }).from(auditLog)
    .where(and(eq(auditLog.eventType, 'fy_reminder_acknowledged'), eq(auditLog.districtName, district)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(auditLog).values({
      eventType: 'fy_reminder_acknowledged',
      deoId: user.deoId,
      districtName: district,
      ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
      userAgent: req.headers.get('User-Agent') ?? null,
      metadata: null,
      createdAt: new Date(),
    });
  }

  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandling('districts/[district]/ack-fy-reminder:POST', POST_);
