import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { divisionLocks, auditLog } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

type Ctx = { params: Promise<{ division: string }> };

// M-103 — state HQ removes a division lock so corrections can flow again. This is the only
// way a locked division reopens: a deputy cannot undo their own lock, and a DEO in a locked
// division cannot self-request an unlock. Requires a note (audit-logged).
async function DELETE_(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getSession();
  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const division = decodeURIComponent((await params).division);

  const body = await req.json().catch(() => ({})) as { note?: unknown };
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
  if (!note) return NextResponse.json({ error: 'A note is required' }, { status: 400 });

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const existing = await db.select().from(divisionLocks).where(eq(divisionLocks.division, division)).get();
  if (!existing) return NextResponse.json({ error: 'This division is not locked' }, { status: 409 });

  const now = new Date();
  await db.batch([
    db.delete(divisionLocks).where(eq(divisionLocks.division, division)),
    db.insert(auditLog).values({
      eventType: 'division_unlocked',
      deoId: user.deoId ?? '',
      districtName: null,
      ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
      userAgent: req.headers.get('User-Agent') ?? null,
      metadata: JSON.stringify({ division, note }),
      actorName: user.name,
      actorDesignation: user.designation,
      createdAt: now,
    }),
  ]);

  return NextResponse.json({ ok: true });
}

export const DELETE = withErrorHandling('admin/divisions/[division]/lock:DELETE', DELETE_);
