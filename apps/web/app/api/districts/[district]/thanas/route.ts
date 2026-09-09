import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districtThanas } from '@excise/schema';
import { looseThanaName } from '@/lib/thana-name';
import { withErrorHandling } from '@/lib/with-error-handling';

// Derived Thana master for the signed-in DEO's district (migrations/0012). Returns the
// distinct normalised thana_key set (strict "is it known" check) plus thanaNames — one
// real-casing display name per loose key, for the Verify page's "did you mean X?" spelling
// suggestion. The Verify page caches this in IndexedDB (7-day TTL) so it costs one D1 read
// per district per device per week, not one per Verify visit.
// District-level only: 28% of Thanas legitimately appear in more than one circle/sector,
// so a per-circle check would false-positive constantly (see the migration comment).
async function GET_(
  _req: NextRequest,
  { params }: { params: Promise<{ district: string }> },
): Promise<NextResponse> {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { district } = await params;
  if (user.districtName !== district) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const rows = await db.select({ thanaKey: districtThanas.thanaKey, thanaName: districtThanas.thanaName })
    .from(districtThanas).where(eq(districtThanas.districtName, district)).all();

  const byLoose = new Map<string, string>(); // first-seen real casing per loose key
  for (const r of rows) {
    const loose = looseThanaName(r.thanaName);
    if (loose && !byLoose.has(loose)) byLoose.set(loose, r.thanaName.trim());
  }

  return NextResponse.json({
    thanaKeys: [...new Set(rows.map((r) => r.thanaKey))],
    thanaNames: [...byLoose.values()],
  });
}

export const GET = withErrorHandling('districts/[district]/thanas:GET', GET_);
