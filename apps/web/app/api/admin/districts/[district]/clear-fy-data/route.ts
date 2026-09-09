import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districts, phase1RawCollection, auditLog } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

type Ctx = { params: Promise<{ district: string }> };

// One-time-per-district cleanup of shop data DEOs entered for the wrong financial year
// (FY 2026-27 instead of FY 2025-26). Deletes only phase1_raw_collection rows — registered
// circles/sectors, the DEO's auth_users/CUG identity, the district/DEO name, and the audit log
// are all left intact, so the DEO re-downloads the validated template and re-enters correct
// FY 2025-26 data into the same district setup. Resets districts.status to 'pending' and nulls
// the cached aggregates, same as the bad-upload recovery route (clear-data).
//
// Differs from clear-data in one way: it refuses to run twice. Once districts.fyDataClearedAt
// is set, a re-entered FY 2025-26 dataset can't be cleared again by mistake — the /admin/fy-cleanup
// View greys out the button off that same column. Open to any admin/superadmin (not owner-only),
// matching clear-data — the type-to-confirm dialog and the logged reason are the safeguard.
async function POST_(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getSession();
  if (!user || !['admin', 'superadmin'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { district } = await params;
  const body = await req.json().catch(() => ({})) as { reason?: string };
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) return NextResponse.json({ error: 'A reason is required' }, { status: 400 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const existing = await db.select({ name: districts.name, fyDataClearedAt: districts.fyDataClearedAt })
    .from(districts).where(eq(districts.name, district)).get();
  if (!existing) return NextResponse.json({ error: 'District not found' }, { status: 404 });
  if (existing.fyDataClearedAt) {
    return NextResponse.json({ error: 'This district has already had its FY 2026-27 data cleared. This action is one-time only.' }, { status: 409 });
  }

  const agg = await db.select({ shopCount: count(phase1RawCollection.id) })
    .from(phase1RawCollection).where(eq(phase1RawCollection.districtName, district)).get();
  const shopCount = agg?.shopCount ?? 0;

  const clearedAt = new Date();
  await db.batch([
    db.delete(phase1RawCollection).where(eq(phase1RawCollection.districtName, district)),
    // deoName is nulled too — it is a submit-time signature (M-53), re-attested by the DEO
    // when they resubmit the corrected FY 2025-26 data, so a stale pre-clear name shouldn't
    // linger on a district that's back to 'pending'.
    db.update(districts)
      .set({ status: 'pending', deoName: null, cachedVendCount: null, cachedTotalRevenue: null, fyDataClearedAt: clearedAt })
      .where(eq(districts.name, district)),
    db.insert(auditLog).values({
      eventType: 'fy_data_cleared',
      deoId: '',
      districtName: district,
      ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
      userAgent: req.headers.get('User-Agent') ?? null,
      metadata: JSON.stringify({ reason, shopCount }),
      actorName: user.name,
      actorDesignation: user.designation,
      createdAt: clearedAt,
    }),
  ]);

  return NextResponse.json({ ok: true, deletedCount: shopCount, clearedAt: clearedAt.toISOString() });
}

export const POST = withErrorHandling('admin/districts/[district]/clear-fy-data:POST', POST_);
