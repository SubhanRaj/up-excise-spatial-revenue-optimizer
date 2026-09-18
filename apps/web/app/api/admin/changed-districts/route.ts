import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { and, gt, inArray, eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { auditLog, districts as districtsTable } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

// Single indexed audit_log scan (al_created_at_idx) — tells Sync All exactly which
// districts' shop/unit rows could have changed since the caller's last export sync, so it
// can patch just those districts into export_cache instead of re-pulling the whole ~25K-row
// state-wide dataset whenever *any* district happened to change. Deliberately excludes
// unlock_requested/unlock_request_denied — those don't touch phase1_raw_collection or
// district_circles_sectors, and the cheap unlock_requests_cache already refreshes on every
// Sync All regardless. deputy_district_reviewed doesn't touch shop data either, but callers
// (adminShopsCache, adminDistrictsCache, deputyDistrictsCache) also carry the district's
// deputyReview alongside it, and adminShopsCache has no TTL of its own to fall back on — this
// is the only signal that tells any of them a review changed.
const CHANGE_EVENTS = ['district_submitted', 'district_verified', 'units_unlocked', 'data_correction_unlocked', 'district_data_cleared', 'fy_data_cleared', 'deputy_district_reviewed'] as const;

async function GET_(req: NextRequest): Promise<NextResponse> {
  const user = await getSession();
  // deputy allowed (M-102) — this is a cache-freshness hint, but a deputy only ever gets the
  // names for their own division (see the filter below), never the state-wide list.
  if (!user || !['admin', 'superadmin', 'deputy'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (user.role === 'deputy' && (!user.division || user.division.trim() === '')) {
    return NextResponse.json({ districts: [], at: Date.now() });
  }

  const since = new Date(Math.max(0, Number(req.nextUrl.searchParams.get('since') ?? 0) || 0));

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const [rows, divisionDistricts] = await Promise.all([
    db.select({ districtName: auditLog.districtName, createdAt: auditLog.createdAt })
      .from(auditLog)
      .where(and(inArray(auditLog.eventType, CHANGE_EVENTS), gt(auditLog.createdAt, since)))
      .all(),
    user.role === 'deputy'
      ? db.select({ name: districtsTable.name }).from(districtsTable).where(eq(districtsTable.division, user.division!)).all()
      : Promise.resolve(null),
  ]);

  let districts = [...new Set(rows.map((r) => r.districtName))];
  if (divisionDistricts) {
    const mine = new Set(divisionDistricts.map((d) => d.name));
    districts = districts.filter((n): n is string => n != null && mine.has(n));
  }
  const at = rows.length > 0 ? Math.max(...rows.map((r) => r.createdAt.getTime())) : since.getTime();

  return NextResponse.json({ districts, at });
}

export const GET = withErrorHandling('admin/changed-districts:GET', GET_);
