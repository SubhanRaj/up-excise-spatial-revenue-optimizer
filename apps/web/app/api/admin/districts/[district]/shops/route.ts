import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { phase1RawCollection } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';


const MAX_PAGE_SIZE = 2000;

async function GET_(
  req: NextRequest,
  { params }: { params: Promise<{ district: string }> },
): Promise<NextResponse> {
  const user = await getSession();
  if (!user || !['admin', 'superadmin'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { district } = await params;
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Number(sp.get('page') ?? 1));
  const rawSize = sp.get('pageSize');
  const pageSize = rawSize === 'all' ? MAX_PAGE_SIZE : Math.min(MAX_PAGE_SIZE, Math.max(1, Number(rawSize ?? 100)));

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const [rows, total] = await Promise.all([
    db.select().from(phase1RawCollection).where(eq(phase1RawCollection.districtName, district))
      .limit(pageSize).offset((page - 1) * pageSize).all(),
    db.select({ n: count(phase1RawCollection.id) }).from(phase1RawCollection)
      .where(eq(phase1RawCollection.districtName, district)).get(),
  ]);
  return NextResponse.json({ rows, total: total?.n ?? 0, page, pageSize });
}

export const GET = withErrorHandling('admin/districts/[district]/shops:GET', GET_);
