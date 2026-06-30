import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districtCirclesSectors, auditLog } from '@excise/schema';

export const runtime = 'edge';

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ district: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { district } = await params;
  const body = await req.json() as { name: string; type: 'circle' | 'sector' };
  if (!body.name?.trim() || !['circle', 'sector'].includes(body.type)) {
    return NextResponse.json({ error: 'name and type (circle|sector) required' }, { status: 400 });
  }

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(districtCirclesSectors).values({
      districtName: district,
      name: body.name.trim(),
      type: body.type,
      createdByDeo: user.deoId,
      createdAt: now,
    });
    await tx.insert(auditLog).values({
      eventType: 'unit_registered',
      deoId: user.deoId,
      districtName: district,
      ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
      userAgent: req.headers.get('User-Agent') ?? null,
      metadata: JSON.stringify({ name: body.name, type: body.type }),
      createdAt: now,
    });
  });

  return NextResponse.json({ ok: true });
}
