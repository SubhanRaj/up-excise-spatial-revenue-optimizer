import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count, like, and } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { phase1RawCollection } from '@excise/schema';


const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user || !['admin', 'superadmin'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Number(sp.get('page') ?? 1));
  const conditions = [];
  const qDistrict = sp.get('district');
  const qThana    = sp.get('thana');
  const qType     = sp.get('shopType');
  const qCircle   = sp.get('circleSector');
  const q         = sp.get('q');
  if (qDistrict) conditions.push(eq(phase1RawCollection.districtName, qDistrict));
  if (qThana)    conditions.push(eq(phase1RawCollection.thanaName, qThana));
  if (qType)     conditions.push(eq(phase1RawCollection.shopType, qType));
  if (qCircle)   conditions.push(eq(phase1RawCollection.circleSectorName, qCircle));
  // ponytail: LIKE scan acceptable at 30K rows; add FTS5 if >1s
  if (q)         conditions.push(like(phase1RawCollection.shopName, `%${q}%`));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const [rows, total] = await Promise.all([
    db.select().from(phase1RawCollection).where(where).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).all(),
    db.select({ n: count(phase1RawCollection.id) }).from(phase1RawCollection).where(where).get(),
  ]);
  return NextResponse.json({ rows, total: total?.n ?? 0, page, pageSize: PAGE_SIZE });
}
