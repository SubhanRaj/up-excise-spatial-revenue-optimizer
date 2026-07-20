import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { phase1RawCollection } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';


// District detail page generates XLSX client-side from already-loaded state.
// This endpoint is kept as a JSON fallback for programmatic/API consumers.
async function GET_(
  _req: NextRequest,
  { params }: { params: Promise<{ district: string }> },
): Promise<NextResponse> {
  const user = await getSession();
  if (!user || !['admin', 'superadmin'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { district } = await params;
  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  const rows = await db.select().from(phase1RawCollection)
    .where(eq(phase1RawCollection.districtName, district)).all();

  return NextResponse.json({ rows });
}

export const GET = withErrorHandling('admin/districts/[district]/export:GET', GET_);
