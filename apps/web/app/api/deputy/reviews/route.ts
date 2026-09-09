import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districts, divisionLocks } from '@excise/schema';
import { latestDeputyReviews, divisionLockBlockers } from '@/lib/division-lock';
import { withErrorHandling } from '@/lib/with-error-handling';

// M-102/M-103 — latest deputy_district_reviewed per district in the signed-in deputy's
// division, plus this division's lock state and (if not locked) what still blocks locking it.
async function GET_(): Promise<NextResponse> {
  const user = await getSession();
  if (!user || user.role !== 'deputy' || !user.division) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const [dRows, allReviews, lock] = await Promise.all([
    db.select({ name: districts.name, status: districts.status })
      .from(districts).where(eq(districts.division, user.division)).all(),
    latestDeputyReviews(db),
    db.select().from(divisionLocks).where(eq(divisionLocks.division, user.division)).get(),
  ]);

  const inDivision = new Set(dRows.map((r) => r.name));
  const reviews = Object.fromEntries(Object.entries(allReviews).filter(([name]) => inDivision.has(name)));
  const { notVerified, notReviewedOk } = divisionLockBlockers(dRows, allReviews);

  return NextResponse.json({
    reviews,
    divisionLock: lock ? { lockedAt: lock.lockedAt.getTime(), lockedBy: lock.lockedBy, note: lock.note } : null,
    eligibleToLock: dRows.length > 0 && notVerified.length === 0 && notReviewedOk.length === 0,
    blockers: { notVerified, notReviewedOk },
  });
}

export const GET = withErrorHandling('deputy/reviews:GET', GET_);
