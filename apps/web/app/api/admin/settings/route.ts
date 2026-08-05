import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { appSettings, districts, auditLog } from '@excise/schema';
import { isLocked } from '@/lib/status';
import { withErrorHandling } from '@/lib/with-error-handling';

const SETTINGS_ID = 1;

async function GET_(): Promise<NextResponse> {
  const user = await getSession();
  if (!user || !['admin', 'superadmin'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const [settingsRow, allStatuses, totalRows] = await Promise.all([
    db.select().from(appSettings).where(eq(appSettings.id, SETTINGS_ID)).get(),
    db.select({ status: districts.status }).from(districts).all(),
    db.select({ total: count() }).from(districts).all(),
  ]);
  const total = totalRows[0]?.total ?? 0;

  return NextResponse.json({
    verificationPhaseOpen: settingsRow?.verificationPhaseOpen ?? false,
    submittedCount: allStatuses.filter((d) => isLocked(d.status)).length,
    totalDistricts: total,
  });
}

export const GET = withErrorHandling('admin/settings:GET', GET_);

// Owner/superadmin-only — this flag changes what every DEO with a submitted district sees on
// next page load, same blast radius as District Master edits.
async function POST_(req: NextRequest): Promise<NextResponse> {
  const user = await getSession();
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { verificationPhaseOpen?: boolean };
  if (typeof body.verificationPhaseOpen !== 'boolean') {
    return NextResponse.json({ error: 'verificationPhaseOpen (boolean) is required' }, { status: 400 });
  }

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  const now = new Date();

  await db.batch([
    db.update(appSettings).set({ verificationPhaseOpen: body.verificationPhaseOpen, updatedAt: now }).where(eq(appSettings.id, SETTINGS_ID)),
    db.insert(auditLog).values({
      eventType: 'verification_phase_toggled',
      deoId: user.deoId ?? '',
      districtName: null,
      ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
      userAgent: req.headers.get('User-Agent') ?? null,
      metadata: JSON.stringify({ verificationPhaseOpen: body.verificationPhaseOpen }),
      actorName: user.name,
      actorDesignation: user.designation,
      createdAt: now,
    }),
  ]);

  const [allStatuses, totalRows] = await Promise.all([
    db.select({ status: districts.status }).from(districts).all(),
    db.select({ total: count() }).from(districts).all(),
  ]);

  return NextResponse.json({
    verificationPhaseOpen: body.verificationPhaseOpen,
    submittedCount: allStatuses.filter((d) => isLocked(d.status)).length,
    totalDistricts: totalRows[0]?.total ?? 0,
  });
}

export const POST = withErrorHandling('admin/settings:POST', POST_);
