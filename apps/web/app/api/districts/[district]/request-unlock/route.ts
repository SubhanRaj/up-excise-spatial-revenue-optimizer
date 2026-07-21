import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districtCirclesSectors, districtUnlockRequests, auditLog } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

const REASON_MAX_LENGTH = 2000;

type Ctx = { params: Promise<{ district: string }> };

// Latest request for the signed-in DEO's own district — lets /units show a pending banner.
async function GET_(_req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { district } = await params;
  if (user.districtName !== district) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  const rows = await db.select()
    .from(districtUnlockRequests)
    .where(eq(districtUnlockRequests.districtName, district))
    .orderBy(districtUnlockRequests.id)
    .all();

  return NextResponse.json({ request: rows.length > 0 ? rows[rows.length - 1] : null });
}

export const GET = withErrorHandling('districts/[district]/request-unlock:GET', GET_);

async function POST_(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { district } = await params;
  if (user.districtName !== district) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { reason?: string };
  const reason = (body.reason ?? '').trim();
  if (!reason) return NextResponse.json({ error: 'A reason is required' }, { status: 400 });
  if (reason.length > REASON_MAX_LENGTH) {
    return NextResponse.json({ error: `Reason must be ${REASON_MAX_LENGTH} characters or fewer` }, { status: 400 });
  }

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const locked = await db.select({ id: districtCirclesSectors.id })
    .from(districtCirclesSectors)
    .where(eq(districtCirclesSectors.districtName, district))
    .limit(1).all();
  if (locked.length === 0) {
    return NextResponse.json({ error: "Your circles/sectors aren't locked — nothing to unlock" }, { status: 409 });
  }

  const pending = await db.select({ id: districtUnlockRequests.id })
    .from(districtUnlockRequests)
    .where(and(eq(districtUnlockRequests.districtName, district), eq(districtUnlockRequests.status, 'pending')))
    .limit(1).all();
  if (pending.length > 0) {
    return NextResponse.json({ error: 'You already have a pending unlock request' }, { status: 409 });
  }

  const now = new Date();
  await db.batch([
    db.insert(districtUnlockRequests).values({
      districtName: district,
      reason,
      status: 'pending',
      requestedByDeo: user.deoId,
      requestedAt: now,
    }),
    db.insert(auditLog).values({
      eventType: 'unlock_requested',
      deoId: user.deoId,
      districtName: district,
      ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
      userAgent: req.headers.get('User-Agent') ?? null,
      metadata: JSON.stringify({ reason }),
      createdAt: now,
    }),
  ]);

  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandling('districts/[district]/request-unlock:POST', POST_);
