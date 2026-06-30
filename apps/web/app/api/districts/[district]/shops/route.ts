import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, asc } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { phase1RawCollection } from '@excise/schema';


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
    .from(phase1RawCollection)
    .where(eq(phase1RawCollection.districtName, district))
    .orderBy(asc(phase1RawCollection.circleSectorName), asc(phase1RawCollection.shopId))
    .all();
  return NextResponse.json({ rows });
}
