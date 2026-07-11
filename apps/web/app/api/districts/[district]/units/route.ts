import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districtCirclesSectors, auditLog } from '@excise/schema';


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ district: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { district } = await params;
  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  const rows = await db
    .select()
    .from(districtCirclesSectors)
    .where(eq(districtCirclesSectors.districtName, district))
    .all();
  return NextResponse.json(rows);
}

// Bulk, one-shot creation — the ONLY way to register circles/sectors. Once a district
// has any unit row, this rejects: the DEO submits the full list once, then it's locked.
// ponytail: "locked" derived from existence of rows, no separate flag/migration needed.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ district: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { district } = await params;
  const body = await req.json() as { circles?: string[]; sectors?: string[] };
  const circles = (body.circles ?? []).map((n) => n.trim()).filter(Boolean);
  const sectors = (body.sectors ?? []).map((n) => n.trim()).filter(Boolean);

  if (circles.length + sectors.length === 0) {
    return NextResponse.json({ error: 'At least one circle or sector name is required' }, { status: 400 });
  }

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const existing = await db
    .select({ id: districtCirclesSectors.id })
    .from(districtCirclesSectors)
    .where(eq(districtCirclesSectors.districtName, district))
    .limit(1)
    .all();
  if (existing.length > 0) {
    return NextResponse.json({ error: 'Circles and sectors have already been submitted for this district and cannot be changed.' }, { status: 409 });
  }

  const now = new Date();
  const unitInserts = [
    ...circles.map((name) => ({ name, type: 'circle' as const })),
    ...sectors.map((name) => ({ name, type: 'sector' as const })),
  ];

  const [first, ...rest] = unitInserts.map((u) => db.insert(districtCirclesSectors).values({
    districtName: district, name: u.name, type: u.type,
    createdByDeo: user.deoId, createdAt: now,
  }));

  await db.batch([
    first!,
    ...rest,
    db.insert(auditLog).values({
      eventType: 'unit_registered',
      deoId: user.deoId,
      districtName: district,
      ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
      userAgent: req.headers.get('User-Agent') ?? null,
      metadata: JSON.stringify({ circles: circles.length, sectors: sectors.length }),
      createdAt: now,
    }),
  ]);

  return NextResponse.json({ ok: true, count: unitInserts.length });
}

// Admin-only escape hatch — the DEO has no edit/delete path for units by design (see POST
// above), so a wrong name requires an admin to unlock the district's circles/sectors here.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ district: string }> },
) {
  const user = await getSession();
  if (!user || !['admin', 'superadmin'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { district } = await params;
  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  await db.batch([
    db.delete(districtCirclesSectors).where(eq(districtCirclesSectors.districtName, district)),
    db.insert(auditLog).values({
      eventType: 'units_unlocked',
      deoId: user.deoId,
      districtName: district,
      ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
      userAgent: req.headers.get('User-Agent') ?? null,
      metadata: null,
      createdAt: new Date(),
    }),
  ]);

  return NextResponse.json({ ok: true });
}
