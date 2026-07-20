import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { withErrorHandling } from '@/lib/with-error-handling';

const SUPERADMIN_EMAIL = 'shubhanraj2002@gmail.com';

async function POST_(): Promise<NextResponse> {
  const session = await getSession();
  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };

  if (!session || !['admin', 'superadmin'].includes(session.role) || session.emailHash !== env.SUPERADMIN_EMAIL_HASH) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = drizzle(env.DB);

  // Order matters: delete sessions before users (FK), delete shop data, reset districts.
  // Districts rows are kept; only status is reset. Admin auth_users row is preserved.
  await db.batch([
    db.run(sql`DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM auth_users WHERE role = 'deo')`),
    db.run(sql`DELETE FROM auth_users WHERE role = 'deo'`),
    db.run(sql`DELETE FROM phase1_raw_collection`),
    db.run(sql`DELETE FROM district_circles_sectors`),
    db.run(sql`DELETE FROM audit_log`),
    db.run(sql`UPDATE districts SET status = 'pending', submitted_at = NULL`),
  ]);

  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandling('admin/reset-test-data:POST', POST_);
