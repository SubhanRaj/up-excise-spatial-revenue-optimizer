import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { auditLog } from '@excise/schema';

export interface DeputyReview {
  verdict: string;
  note: string;
  at: number;
  actorName: string | null;
}

// Latest deputy_district_reviewed per district, across the whole (45-day-capped) audit log.
// Callers filter to the districts they care about. Same scan /api/deputy/reviews always ran —
// lifted here so /api/admin/districts and the division-lock route reuse it.
export async function latestDeputyReviews(
  db: DrizzleD1Database,
): Promise<Record<string, DeputyReview>> {
  const events = await db.select({
    districtName: auditLog.districtName, metadata: auditLog.metadata,
    actorName: auditLog.actorName, createdAt: auditLog.createdAt,
  }).from(auditLog).where(eq(auditLog.eventType, 'deputy_district_reviewed')).all();

  const latest: Record<string, DeputyReview> = {};
  for (const e of events) {
    if (!e.districtName) continue;
    const at = e.createdAt.getTime();
    if (latest[e.districtName] && latest[e.districtName]!.at >= at) continue;
    let verdict = '', note = '';
    try {
      const m = JSON.parse(e.metadata ?? '{}') as { verdict?: string; note?: string };
      verdict = m.verdict ?? ''; note = m.note ?? '';
    } catch { /* keep blanks */ }
    latest[e.districtName] = { verdict, note, at, actorName: e.actorName };
  }
  return latest;
}

// A division can be locked once every district in it is DEO-verified ('verified') and the
// deputy's latest sign-off on it is 'ok'. Returns the districts still blocking, split by cause.
export function divisionLockBlockers(
  districtsInDivision: { name: string; status: string }[],
  reviews: Record<string, DeputyReview>,
): { notVerified: string[]; notReviewedOk: string[] } {
  return {
    notVerified: districtsInDivision.filter((d) => d.status !== 'verified').map((d) => d.name),
    notReviewedOk: districtsInDivision.filter((d) => reviews[d.name]?.verdict !== 'ok').map((d) => d.name),
  };
}
