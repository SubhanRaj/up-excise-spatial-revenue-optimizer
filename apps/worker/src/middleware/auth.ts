import type { MiddlewareHandler } from 'hono';
import type { HonoEnv } from '../types.js';

/** Verifies the Clerk session JWT and enforces role-based access. */
export function requireRole(role: 'deo' | 'admin'): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.slice(7);
    try {
      const parts = token.split('.');
      if (parts.length !== 3 || !parts[1]) throw new Error('malformed');
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

      const meta = payload?.publicMetadata as { role?: string; districtName?: string } | undefined;
      if (meta?.role !== role) {
        return c.json({ error: 'Forbidden' }, 403);
      }

      c.set('deoId', String(payload.sub ?? ''));
      c.set('districtName', meta?.districtName ?? null);
      c.set('role', role);
    } catch {
      return c.json({ error: 'Invalid token' }, 401);
    }

    return next();
  };
}
