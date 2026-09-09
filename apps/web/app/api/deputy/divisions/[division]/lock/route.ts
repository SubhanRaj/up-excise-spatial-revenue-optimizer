import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districts, divisionLocks, auditLog } from '@excise/schema';
import { latestDeputyReviews, divisionLockBlockers } from '@/lib/division-lock';
import { withErrorHandling } from '@/lib/with-error-handling';

type Ctx = { params: Promise<{ division: string }> };

// M-103 — a Deputy Excise Commissioner locks their own division. Allowed only once every
// district in the division is DEO-verified AND the deputy's latest review on it is 'ok'.
// After this, DEOs in the division can no longer self-request a correction unlock — only
// state HQ (an admin) can, by unlocking the division first.
async function POST_(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getSession();
  if (!user || user.role !== 'deputy' || !user.division) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { division } = await params;
  if (decodeURIComponent(division) !== user.division) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { note?: unknown };
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const [dRows, reviews, existing] = await Promise.all([
    db.select({ name: districts.name, status: districts.status })
      .from(districts).where(eq(districts.division, user.division)).all(),
    latestDeputyReviews(db),
    db.select().from(divisionLocks).where(eq(divisionLocks.division, user.division)).get(),
  ]);

  if (existing) return NextResponse.json({ error: 'This division is already locked' }, { status: 409 });
  if (dRows.length === 0) return NextResponse.json({ error: 'No districts in this division' }, { status: 409 });

  const { notVerified, notReviewedOk } = divisionLockBlockers(dRows, reviews);
  if (notVerified.length || notReviewedOk.length) {
    return NextResponse.json({
      error: 'Every district must be verified by its DEO and signed off by you before the division can be locked',
      notVerified, notReviewedOk,
    }, { status: 409 });
  }

  const now = new Date();
  await db.batch([
    db.insert(divisionLocks).values({ division: user.division, lockedAt: now, lockedBy: user.name, note }),
    db.insert(auditLog).values({
      eventType: 'division_locked',
      deoId: user.deoId ?? '',
      districtName: null,
      ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
      userAgent: req.headers.get('User-Agent') ?? null,
      metadata: JSON.stringify({ division: user.division, note }),
      actorName: user.name,
      actorDesignation: user.designation,
      createdAt: now,
    }),
  ]);

  return NextResponse.json({ ok: true, lockedAt: now.getTime(), lockedBy: user.name, note });
}

export const POST = withErrorHandling('deputy/divisions/[division]/lock:POST', POST_);
