import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count, sum } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districts, districtCirclesSectors, phase1RawCollection, authUsers } from '@excise/schema';

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

interface DistrictPatchBody {
  division?: string; deoName?: string; deoEmail?: string; deoId?: string;
  expectedVendCount?: number;
  bboxMinLat?: number; bboxMaxLat?: number; bboxMinLon?: number; bboxMaxLon?: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// District Master inline edit — minor corrections (division, DEO assignment, expected
// vend count, bbox). Bulk Excel provisioning remains the path for initial campaign setup.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ district: string }> },
) {
  const user = await getSession();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { district } = await params;
  const body = await req.json() as DistrictPatchBody;
  if (body.deoEmail && !EMAIL_RE.test(body.deoEmail)) {
    return NextResponse.json({ error: 'Invalid DEO email' }, { status: 400 });
  }

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const existing = await db.select().from(districts).where(eq(districts.name, district)).get();
  if (!existing) return NextResponse.json({ error: 'District not found' }, { status: 404 });

  const newDeoEmail = body.deoEmail?.trim() || null;
  const newDeoName = body.deoName?.trim() || existing.deoName;
  const newDeoId = body.deoId?.trim() || existing.deoId;

  await db.transaction(async (tx) => {
    await tx.update(districts).set({
      ...(body.division !== undefined ? { division: body.division } : {}),
      ...(body.deoName !== undefined ? { deoName: newDeoName } : {}),
      ...(body.deoEmail !== undefined ? { deoEmail: newDeoEmail } : {}),
      ...(body.deoId !== undefined ? { deoId: newDeoId } : {}),
      ...(body.expectedVendCount !== undefined ? { expectedVendCount: body.expectedVendCount } : {}),
      ...(body.bboxMinLat !== undefined ? { bboxMinLat: body.bboxMinLat } : {}),
      ...(body.bboxMaxLat !== undefined ? { bboxMaxLat: body.bboxMaxLat } : {}),
      ...(body.bboxMinLon !== undefined ? { bboxMinLon: body.bboxMinLon } : {}),
      ...(body.bboxMaxLon !== undefined ? { bboxMaxLon: body.bboxMaxLon } : {}),
    }).where(eq(districts.name, district));

    if (body.deoEmail !== undefined && existing.deoEmail && existing.deoEmail !== newDeoEmail) {
      await tx.delete(authUsers).where(eq(authUsers.email, existing.deoEmail));
    }

    if (newDeoEmail) {
      await tx.insert(authUsers).values({
        email: newDeoEmail, name: newDeoName ?? newDeoEmail, role: 'deo',
        deoId: newDeoId, districtName: district,
      }).onConflictDoUpdate({
        target: authUsers.email,
        set: { name: newDeoName ?? newDeoEmail, deoId: newDeoId, districtName: district },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
