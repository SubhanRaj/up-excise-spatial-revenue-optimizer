import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { getSession, sha256hex } from '@/lib/auth';
import { districts, authUsers } from '@excise/schema';


interface ProvisionRow {
  districtName: string; division: string; deoName: string; deoEmail: string;
  deoId: string; expectedVendCount: number;
  bboxMinLat?: number; bboxMaxLat?: number; bboxMinLon?: number; bboxMaxLon?: number;
}

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user || !['admin', 'superadmin'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { rows: ProvisionRow[] };
  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  const now = new Date();
  const results: { email: string; status: string; error?: string }[] = [];

  for (const row of body.rows) {
    try {
      const emailHashStr = await sha256hex(row.deoEmail);

      await db.insert(districts).values({
        name: row.districtName, division: row.division, deoName: row.deoName,
        deoEmailHash: emailHashStr, deoId: row.deoId, expectedVendCount: row.expectedVendCount,
        bboxMinLat: row.bboxMinLat ?? null, bboxMaxLat: row.bboxMaxLat ?? null,
        bboxMinLon: row.bboxMinLon ?? null, bboxMaxLon: row.bboxMaxLon ?? null,
        status: 'pending', createdAt: now,
      }).onConflictDoUpdate({
        target: districts.name,
        set: {
          division: row.division, deoName: row.deoName, deoEmailHash: emailHashStr,
          deoId: row.deoId, expectedVendCount: row.expectedVendCount,
          bboxMinLat: row.bboxMinLat ?? null, bboxMaxLat: row.bboxMaxLat ?? null,
          bboxMinLon: row.bboxMinLon ?? null, bboxMaxLon: row.bboxMaxLon ?? null,
        },
      });
      await db.insert(authUsers).values({
        emailHash: emailHashStr, name: row.deoName, role: 'deo',
        deoId: row.deoId, districtName: row.districtName,
      }).onConflictDoUpdate({
        target: authUsers.emailHash,
        set: { name: row.deoName, deoId: row.deoId, districtName: row.districtName },
      });
      results.push({ email: row.deoEmail, status: 'provisioned' });
    } catch (err) {
      results.push({ email: row.deoEmail, status: 'error', error: String(err) });
    }
  }
  return NextResponse.json({ results });
}
