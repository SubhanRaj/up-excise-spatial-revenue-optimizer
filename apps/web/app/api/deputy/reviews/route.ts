import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districts, auditLog } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

type Review = { verdict: string; note: string; at: number; actorName: string | null };

// M-102 — latest deputy_district_reviewed per district in the signed-in deputy's division.
// Soft status only (ages out of the 45-day audit window), used to show "already reviewed" on
// the dashboard. audit_log is capped by that retention so the eventType scan stays cheap.
async function GET_(): Promise<NextResponse> {
  const user = await getSession();
  if (!user || user.role !== 'deputy' || !user.division) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const [dRows, events] = await Promise.all([
    db.select({ name: districts.name }).from(districts).where(eq(districts.division, user.division)).all(),
    db.select({
      districtName: auditLog.districtName, metadata: auditLog.metadata,
      actorName: auditLog.actorName, createdAt: auditLog.createdAt,
    }).from(auditLog).where(eq(auditLog.eventType, 'deputy_district_reviewed')).all(),
  ]);

  const inDivision = new Set(dRows.map((r) => r.name));
  const latest: Record<string, Review> = {};
  for (const e of events) {
    if (!e.districtName || !inDivision.has(e.districtName)) continue;
    const at = e.createdAt.getTime();
    if (latest[e.districtName] && latest[e.districtName]!.at >= at) continue;
    let verdict = '', note = '';
    try { const m = JSON.parse(e.metadata ?? '{}') as { verdict?: string; note?: string }; verdict = m.verdict ?? ''; note = m.note ?? ''; } catch { /* keep blanks */ }
    latest[e.districtName] = { verdict, note, at, actorName: e.actorName };
  }

  return NextResponse.json({ reviews: latest });
}

export const GET = withErrorHandling('deputy/reviews:GET', GET_);
