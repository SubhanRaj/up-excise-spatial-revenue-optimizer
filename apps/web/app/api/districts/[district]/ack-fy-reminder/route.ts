import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { getSession } from '@/lib/auth';
import { auditLog } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

// Logs that the signed-in DEO clicked "I understand" on the FY 2025-26 data reminder modal
// (apps/web/app/(deo)/layout.tsx). Fired once per modal appearance (every full page load,
// by design — see that file's comment on why there's no dismiss-forever flag), so a DEO can
// have several of these rows over time; that's an accountability log, not a one-time flag.
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

  await db.insert(auditLog).values({
    eventType: 'fy_reminder_acknowledged',
    deoId: user.deoId,
    districtName: district,
    ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
    userAgent: req.headers.get('User-Agent') ?? null,
    metadata: null,
    createdAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandling('districts/[district]/ack-fy-reminder:POST', POST_);
