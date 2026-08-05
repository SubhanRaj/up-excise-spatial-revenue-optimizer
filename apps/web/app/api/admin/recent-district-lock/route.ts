import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { and, gte, inArray } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { auditLog } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

// Cheap, indexed (al_created_at_idx) gate for invalidateAllAdminCaches()'s export_cache
// refetch (~25K+ rows) — Sync All only re-pulls the full state-wide shop dataset if a
// district actually finished a final submission/verification recently. Registering
// circles/sectors, logins, and every other audit event are deliberately excluded — this
// checks for the one signal that means the shop-row dataset itself changed.
const LOOKBACK_MS = 30 * 60 * 1000;

async function GET_(): Promise<NextResponse> {
  const user = await getSession();
  if (!user || !['admin', 'superadmin'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  const since = new Date(Date.now() - LOOKBACK_MS);

  const rows = await db.select({ id: auditLog.id }).from(auditLog)
    .where(and(inArray(auditLog.eventType, ['district_submitted', 'district_verified']), gte(auditLog.createdAt, since)))
    .limit(1)
    .all();

  return NextResponse.json({ recentlyLocked: rows.length > 0 });
}

export const GET = withErrorHandling('admin/recent-district-lock:GET', GET_);
