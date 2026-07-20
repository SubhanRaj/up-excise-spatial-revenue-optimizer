import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { getSession, sha256hex } from '@/lib/auth';
import { districts, authUsers, auditLog } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';


interface ProvisionRow {
  districtName: string; division: string; deoName: string; deoEmail: string;
  deoId: string; expectedVendCount: number;
  bboxMinLat?: number; bboxMaxLat?: number; bboxMinLon?: number; bboxMaxLon?: number;
}

// Owner/superadmin-only — see /admin/provision's page-level gate.
async function POST_(req: NextRequest): Promise<NextResponse> {
  const user = await getSession();
  if (!user || user.role !== 'superadmin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { rows: ProvisionRow[] };
  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  const now = new Date();
  const results: { email: string; status: string; error?: string }[] = [];

  for (const row of body.rows) {
    try {
      const emailHashStr = await sha256hex(row.deoEmail);

      // district row + auth_users row must land together — see CLAUDE.md's
      // "Database Writes — Always Atomic" rule.
      await db.transaction(async (tx) => {
        await tx.insert(districts).values({
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
        await tx.insert(authUsers).values({
          emailHash: emailHashStr, name: row.deoName, role: 'deo',
          deoId: row.deoId, districtName: row.districtName,
        }).onConflictDoUpdate({
          target: authUsers.emailHash,
          set: { name: row.deoName, deoId: row.deoId, districtName: row.districtName },
        });
      });
      results.push({ email: row.deoEmail, status: 'provisioned' });
    } catch (err) {
      results.push({ email: row.deoEmail, status: 'error', error: String(err) });
    }
  }

  await db.insert(auditLog).values({
    eventType: 'bulk_provision',
    deoId: '',
    districtName: null,
    ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
    userAgent: req.headers.get('User-Agent') ?? null,
    metadata: JSON.stringify({
      total: body.rows.length,
      provisioned: results.filter((r) => r.status === 'provisioned').length,
      failed: results.filter((r) => r.status === 'error').length,
    }),
    actorName: user.name,
    actorDesignation: user.designation,
    createdAt: now,
  });

  return NextResponse.json({ results });
}

export const POST = withErrorHandling('admin/bulk-provision:POST', POST_);
