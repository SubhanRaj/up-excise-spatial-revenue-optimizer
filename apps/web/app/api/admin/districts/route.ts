import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { asc, count, sum, inArray } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districts, phase1RawCollection, districtCirclesSectors } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';


async function GET_(): Promise<NextResponse> {
  const user = await getSession();
  if (!user || !['admin', 'superadmin'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const [districtRows, unitAggregates] = await Promise.all([
    db.select({
      name: districts.name, division: districts.division, deoName: districts.deoName, deoEmailHash: districts.deoEmailHash,
      deoId: districts.deoId,
      expectedVendCount: districts.expectedVendCount, status: districts.status, submittedAt: districts.submittedAt,
      bboxMinLat: districts.bboxMinLat, bboxMaxLat: districts.bboxMaxLat,
      bboxMinLon: districts.bboxMinLon, bboxMaxLon: districts.bboxMaxLon,
      cachedVendCount: districts.cachedVendCount, cachedTotalRevenue: districts.cachedTotalRevenue,
    }).from(districts).orderBy(asc(districts.name)).all(),
    db.select({
      districtName: districtCirclesSectors.districtName,
      unitCount: count(districtCirclesSectors.id),
    }).from(districtCirclesSectors).groupBy(districtCirclesSectors.districtName).all(),
  ]);

  // A 'verified' district's shop data is immutable — the only thing that can change it is
  // Delete Shop Data, which resets status to 'pending' and nulls these columns back out (see
  // that route). So a verified district with a cached aggregate never needs to be re-scanned;
  // only non-verified districts (and any verified one missing a cache, e.g. pre-M-95 data)
  // still need the GROUP BY. This is what keeps this route from re-reading the full ~30K-row
  // phase1_raw_collection table on every 5-minute cache refresh and every Sync All click.
  const needsAggregate = districtRows.filter((d) => !(d.status === 'verified' && d.cachedVendCount != null)).map((d) => d.name);
  const aggregates = needsAggregate.length === 0 ? [] : await db.select({
    districtName: phase1RawCollection.districtName,
    vendCount: count(phase1RawCollection.id),
    totalRevenue: sum(phase1RawCollection.totalRevenue),
  }).from(phase1RawCollection)
    .where(inArray(phase1RawCollection.districtName, needsAggregate))
    .groupBy(phase1RawCollection.districtName).all();

  const aggMap = Object.fromEntries(
    aggregates.map((a) => [a.districtName, { vendCount: a.vendCount, totalRevenue: Number(a.totalRevenue ?? 0) }])
  );
  const unitMap = Object.fromEntries(unitAggregates.map((u) => [u.districtName, u.unitCount]));
  const rows = districtRows.map((d) => {
    const { cachedVendCount, cachedTotalRevenue, ...rest } = d;
    const hasBox = d.bboxMinLat != null && d.bboxMaxLat != null && d.bboxMinLon != null && d.bboxMaxLon != null;
    const useCached = d.status === 'verified' && cachedVendCount != null;
    return {
      ...rest,
      vendCount: useCached ? cachedVendCount! : (aggMap[d.name]?.vendCount ?? 0),
      totalRevenue: useCached ? (cachedTotalRevenue ?? 0) : (aggMap[d.name]?.totalRevenue ?? 0),
      unitCount: unitMap[d.name] ?? 0,
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

export const GET = withErrorHandling('admin/districts:GET', GET_);
