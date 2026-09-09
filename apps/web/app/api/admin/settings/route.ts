import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { count } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districts } from '@excise/schema';
import { isLocked } from '@/lib/status';
import { withErrorHandling } from '@/lib/with-error-handling';

// M-104 removed the state-wide "verification round" flag — a DEO verifies their own district
// the moment it's submitted, no HQ gate. This route now only serves the CARTO map key plus,
// for admins, the submitted-count/total headline numbers. There is no POST anymore.
async function GET_(): Promise<NextResponse> {
  const user = await getSession();
  if (!user || !['admin', 'superadmin', 'deputy'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };

  // A deputy only needs the CARTO key for its division map — the state-wide counts are HQ
  // context, so they're zeroed and the district queries skipped.
  if (user.role === 'deputy') {
    return NextResponse.json({ submittedCount: 0, totalDistricts: 0, cartoApiKey: env.CARTO_API_KEY ?? null });
  }

  const db = drizzle(env.DB);
  const [allStatuses, totalRows] = await Promise.all([
    db.select({ status: districts.status }).from(districts).all(),
    db.select({ total: count() }).from(districts).all(),
  ]);

  return NextResponse.json({
    submittedCount: allStatuses.filter((d) => isLocked(d.status)).length,
    totalDistricts: totalRows[0]?.total ?? 0,
    // Public/domain-restricted CARTO basemap key, not a security secret — CARTO now requires
    // one on every raster tile request. Piggybacks on this already-authenticated call.
    cartoApiKey: env.CARTO_API_KEY ?? null,
  });
}

export const GET = withErrorHandling('admin/settings:GET', GET_);
