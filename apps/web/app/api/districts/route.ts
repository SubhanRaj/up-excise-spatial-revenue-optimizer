import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { asc } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districts } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';


async function GET_(): Promise<NextResponse> {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  const rows = await db
    .select({ name: districts.name, division: districts.division })
    .from(districts)
    .orderBy(asc(districts.name))
    .all();
  return NextResponse.json(rows);
}

export const GET = withErrorHandling('districts:GET', GET_);
