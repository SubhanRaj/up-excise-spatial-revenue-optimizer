import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { asc } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { phase1RawCollection, districtCirclesSectors } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

// ponytail: 2000-row pages — matches the existing server cap on
// /api/admin/districts/[district]/shops. With ~25K+ real rows now in prod, a single
// unbounded SELECT * (the pre-M-63 behavior) serializes the whole table in one Worker
// invocation and blows the free-tier CPU budget. Client (fetchFullExportData in db.ts)
// pages through offset until hasMore is false.
const PAGE_SIZE = 2000;

async function GET_(req: NextRequest): Promise<NextResponse> {
  const user = await getSession();
  if (!user || !['admin', 'superadmin'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset') ?? 0) || 0);

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  // `units` (district_circles_sectors, low hundreds of rows total) rides along with the first
  // page only — the full-state export's Circle-Sector Summary sheet needs it once, not per page.
  const [rows, units] = await Promise.all([
    db.select().from(phase1RawCollection).orderBy(asc(phase1RawCollection.id)).limit(PAGE_SIZE).offset(offset).all(),
    offset === 0 ? db.select().from(districtCirclesSectors).all() : Promise.resolve([]),
  ]);

  return NextResponse.json({ rows, units, hasMore: rows.length === PAGE_SIZE });
}

export const GET = withErrorHandling('admin/export/all:GET', GET_);
