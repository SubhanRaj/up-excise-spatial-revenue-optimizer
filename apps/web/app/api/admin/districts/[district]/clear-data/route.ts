import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districts, phase1RawCollection, auditLog } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

type Ctx = { params: Promise<{ district: string }> };

// Deletes only phase1_raw_collection rows for the district (the shop data itself) — registered
// circles/sectors, the DEO's auth_users/CUG identity, and the audit log are left untouched, so
// this recovers from a bad/duplicated upload without re-provisioning the district or losing its
// history. Resets districts.status to 'pending' so the DEO can re-upload from a clean slate
// (isLocked() only checks 'submitted'/'verified', so 'pending' never blocks a fresh upload).
// Superadmin-only, matching District Master and Admin Users — deleting real shop data is at
// least as consequential as reassigning a DEO, and there is no undo.
async function POST_(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getSession();
  if (!user || user.role !== 'superadmin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { district } = await params;
  const body = await req.json().catch(() => ({})) as { reason?: string };
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) return NextResponse.json({ error: 'A reason is required' }, { status: 400 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const existing = await db.select({ name: districts.name }).from(districts).where(eq(districts.name, district)).get();
  if (!existing) return NextResponse.json({ error: 'District not found' }, { status: 404 });

  const agg = await db.select({ shopCount: count(phase1RawCollection.id) })
    .from(phase1RawCollection).where(eq(phase1RawCollection.districtName, district)).get();
  const shopCount = agg?.shopCount ?? 0;

  await db.batch([
    db.delete(phase1RawCollection).where(eq(phase1RawCollection.districtName, district)),
    db.update(districts).set({ status: 'pending' }).where(eq(districts.name, district)),
    db.insert(auditLog).values({
      eventType: 'district_data_cleared',
      deoId: '',
      districtName: district,
      ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
      userAgent: req.headers.get('User-Agent') ?? null,
      metadata: JSON.stringify({ reason, shopCount }),
      actorName: user.name,
      actorDesignation: user.designation,
      createdAt: new Date(),
    }),
  ]);

  return NextResponse.json({ ok: true, deletedCount: shopCount });
}

export const POST = withErrorHandling('admin/districts/[district]/clear-data:POST', POST_);
