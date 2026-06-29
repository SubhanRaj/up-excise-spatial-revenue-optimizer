import { Hono } from 'hono';
import { Webhook } from 'svix';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { auditLog, districts } from '@excise/schema';
import type { HonoEnv } from '../types.js';

export const webhooksRouter = new Hono<HonoEnv>();

webhooksRouter.post('/clerk', async (c) => {
  const body = await c.req.text();
  const svixId = c.req.header('svix-id') ?? '';
  const svixTimestamp = c.req.header('svix-timestamp') ?? '';
  const svixSignature = c.req.header('svix-signature') ?? '';

  let event: { type: string; data: Record<string, unknown> };
  try {
    const wh = new Webhook(c.env.CLERK_WEBHOOK_SIGNING_SECRET);
    event = wh.verify(body, { 'svix-id': svixId, 'svix-timestamp': svixTimestamp, 'svix-signature': svixSignature }) as typeof event;
  } catch {
    return c.json({ error: 'Invalid webhook signature' }, 400);
  }

  const db = drizzle(c.env.DB);
  const now = new Date();
  const eventTypeMap: Record<string, string> = { 'session.created': 'login', 'session.ended': 'logout', 'session.revoked': 'session_revoked' };
  const auditEventType = eventTypeMap[event.type] ?? event.type;
  const userId = String(event.data?.user_id ?? event.data?.id ?? 'unknown');
  const userMeta = (event.data?.public_metadata ?? {}) as { districtName?: string };
  const districtName = userMeta.districtName ?? null;

  await db.insert(auditLog).values({
    eventType: auditEventType,
    deoId: userId,
    districtName,
    metadata: JSON.stringify({ clerkEventType: event.type }),
    createdAt: now,
  });

  if (event.type === 'district.submitted' && districtName) {
    await db.update(districts).set({ status: 'submitted', submittedAt: now }).where(eq(districts.name, districtName));
  }

  return c.json({ ok: true });
});
