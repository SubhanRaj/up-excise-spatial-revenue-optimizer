import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { getSession } from '@/lib/auth';
import { districts, authUsers } from '@excise/schema';

export const runtime = 'edge';

interface ProvisionRow {
  districtName: string; division: string; deoName: string; deoEmail: string;
  deoId: string; expectedVendCount: number;
  bboxMinLat?: number; bboxMaxLat?: number; bboxMinLon?: number; bboxMaxLon?: number;
}

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { rows: ProvisionRow[] };
  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  const now = new Date();
  const results: { email: string; status: string; error?: string }[] = [];

  for (const row of body.rows) {
    try {
      await db.insert(districts).values({
        name: row.districtName, division: row.division, deoName: row.deoName,
        deoEmail: row.deoEmail, deoId: row.deoId, expectedVendCount: row.expectedVendCount,
        bboxMinLat: row.bboxMinLat ?? null, bboxMaxLat: row.bboxMaxLat ?? null,
        bboxMinLon: row.bboxMinLon ?? null, bboxMaxLon: row.bboxMaxLon ?? null,
        status: 'pending', createdAt: now,
      }).onConflictDoUpdate({
        target: districts.name,
        set: {
          division: row.division, deoName: row.deoName, deoEmail: row.deoEmail,
          deoId: row.deoId, expectedVendCount: row.expectedVendCount,
          bboxMinLat: row.bboxMinLat ?? null, bboxMaxLat: row.bboxMaxLat ?? null,
          bboxMinLon: row.bboxMinLon ?? null, bboxMaxLon: row.bboxMaxLon ?? null,
        },
      });
      await db.insert(authUsers).values({
        email: row.deoEmail, name: row.deoName, role: 'deo',
        deoId: row.deoId, districtName: row.districtName,
      }).onConflictDoUpdate({
        target: authUsers.email,
        set: { name: row.deoName, deoId: row.deoId, districtName: row.districtName },
      });
      results.push({ email: row.deoEmail, status: 'provisioned' });
    } catch (err) {
      results.push({ email: row.deoEmail, status: 'error', error: String(err) });
    }
  }
  return NextResponse.json({ results });
}
