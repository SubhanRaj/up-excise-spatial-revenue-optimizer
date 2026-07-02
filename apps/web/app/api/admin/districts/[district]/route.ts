import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count, sum } from 'drizzle-orm';
import { getSession, sha256hex } from '@/lib/auth';
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
  expectedVendCount?: number | null;
  bboxMinLat?: number | null; bboxMaxLat?: number | null; bboxMinLon?: number | null; bboxMaxLon?: number | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

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
  const division = normalizeText(body.division);
  const deoName = normalizeText(body.deoName);
  const deoEmail = normalizeText(body.deoEmail);
  const deoId = normalizeText(body.deoId);
  const expectedVendCount = normalizeNumber(body.expectedVendCount);
  const bboxMinLat = normalizeNumber(body.bboxMinLat);
  const bboxMaxLat = normalizeNumber(body.bboxMaxLat);
  const bboxMinLon = normalizeNumber(body.bboxMinLon);
  const bboxMaxLon = normalizeNumber(body.bboxMaxLon);

  if (deoEmail && !EMAIL_RE.test(deoEmail)) {
    return NextResponse.json({ error: 'Invalid DEO email' }, { status: 400 });
  }
  for (const value of [expectedVendCount, bboxMinLat, bboxMaxLat, bboxMinLon, bboxMaxLon]) {
    if (Number.isNaN(value)) {
      return NextResponse.json({ error: 'Invalid numeric value' }, { status: 400 });
    }
  }

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const existing = await db.select().from(districts).where(eq(districts.name, district)).get();
  if (!existing) return NextResponse.json({ error: 'District not found' }, { status: 404 });

  let newEmailHashStr: string | undefined = undefined;
  if (deoEmail) {
    newEmailHashStr = await sha256hex(deoEmail.toLowerCase());
    if (existing.deoEmailHash === newEmailHashStr) {
      return NextResponse.json({ error: 'New email cannot be the same as the old email' }, { status: 400 });
    }
  }

  const updates: Record<string, unknown> = {};
  if (body.division !== undefined) updates.division = division;
  if (body.deoName !== undefined) updates.deoName = deoName;
  if (newEmailHashStr !== undefined) updates.deoEmailHash = newEmailHashStr;
  else if (body.deoEmail === null) updates.deoEmailHash = null;
  if (body.deoId !== undefined) updates.deoId = deoId;
  if (body.expectedVendCount !== undefined) updates.expectedVendCount = expectedVendCount;
  if (body.bboxMinLat !== undefined) updates.bboxMinLat = bboxMinLat;
  if (body.bboxMaxLat !== undefined) updates.bboxMaxLat = bboxMaxLat;
  if (body.bboxMinLon !== undefined) updates.bboxMinLon = bboxMinLon;
  if (body.bboxMaxLon !== undefined) updates.bboxMaxLon = bboxMaxLon;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    await tx.update(districts).set(updates).where(eq(districts.name, district));

    if (body.deoEmail !== undefined && existing.deoEmailHash && existing.deoEmailHash !== newEmailHashStr) {
      await tx.delete(authUsers).where(eq(authUsers.emailHash, existing.deoEmailHash));
    }

    if (newEmailHashStr) {
      await tx.insert(authUsers).values({
        emailHash: newEmailHashStr,
        name: deoName ?? existing.deoName ?? 'DEO',
        role: 'deo',
        deoId: deoId ?? existing.deoId,
        districtName: district,
      }).onConflictDoUpdate({
        target: authUsers.emailHash,
        set: { name: deoName ?? existing.deoName ?? 'DEO', deoId: deoId ?? existing.deoId, districtName: district },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
