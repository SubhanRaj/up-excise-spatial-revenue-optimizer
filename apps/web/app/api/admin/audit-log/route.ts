import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { desc } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { auditLog } from '@excise/schema';


const PAGE_SIZE = 100;

export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const page = Math.max(1, Number(new URL(req.url).searchParams.get('page') ?? 1));
  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  const rows = await db.select().from(auditLog)
    .orderBy(desc(auditLog.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).all();
  return NextResponse.json({ rows, page, pageSize: PAGE_SIZE });
}
