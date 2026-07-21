import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districtCirclesSectors, districtUnlockRequests, auditLog } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

async function POST_(req: NextRequest): Promise<NextResponse> {
  const user = await getSession();
  if (!user || !['admin', 'superadmin'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as { id?: number; action?: 'approve' | 'deny'; note?: string };
  if (typeof body.id !== 'number') return NextResponse.json({ error: 'id is required' }, { status: 400 });
  if (body.action !== 'approve' && body.action !== 'deny') {
    return NextResponse.json({ error: 'action must be approve or deny' }, { status: 400 });
  }
  const note = (body.note ?? '').trim();
  if (!note) return NextResponse.json({ error: 'A note is required' }, { status: 400 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const [request] = await db.select().from(districtUnlockRequests)
    .where(eq(districtUnlockRequests.id, body.id)).limit(1).all();
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  // Re-checked here rather than trusted from a stale client list — prevents a double-resolve
  // race (two admins, or one admin double-clicking).
  if (request.status !== 'pending') {
    return NextResponse.json({ error: 'This request was already resolved' }, { status: 409 });
  }

  const now = new Date();
  const resolvedBy = user.name;
  const approve = body.action === 'approve';

  await db.batch([
    db.update(districtUnlockRequests).set({
      status: approve ? 'approved' : 'denied',
      resolvedAt: now,
      resolvedBy,
      adminNote: note,
    }).where(eq(districtUnlockRequests.id, body.id)),
    ...(approve ? [db.delete(districtCirclesSectors).where(eq(districtCirclesSectors.districtName, request.districtName))] : []),
    db.insert(auditLog).values({
      eventType: approve ? 'units_unlocked' : 'unlock_request_denied',
      deoId: user.deoId ?? '',
      districtName: request.districtName,
      ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
      userAgent: req.headers.get('User-Agent') ?? null,
      metadata: JSON.stringify({ note }),
      actorName: user.name,
      actorDesignation: user.designation,
      createdAt: now,
    }),
  ]);

  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandling('admin/unlock-requests/resolve:POST', POST_);
