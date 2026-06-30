import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { phase1RawCollection } from '@excise/schema';


const PAGE_SIZE = 100;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ district: string }> },
) {
  const user = await getSession();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { district } = await params;
  const page = Math.max(1, Number(new URL(req.url).searchParams.get('page') ?? 1));
  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const [rows, total] = await Promise.all([
    db.select().from(phase1RawCollection).where(eq(phase1RawCollection.districtName, district))
      .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).all(),
    db.select({ n: count(phase1RawCollection.id) }).from(phase1RawCollection)
      .where(eq(phase1RawCollection.districtName, district)).get(),
  ]);
  return NextResponse.json({ rows, total: total?.n ?? 0, page, pageSize: PAGE_SIZE });
}
