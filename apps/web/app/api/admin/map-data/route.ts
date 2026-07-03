import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { count, sum } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districts, phase1RawCollection } from '@excise/schema';


export async function GET() {
  const user = await getSession();
  if (!user || !['admin', 'superadmin'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const [districtRows, aggregates] = await Promise.all([
    db.select({ name: districts.name, status: districts.status, expectedVendCount: districts.expectedVendCount })
      .from(districts).all(),
    db.select({
      districtName: phase1RawCollection.districtName,
      vendCount: count(phase1RawCollection.id),
      totalRevenue: sum(phase1RawCollection.totalRevenue),
    }).from(phase1RawCollection).groupBy(phase1RawCollection.districtName).all(),
  ]);

  const aggMap = Object.fromEntries(
    aggregates.map((a) => [a.districtName, { vendCount: a.vendCount, totalRevenue: Number(a.totalRevenue ?? 0) }])
  );

  return NextResponse.json(districtRows.map((d) => ({
    name: d.name,
    status: d.status,
    expectedVendCount: d.expectedVendCount,
    vendCount: aggMap[d.name]?.vendCount ?? 0,
    totalRevenue: aggMap[d.name]?.totalRevenue ?? 0,
  })));
}
