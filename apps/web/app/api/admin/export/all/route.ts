import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { getSession } from '@/lib/auth';
import { phase1RawCollection, districtCirclesSectors } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';


async function GET_(): Promise<NextResponse> {
  const user = await getSession();
  if (!user || !['admin', 'superadmin'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  // `units` (district_circles_sectors, low hundreds of rows total) rides along with the shop
  // rows here so the full-state export's Circle-Sector Summary sheet can show the authoritative
  // circle/sector type and registered-but-empty units, not just what's inferable from shop rows.
  const [rows, units] = await Promise.all([
    db.select().from(phase1RawCollection).all(),
    db.select().from(districtCirclesSectors).all(),
  ]);

  return NextResponse.json({ rows, units });
}

export const GET = withErrorHandling('admin/export/all:GET', GET_);
