import { NextRequest, NextResponse } from 'next/server';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { getSession, sha256hex, getEnv } from '@/lib/auth';
import { authUsers, authSessions, authMagicLinks, auditLog } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LEN = 100;

function sanitizeText(value: unknown, maxLen = MAX_LEN): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1F\x7F]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

type Ctx = { params: Promise<{ id: string }> };

async function loadTarget(db: ReturnType<typeof drizzle>, id: number) {
  return db.select().from(authUsers).where(eq(authUsers.id, id)).get();
}

interface PatchBody { name?: string; email?: string; designation?: string | null }

// Owner/superadmin-only. Only ever touches role: 'admin' rows — DEO accounts are edited via
// PATCH /api/admin/districts/[district] instead, which keeps districts.deo_name in sync.
async function PATCH_(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getSession();
  if (!user || user.role !== 'superadmin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });

  const env = await getEnv();
  const db = drizzle(env.DB);
  const existing = await loadTarget(db, id);
  if (!existing || existing.role !== 'admin') return NextResponse.json({ error: 'Admin user not found' }, { status: 404 });

  const body = await req.json() as PatchBody;
  const isOwnerRow = env.SUPERADMIN_EMAIL_HASH != null && existing.emailHash === env.SUPERADMIN_EMAIL_HASH;

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = sanitizeText(body.name);
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    if (name !== existing.name) updates.name = name;
  }

  if (body.designation !== undefined) {
    const designation = body.designation === null ? null : (sanitizeText(body.designation) || null);
    if (designation !== existing.designation) updates.designation = designation;
  }

  let newEmailHash: string | undefined;
  if (body.email !== undefined) {
    if (isOwnerRow) {
      return NextResponse.json({ error: 'The owner account\'s email is fixed by server configuration and cannot be changed here' }, { status: 400 });
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !EMAIL_RE.test(email) || email.length > 200) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }
    newEmailHash = await sha256hex(email);
    if (newEmailHash !== existing.emailHash) {
      const conflict = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.emailHash, newEmailHash)).get();
      if (conflict) return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
      updates.emailHash = newEmailHash;
    } else {
      newEmailHash = undefined;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
  }

  const batchStmts: any[] = [
    db.update(authUsers).set(updates).where(eq(authUsers.id, id)),
    db.insert(auditLog).values({
      eventType: 'admin_user_updated',
      deoId: '',
      ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
      userAgent: req.headers.get('User-Agent') ?? null,
      metadata: JSON.stringify({ userId: id, fields: Object.keys(updates) }),
      actorName: user.name,
      actorDesignation: user.designation,
      createdAt: new Date(),
    }),
  ];
  // Changing email invalidates existing sessions/magic links tied to the old address —
  // force a fresh sign-in with the new one.
  if (newEmailHash) {
    batchStmts.push(db.delete(authMagicLinks).where(eq(authMagicLinks.emailHash, existing.emailHash)));
  }

  await db.batch(batchStmts as any);

  return NextResponse.json({ ok: true });
}

export const PATCH = withErrorHandling('admin/users/[id]:PATCH', PATCH_);

// Owner/superadmin-only. Cannot delete the owner's own row (would lock out the only
// superadmin) or your own session's row.
async function DELETE_(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getSession();
  if (!user || user.role !== 'superadmin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });

  const env = await getEnv();
  const db = drizzle(env.DB);
  const existing = await loadTarget(db, id);
  if (!existing || existing.role !== 'admin') return NextResponse.json({ error: 'Admin user not found' }, { status: 404 });

  const isOwnerRow = env.SUPERADMIN_EMAIL_HASH != null && existing.emailHash === env.SUPERADMIN_EMAIL_HASH;
  if (isOwnerRow) return NextResponse.json({ error: 'The owner account cannot be deleted' }, { status: 400 });
  if (existing.id === user.id) return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });

  await db.batch([
    db.delete(authSessions).where(eq(authSessions.userId, id)),
    db.delete(authMagicLinks).where(eq(authMagicLinks.emailHash, existing.emailHash)),
    db.delete(authUsers).where(eq(authUsers.id, id)),
    db.insert(auditLog).values({
      eventType: 'admin_user_deleted',
      deoId: '',
      ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
      userAgent: req.headers.get('User-Agent') ?? null,
      metadata: JSON.stringify({ userId: id, name: existing.name }),
      actorName: user.name,
      actorDesignation: user.designation,
      createdAt: new Date(),
    }),
  ] as any);

  return NextResponse.json({ ok: true });
}

export const DELETE = withErrorHandling('admin/users/[id]:DELETE', DELETE_);
