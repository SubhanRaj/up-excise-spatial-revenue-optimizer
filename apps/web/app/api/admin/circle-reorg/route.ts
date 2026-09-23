import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { asc } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { circleReorgDistricts, circleReorgCircles, circleReorgThanas } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

// Admin/HQ-only, per the Commissioner's own instruction that this proposal is for HQ review
// only — a deputy session gets a 403 here. Static reference data (migrations/0015, loaded once
// by scripts/load-circle-reorg.ts): 75 districts / ~410 circles / ~1510 thanas, all comfortably
// under a single query per table with no pagination needed.
async function GET_(): Promise<NextResponse> {
  const user = await getSession();
  if (!user || !['admin', 'superadmin'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const [districtRows, circleRows, thanaRows] = await Promise.all([
    db.select().from(circleReorgDistricts).orderBy(asc(circleReorgDistricts.districtName)).all(),
    db.select().from(circleReorgCircles).orderBy(asc(circleReorgCircles.districtName)).all(),
    db.select().from(circleReorgThanas).orderBy(asc(circleReorgThanas.districtName)).all(),
  ]);

  return NextResponse.json({
    districts: districtRows,
    circles: circleRows.map((c) => ({
      ...c,
      currentBoundary: c.currentBoundary ? JSON.parse(c.currentBoundary) : null,
      proposedBoundary: c.proposedBoundary ? JSON.parse(c.proposedBoundary) : null,
    })),
    thanas: thanaRows.map((t) => ({
      ...t,
      currentCircleNames: JSON.parse(t.currentCircleNames) as string[],
      boundary: t.boundary ? JSON.parse(t.boundary) : null,
    })),
  });
}

export const GET = withErrorHandling('admin/circle-reorg:GET', GET_);
