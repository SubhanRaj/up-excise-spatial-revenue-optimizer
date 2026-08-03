import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districts, districtCirclesSectors, phase1RawCollection, auditLog } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';


async function POST_(
  req: NextRequest,
  { params }: { params: Promise<{ district: string }> },
): Promise<NextResponse> {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { submittedByName?: string };
  const submittedByName = body.submittedByName?.trim();
  if (!submittedByName) return NextResponse.json({ error: 'submittedByName is required' }, { status: 400 });

  const { district } = await params;
  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const [units, uploaded] = await Promise.all([
    db.select({ name: districtCirclesSectors.name }).from(districtCirclesSectors)
      .where(eq(districtCirclesSectors.districtName, district)).all(),
    db.select({ circleSectorName: phase1RawCollection.circleSectorName })
      .from(phase1RawCollection).where(eq(phase1RawCollection.districtName, district))
      .groupBy(phase1RawCollection.circleSectorName).all(),
  ]);

  const uploadedNames = new Set(uploaded.map((u) => u.circleSectorName));
  const missing = units.filter((u) => !uploadedNames.has(u.name)).map((u) => u.name);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Missing data for units: ${missing.join(', ')}` }, { status: 400 });
  }

  const now = new Date();
  await db.batch([
    // submittedByName is the DEO's own self-attested, liability-confirmed name (see
    // promptDeoNameAndLock() on /verify) -- the first real ground truth for this district's
    // DEO identity, since districts.deoName is otherwise an admin-set placeholder until
    // corrected (Pre-Campaign Blocker #5). Writing it here is what makes the district detail
    // and admin district-list pages show a real name instead of "<District> DEO" once a
    // district is actually submitted.
    db.update(districts).set({ status: 'submitted', submittedAt: now, deoName: submittedByName }).where(eq(districts.name, district)),
    db.insert(auditLog).values({
      eventType: 'district_submitted',
      deoId: user.deoId,
      districtName: district,
      ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
      userAgent: req.headers.get('User-Agent') ?? null,
      metadata: JSON.stringify({ submittedAt: now.toISOString(), submittedByName }),
      createdAt: now,
    })
  ]);

  return NextResponse.json({ ok: true, submittedAt: now.toISOString() });
}

export const POST = withErrorHandling('districts/[district]/submit:POST', POST_);
