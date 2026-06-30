import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { getSession } from '@/lib/auth';
import { phase1RawCollection } from '@excise/schema';


export async function GET() {
  const user = await getSession();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  const rows = await db.select().from(phase1RawCollection).all();

  const header = Object.keys(rows[0] ?? {}).join(',');
  const csv = [header, ...rows.map((r) => Object.values(r).join(','))].join('\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="phase1-all-districts.csv"',
    },
  });
}
