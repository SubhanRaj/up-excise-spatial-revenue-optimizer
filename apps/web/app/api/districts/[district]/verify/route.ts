import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count, sum } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districts, auditLog, appSettings, phase1RawCollection } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

// DEO's final re-confirmation once the state-wide verification round is open (M-60) — moves
// an already-submitted district to 'verified'. Distinct from POST .../submit: this never
// touches shop rows, only the status + a fresh audit trail entry with the DEO's re-confirmed
// name (same liability-disclaimer pattern as the original submit).
async function POST_(
  req: NextRequest,
  { params }: { params: Promise<{ district: string }> },
): Promise<NextResponse> {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { district } = await params;
  if (user.districtName !== district) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { submittedByName?: string };
  const submittedByName = body.submittedByName?.trim();
  if (!submittedByName) return NextResponse.json({ error: 'submittedByName is required' }, { status: 400 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const [settingsRow, districtRow] = await Promise.all([
    db.select().from(appSettings).where(eq(appSettings.id, 1)).get(),
    db.select({ status: districts.status }).from(districts).where(eq(districts.name, district)).get(),
  ]);
  if (!settingsRow?.verificationPhaseOpen) {
    return NextResponse.json({ error: 'The final verification round is not open yet' }, { status: 409 });
  }
  if (districtRow?.status !== 'submitted') {
    return NextResponse.json({ error: `District must be Submitted to verify (currently ${districtRow?.status ?? 'unknown'})` }, { status: 409 });
  }

  // Computed once here, at the moment this district's data becomes immutable, and cached on
  // the districts row — GET /api/admin/districts reads this instead of re-scanning the whole
  // ~30K-row phase1_raw_collection table for a district that can no longer change (see that
  // route's comment).
  const agg = await db.select({
    vendCount: count(phase1RawCollection.id),
    totalRevenue: sum(phase1RawCollection.totalRevenue),
  }).from(phase1RawCollection).where(eq(phase1RawCollection.districtName, district)).get();

  const now = new Date();
  await db.batch([
    db.update(districts).set({
      status: 'verified',
      cachedVendCount: agg?.vendCount ?? 0,
      cachedTotalRevenue: Number(agg?.totalRevenue ?? 0),
    }).where(eq(districts.name, district)),
    db.insert(auditLog).values({
      eventType: 'district_verified',
      deoId: user.deoId,
      districtName: district,
      ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
      userAgent: req.headers.get('User-Agent') ?? null,
      metadata: JSON.stringify({ verifiedAt: now.toISOString(), submittedByName }),
      createdAt: now,
    }),
  ]);

  return NextResponse.json({ ok: true, verifiedAt: now.toISOString() });
}

export const POST = withErrorHandling('districts/[district]/verify:POST', POST_);
