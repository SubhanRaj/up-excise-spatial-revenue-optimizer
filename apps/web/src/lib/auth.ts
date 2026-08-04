import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authSessions, authUsers } from '@excise/schema';

const SESSION_COOKIE = 'excise-session';
const ROLE_COOKIE    = 'excise-role';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
// Admin/superadmin only ("remember me" — these accounts sign in via magic link, not the
// per-district CUG flow DEOs use). 7 days, renewed on every /api/auth/session call within
// RENEW_THRESHOLD_MS of expiry (see maybeRenewAdminSession) so an admin who opens the portal
// at least once a week never sees a forced logout — effectively indefinite for normal use,
// without an actually-infinite cookie. DEO sessions are unchanged at SESSION_TTL_MS (24h).
const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RENEW_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: number;
  emailHash: string;
  name: string;
  role: 'deo' | 'admin' | 'superadmin';
  deoId: string;
  districtName: string | null;
  designation: string | null;
};

// ── Crypto ────────────────────────────────────────────────────────────────────

export async function sha256hex(data: string): Promise<string> {
  const buf = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacVerify(data: string, sig: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(data, secret);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

export async function hashToken(token: string): Promise<string> {
  return sha256hex(token);
}

// ── CF env ────────────────────────────────────────────────────────────────────

export async function getEnv(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  return env;
}

// ── Session management ────────────────────────────────────────────────────────

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  const dotIdx = cookie.lastIndexOf('.');
  if (dotIdx < 0) return null;
  const rawId = cookie.slice(0, dotIdx);
  const sig   = cookie.slice(dotIdx + 1);

  const env = await getEnv();
  if (!env.SESSION_SECRET) return null;

  const valid = await hmacVerify(rawId, sig, env.SESSION_SECRET);
  if (!valid) return null;

  const sessionHash = await sha256hex(rawId);
  const db = drizzle(env.DB);

  const row = await db
    .select({
      sessionId:    authSessions.id,
      expiresAt:    authSessions.expiresAt,
      userId:       authSessions.userId,
      emailHash:    authUsers.emailHash,
      name:         authUsers.name,
      role:         authUsers.role,
      deoId:        authUsers.deoId,
      districtName: authUsers.districtName,
      designation:  authUsers.designation,
    })
    .from(authSessions)
    .innerJoin(authUsers, eq(authUsers.id, authSessions.userId))
    .where(eq(authSessions.id, sessionHash))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!row) return null;
  if (new Date(row.expiresAt) < new Date()) {
    await db.delete(authSessions).where(eq(authSessions.id, sessionHash));
    return null;
  }

  const superadminHash = env.SUPERADMIN_EMAIL_HASH || '3d7c1aa91263a2c5b1ed9bc4233205aa2907cdacbb3afcc4eaf09d666bd42610';
  
  if (superadminHash && row.emailHash === superadminHash) {
    return {
      id:           row.userId,
      emailHash:    row.emailHash,
      name:         row.name,
      role:         'superadmin',
      deoId:        row.deoId ?? '',
      districtName: row.districtName ?? null,
      designation:  row.designation ?? null,
    };
  }

  return {
    id:           row.userId,
    emailHash:    row.emailHash,
    name:         row.name,
    role:         row.role as 'deo' | 'admin',
    deoId:        row.deoId ?? '',
    districtName: row.districtName ?? null,
    designation:  row.designation ?? null,
  };
}

export async function requireAuth(minRole: 'deo' | 'admin' = 'deo'): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect('/login');

  if (minRole === 'admin') {
    if (session.role !== 'admin' && session.role !== 'superadmin') redirect('/home');
    return session;
  }

  // minRole === 'deo' — no admin/superadmin bypass. An elevated session landing on a
  // DEO-only server page is sent to its own dashboard instead of rendering a DEO page with
  // no district attached (matches middleware.ts's redirect for the same route group).
  if (session.role !== 'deo') redirect('/admin');
  return session;
}

export async function createSession(userId: number, role: string, districtName: string | null): Promise<void> {
  const rawId = crypto.randomUUID();
  const env   = await getEnv();

  const [sessionHash, sig] = await Promise.all([
    sha256hex(rawId),
    hmacSign(rawId, env.SESSION_SECRET),
  ]);

  const cookieValue = `${rawId}.${sig}`;
  const ttlMs       = role === 'admin' || role === 'superadmin' ? ADMIN_SESSION_TTL_MS : SESSION_TTL_MS;
  const expiresAt   = new Date(Date.now() + ttlMs).toISOString();

  const db = drizzle(env.DB);
  await db.insert(authSessions).values({ id: sessionHash, userId, expiresAt });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, cookieValue, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/',
    maxAge: ttlMs / 1000,
  });
  // role cookie is client-readable (middleware routing hint — not a security boundary)
  cookieStore.set(ROLE_COOKIE, role, {
    httpOnly: false, secure: true, sameSite: 'lax', path: '/',
    maxAge: ttlMs / 1000,
  });
}

// Sliding renewal for admin/superadmin "remember me" sessions — called from the
// /api/auth/session Route Handler only (cookies().set() is forbidden in Server Components,
// see the "Why client component" note on the magic-link flow above). Re-issues both cookies
// with a fresh ADMIN_SESSION_TTL_MS window and bumps the D1 row's expiresAt to match, but only
// when the session is already within RENEW_THRESHOLD_MS of expiring — avoids a write on every
// single request while still keeping an active admin logged in indefinitely.
export async function maybeRenewAdminSession(session: SessionUser): Promise<void> {
  if (session.role !== 'admin' && session.role !== 'superadmin') return;

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE)?.value;
  if (!cookieValue) return;
  const dotIdx = cookieValue.lastIndexOf('.');
  if (dotIdx < 0) return;
  const rawId = cookieValue.slice(0, dotIdx);

  const env = await getEnv();
  const db  = drizzle(env.DB);
  const sessionHash = await sha256hex(rawId);

  const row = await db.select({ expiresAt: authSessions.expiresAt }).from(authSessions)
    .where(eq(authSessions.id, sessionHash)).limit(1).then((r) => r[0] ?? null);
  if (!row) return;

  const remainingMs = new Date(row.expiresAt).getTime() - Date.now();
  if (remainingMs > RENEW_THRESHOLD_MS) return;

  const newExpiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS).toISOString();
  await db.update(authSessions).set({ expiresAt: newExpiresAt }).where(eq(authSessions.id, sessionHash));

  cookieStore.set(SESSION_COOKIE, cookieValue, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/',
    maxAge: ADMIN_SESSION_TTL_MS / 1000,
  });
  cookieStore.set(ROLE_COOKIE, session.role, {
    httpOnly: false, secure: true, sameSite: 'lax', path: '/',
    maxAge: ADMIN_SESSION_TTL_MS / 1000,
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE)?.value;

  if (cookie) {
    const dotIdx = cookie.lastIndexOf('.');
    if (dotIdx >= 0) {
      const rawId       = cookie.slice(0, dotIdx);
      const sessionHash = await sha256hex(rawId);
      const env         = await getEnv();
      const db          = drizzle(env.DB);
      await db.delete(authSessions).where(eq(authSessions.id, sessionHash));
    }
  }

  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(ROLE_COOKIE);
}

