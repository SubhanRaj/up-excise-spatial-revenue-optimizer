import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authSessions, authUsers } from '@excise/schema';

const SESSION_COOKIE = 'excise-session';
const ROLE_COOKIE    = 'excise-role';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: 'deo' | 'admin';
  deoId: string;
  districtName: string | null;
};

// ── Crypto ────────────────────────────────────────────────────────────────────

async function sha256hex(data: string): Promise<string> {
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

async function getEnv(): Promise<CloudflareEnv> {
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
      email:        authUsers.email,
      name:         authUsers.name,
      role:         authUsers.role,
      deoId:        authUsers.deoId,
      districtName: authUsers.districtName,
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

  return {
    id:           row.userId,
    email:        row.email,
    name:         row.name,
    role:         row.role as 'deo' | 'admin',
    deoId:        row.deoId ?? row.email,
    districtName: row.districtName ?? null,
  };
}

export async function requireAuth(minRole: 'deo' | 'admin' = 'deo'): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (minRole === 'admin' && session.role !== 'admin') redirect('/login');
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
  const expiresAt   = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const db = drizzle(env.DB);
  await db.insert(authSessions).values({ id: sessionHash, userId, expiresAt });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, cookieValue, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
  // role cookie is client-readable (middleware routing hint — not a security boundary)
  cookieStore.set(ROLE_COOKIE, role, {
    httpOnly: false, secure: true, sameSite: 'lax', path: '/',
    maxAge: SESSION_TTL_MS / 1000,
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

