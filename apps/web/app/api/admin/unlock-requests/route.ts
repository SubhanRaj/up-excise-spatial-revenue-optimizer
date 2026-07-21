import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { desc } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districtUnlockRequests } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

async function GET_(_req: NextRequest): Promise<NextResponse> {
  const user = await getSession();
  if (!user || !['admin', 'superadmin'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  const rows = await db.select().from(districtUnlockRequests)
    .orderBy(desc(districtUnlockRequests.requestedAt)).all();

  return NextResponse.json({ rows });
}

export const GET = withErrorHandling('admin/unlock-requests:GET', GET_);
