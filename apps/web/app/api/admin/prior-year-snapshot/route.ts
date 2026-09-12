import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { asc } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { phase1PriorYearSnapshot } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

// Same paging shape as /api/admin/export/all — this table is static (~30K rows, written once
// by scripts/export-prior-year-snapshot.py, never at app runtime), but a single unbounded
// SELECT * still risks the same free-tier Worker CPU budget on serialization.
const PAGE_SIZE = 2000;

async function GET_(req: NextRequest): Promise<NextResponse> {
  const user = await getSession();
  if (!user || !['admin', 'superadmin'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset') ?? 0) || 0);

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  const rows = await db.select().from(phase1PriorYearSnapshot).orderBy(asc(phase1PriorYearSnapshot.id)).limit(PAGE_SIZE).offset(offset).all();

  return NextResponse.json({ rows, hasMore: rows.length === PAGE_SIZE });
}

export const GET = withErrorHandling('admin/prior-year-snapshot:GET', GET_);
