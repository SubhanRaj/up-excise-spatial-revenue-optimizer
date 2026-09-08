import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districts, auditLog } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

type Ctx = { params: Promise<{ district: string }> };

// M-102 — a Deputy Excise Commissioner's per-district sign-off. Writes one audit-log row and
// nothing else: no data mutation, no status change. Read back by GET /api/deputy/reviews.
async function POST_(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getSession();
  if (!user || user.role !== 'deputy' || !user.division) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { district } = await params;
  const body = await req.json().catch(() => ({})) as { verdict?: unknown; note?: unknown };
  const verdict = body.verdict === 'ok' || body.verdict === 'flagged' ? body.verdict : null;
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!verdict) return NextResponse.json({ error: "verdict must be 'ok' or 'flagged'" }, { status: 400 });
  if (verdict === 'flagged' && !note) return NextResponse.json({ error: 'A note is required when flagging an issue' }, { status: 400 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const d = await db.select({ division: districts.division }).from(districts).where(eq(districts.name, district)).get();
  if (!d) return NextResponse.json({ error: 'District not found' }, { status: 404 });
  if (d.division !== user.division) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const now = new Date();
  await db.insert(auditLog).values({
    eventType: 'deputy_district_reviewed',
    deoId: user.deoId ?? '',
    districtName: district,
    ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
    userAgent: req.headers.get('User-Agent') ?? null,
    metadata: JSON.stringify({ verdict, note }),
    actorName: user.name,
    actorDesignation: user.designation,
    createdAt: now,
  });

  return NextResponse.json({ ok: true, verdict, note, at: now.getTime(), actorName: user.name });
}

export const POST = withErrorHandling('deputy/districts/[district]/review:POST', POST_);
