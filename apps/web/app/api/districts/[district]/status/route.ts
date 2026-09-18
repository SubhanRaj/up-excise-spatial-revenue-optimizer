import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districtCirclesSectors, phase1RawCollection, districts } from '@excise/schema';
import { latestDeputyReviews } from '@/lib/division-lock';
import { withErrorHandling } from '@/lib/with-error-handling';


async function GET_(
  _req: NextRequest,
  { params }: { params: Promise<{ district: string }> },
): Promise<NextResponse> {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { district } = await params;
  if (user.districtName !== district) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const [units, uploaded, districtRow, deputyReviews] = await Promise.all([
    db.select({ name: districtCirclesSectors.name }).from(districtCirclesSectors)
      .where(eq(districtCirclesSectors.districtName, district)).all(),
    db.select({ circleSectorName: phase1RawCollection.circleSectorName, rowCount: count(phase1RawCollection.id) })
      .from(phase1RawCollection).where(eq(phase1RawCollection.districtName, district))
      .groupBy(phase1RawCollection.circleSectorName).all(),
    db.select({ status: districts.status, deoName: districts.deoName, fyDataClearedAt: districts.fyDataClearedAt }).from(districts).where(eq(districts.name, district)).get(),
    latestDeputyReviews(db),
  ]);

  const uploadedMap = Object.fromEntries(uploaded.map((u) => [u.circleSectorName, u.rowCount]));
  const summary = units.map((u) => ({ name: u.name, rowCount: uploadedMap[u.name] ?? 0 }));
  return NextResponse.json({
    units: summary,
    canSubmit: summary.every((s) => s.rowCount > 0),
    districtStatus: districtRow?.status ?? 'pending',
    // Only meaningful once submitted — see districts.deoName's schema comment and M-53's
    // submit-time write (POST /api/districts/[district]/submit). Before that it's whatever
    // English placeholder an admin set at provisioning (e.g. "Lucknow DEO"), which is not
    // useful to show as "the DEO" on a DEO-facing screen.
    deoName: districtRow?.deoName ?? null,
    // Non-null once an admin has run the one-time FY 2026-27 cleanup for this district (M-101).
    // The DEO layout shows a re-entry banner while this is set and the district is not yet
    // re-submitted, so a DEO who cleared their browser cache still sees why their data is gone.
    fyDataClearedAt: districtRow?.fyDataClearedAt ? districtRow.fyDataClearedAt.getTime() : null,
    // Lets the DEO's final-verification screen show why a district got sent back — previously
    // a Deputy's flagged reason only showed up in the audit log or the admin division page.
    deputyReview: deputyReviews[district] ?? null,
  });
}

export const GET = withErrorHandling('districts/[district]/status:GET', GET_);
