import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { asc, count, sum } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districts, phase1RawCollection } from '@excise/schema';


export async function GET() {
  const user = await getSession();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const [districtRows, aggregates] = await Promise.all([
    db.select({
      name: districts.name, division: districts.division, deoName: districts.deoName, deoEmail: districts.deoEmail,
      expectedVendCount: districts.expectedVendCount, status: districts.status, submittedAt: districts.submittedAt,
      bboxMinLat: districts.bboxMinLat, bboxMaxLat: districts.bboxMaxLat,
      bboxMinLon: districts.bboxMinLon, bboxMaxLon: districts.bboxMaxLon,
    }).from(districts).orderBy(asc(districts.name)).all(),
    db.select({
      districtName: phase1RawCollection.districtName,
      vendCount: count(phase1RawCollection.id),
      totalRevenue: sum(phase1RawCollection.totalRevenue),
    }).from(phase1RawCollection).groupBy(phase1RawCollection.districtName).all(),
  ]);

  const aggMap = Object.fromEntries(
    aggregates.map((a) => [a.districtName, { vendCount: a.vendCount, totalRevenue: Number(a.totalRevenue ?? 0) }])
  );
  const rows = districtRows.map((d) => {
    const hasBox = d.bboxMinLat != null && d.bboxMaxLat != null && d.bboxMinLon != null && d.bboxMaxLon != null;
    return {
      ...d,
      vendCount: aggMap[d.name]?.vendCount ?? 0,
      totalRevenue: aggMap[d.name]?.totalRevenue ?? 0,
      centerLat: hasBox ? ((d.bboxMinLat! + d.bboxMaxLat!) / 2) : null,
      centerLon: hasBox ? ((d.bboxMinLon! + d.bboxMaxLon!) / 2) : null,
    };
  });
  const stateTotals = {
    totalVendCount: rows.reduce((s, r) => s + r.vendCount, 0),
    totalRevenue: rows.reduce((s, r) => s + r.totalRevenue, 0),
  };

  return NextResponse.json({ districts: rows, stateTotals });
}
