import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { desc, lt } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { auditLog } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';


const PAGE_SIZE = 100;
const RETENTION_DAYS = 45;

async function GET_(req: NextRequest): Promise<NextResponse> {
  const user = await getSession();
  if (!user || !['admin', 'superadmin'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  // Opportunistic 45-day retention: prune on read rather than a separate cron trigger — this
  // page is the only consumer of the table, so rows don't need to disappear the instant they
  // turn 45 days old, just before the next time an admin looks. See CLAUDE.md's note on the
  // deferred cron trigger.
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db.delete(auditLog).where(lt(auditLog.createdAt, cutoff));

  const page = Math.max(1, Number(new URL(req.url).searchParams.get('page') ?? 1));
  const rows = await db.select().from(auditLog)
    .orderBy(desc(auditLog.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).all();
  return NextResponse.json({ rows, page, pageSize: PAGE_SIZE });
}

export const GET = withErrorHandling('admin/audit-log:GET', GET_);
