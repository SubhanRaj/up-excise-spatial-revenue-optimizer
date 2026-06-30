import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count, sum } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districts, districtCirclesSectors, phase1RawCollection } from '@excise/schema';

export const runtime = 'edge';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ district: string }> },
) {
  const user = await getSession();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { district } = await params;
  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const [meta, units, agg] = await Promise.all([
    db.select().from(districts).where(eq(districts.name, district)).get(),
    db.select().from(districtCirclesSectors).where(eq(districtCirclesSectors.districtName, district)).all(),
    db.select({ vendCount: count(phase1RawCollection.id), totalRevenue: sum(phase1RawCollection.totalRevenue) })
      .from(phase1RawCollection).where(eq(phase1RawCollection.districtName, district)).get(),
  ]);

  if (!meta) return NextResponse.json({ error: 'District not found' }, { status: 404 });
  return NextResponse.json({ ...meta, units, vendCount: agg?.vendCount ?? 0, totalRevenue: Number(agg?.totalRevenue ?? 0) });
}
