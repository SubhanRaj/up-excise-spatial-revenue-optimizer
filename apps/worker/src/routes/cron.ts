import { drizzle } from 'drizzle-orm/d1';
import { lt } from 'drizzle-orm';
import { auditLog } from '@excise/schema';
import type { Env } from '../types.js';

const RETENTION_MS = 45 * 24 * 60 * 60 * 1000;

/** Cloudflare Cron Trigger — runs daily at 02:00 UTC (wrangler.toml [triggers]) */
export async function handleCron(env: Env): Promise<void> {
  const db = drizzle(env.DB);
  const cutoff = new Date(Date.now() - RETENTION_MS);
  await db.delete(auditLog).where(lt(auditLog.createdAt, cutoff));
}
