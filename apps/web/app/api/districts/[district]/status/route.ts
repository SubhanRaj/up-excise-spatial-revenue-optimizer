import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districtCirclesSectors, phase1RawCollection } from '@excise/schema';

export const runtime = 'edge';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ district: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { district } = await params;
  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const [units, uploaded] = await Promise.all([
    db.select({ name: districtCirclesSectors.name }).from(districtCirclesSectors)
      .where(eq(districtCirclesSectors.districtName, district)).all(),
    db.select({ circleSectorName: phase1RawCollection.circleSectorName, rowCount: count(phase1RawCollection.id) })
      .from(phase1RawCollection).where(eq(phase1RawCollection.districtName, district))
      .groupBy(phase1RawCollection.circleSectorName).all(),
  ]);

  const uploadedMap = Object.fromEntries(uploaded.map((u) => [u.circleSectorName, u.rowCount]));
  const summary = units.map((u) => ({ name: u.name, rowCount: uploadedMap[u.name] ?? 0 }));
  return NextResponse.json({ units: summary, canSubmit: summary.every((s) => s.rowCount > 0) });
}
