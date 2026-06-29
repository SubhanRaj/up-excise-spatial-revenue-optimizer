import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count, sum, desc, asc, like, and } from 'drizzle-orm';
import { districts, phase1RawCollection, districtCirclesSectors, auditLog } from '@excise/schema';
import type { HonoEnv } from '../types.js';
import { requireRole } from '../middleware/auth.js';

export const adminRouter = new Hono<HonoEnv>();

adminRouter.get('/districts', requireRole('admin'), async (c) => {
  const db = drizzle(c.env.DB);
  const [districtRows, aggregates] = await Promise.all([
    db.select({ name: districts.name, division: districts.division, deoName: districts.deoName, expectedVendCount: districts.expectedVendCount, status: districts.status, submittedAt: districts.submittedAt })
      .from(districts).orderBy(asc(districts.name)).all(),
    db.select({ districtName: phase1RawCollection.districtName, vendCount: count(phase1RawCollection.id), totalRevenue: sum(phase1RawCollection.totalRevenue) })
      .from(phase1RawCollection).groupBy(phase1RawCollection.districtName).all(),
  ]);

  const aggMap = Object.fromEntries(aggregates.map((a) => [a.districtName, { vendCount: a.vendCount, totalRevenue: Number(a.totalRevenue ?? 0) }]));
  const rows = districtRows.map((d) => ({ ...d, vendCount: aggMap[d.name]?.vendCount ?? 0, totalRevenue: aggMap[d.name]?.totalRevenue ?? 0 }));
  const stateTotals = { totalVendCount: rows.reduce((s, r) => s + r.vendCount, 0), totalRevenue: rows.reduce((s, r) => s + r.totalRevenue, 0) };

  return c.json({ districts: rows, stateTotals });
});

adminRouter.get('/districts/:district', requireRole('admin'), async (c) => {
  const district = c.req.param('district')!;
  const db = drizzle(c.env.DB);
  const [meta, units, agg] = await Promise.all([
    db.select().from(districts).where(eq(districts.name, district)).get(),
    db.select().from(districtCirclesSectors).where(eq(districtCirclesSectors.districtName, district)).all(),
    db.select({ vendCount: count(phase1RawCollection.id), totalRevenue: sum(phase1RawCollection.totalRevenue) })
      .from(phase1RawCollection).where(eq(phase1RawCollection.districtName, district)).get(),
  ]);
  if (!meta) return c.json({ error: 'District not found' }, 404);
  return c.json({ ...meta, units, vendCount: agg?.vendCount ?? 0, totalRevenue: Number(agg?.totalRevenue ?? 0) });
});

adminRouter.get('/districts/:district/shops', requireRole('admin'), async (c) => {
  const district = c.req.param('district')!;
  const page = Math.max(1, Number(c.req.query('page') ?? 1));
  const PAGE_SIZE = 100;
  const db = drizzle(c.env.DB);

  const [rows, total] = await Promise.all([
    db.select().from(phase1RawCollection).where(eq(phase1RawCollection.districtName, district)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).all(),
    db.select({ n: count(phase1RawCollection.id) }).from(phase1RawCollection).where(eq(phase1RawCollection.districtName, district)).get(),
  ]);
  return c.json({ rows, total: total?.n ?? 0, page, pageSize: PAGE_SIZE });
});

adminRouter.get('/map-data', requireRole('admin'), async (c) => {
  const db = drizzle(c.env.DB);
  const [districtRows, aggregates] = await Promise.all([
    db.select({ name: districts.name, status: districts.status, expectedVendCount: districts.expectedVendCount }).from(districts).all(),
    db.select({ districtName: phase1RawCollection.districtName, vendCount: count(phase1RawCollection.id), totalRevenue: sum(phase1RawCollection.totalRevenue) })
      .from(phase1RawCollection).groupBy(phase1RawCollection.districtName).all(),
  ]);
  const aggMap = Object.fromEntries(aggregates.map((a) => [a.districtName, { vendCount: a.vendCount, totalRevenue: Number(a.totalRevenue ?? 0) }]));
  return c.json(districtRows.map((d) => ({ name: d.name, status: d.status, expectedVendCount: d.expectedVendCount, vendCount: aggMap[d.name]?.vendCount ?? 0, totalRevenue: aggMap[d.name]?.totalRevenue ?? 0 })));
});

adminRouter.get('/search', requireRole('admin'), async (c) => {
  const db = drizzle(c.env.DB);
  const PAGE_SIZE = 50;
  const page = Math.max(1, Number(c.req.query('page') ?? 1));
  const conditions = [];
  const qDistrict = c.req.query('district');
  const qThana = c.req.query('thana');
  const qType = c.req.query('shopType');
  const qCircle = c.req.query('circleSector');
  const q = c.req.query('q');
  if (qDistrict) conditions.push(eq(phase1RawCollection.districtName, qDistrict));
  if (qThana) conditions.push(eq(phase1RawCollection.thanaName, qThana));
  if (qType) conditions.push(eq(phase1RawCollection.shopType, qType));
  if (qCircle) conditions.push(eq(phase1RawCollection.circleSectorName, qCircle));
  // ponytail: LIKE scan acceptable at 30K rows; add FTS5 if >1s
  if (q) conditions.push(like(phase1RawCollection.shopName, `%${q}%`));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, total] = await Promise.all([
    db.select().from(phase1RawCollection).where(where).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).all(),
    db.select({ n: count(phase1RawCollection.id) }).from(phase1RawCollection).where(where).get(),
  ]);
  return c.json({ rows, total: total?.n ?? 0, page, pageSize: PAGE_SIZE });
});

adminRouter.post('/bulk-provision', requireRole('admin'), async (c) => {
  const body = await c.req.json<{
    rows: Array<{ districtName: string; division: string; deoName: string; deoEmail: string; deoId: string; expectedVendCount: number; bboxMinLat?: number; bboxMaxLat?: number; bboxMinLon?: number; bboxMaxLon?: number }>;
  }>();
  const db = drizzle(c.env.DB);
  const now = new Date();
  const results: Array<{ email: string; status: string; error?: string }> = [];

  for (const row of body.rows) {
    try {
      await db.insert(districts).values({ name: row.districtName, division: row.division, deoName: row.deoName, deoEmail: row.deoEmail, deoId: row.deoId, expectedVendCount: row.expectedVendCount, bboxMinLat: row.bboxMinLat ?? null, bboxMaxLat: row.bboxMaxLat ?? null, bboxMinLon: row.bboxMinLon ?? null, bboxMaxLon: row.bboxMaxLon ?? null, status: 'pending', createdAt: now })
        .onConflictDoUpdate({ target: districts.name, set: { division: row.division, deoName: row.deoName, deoEmail: row.deoEmail, deoId: row.deoId, expectedVendCount: row.expectedVendCount, bboxMinLat: row.bboxMinLat ?? null, bboxMaxLat: row.bboxMaxLat ?? null, bboxMinLon: row.bboxMinLon ?? null, bboxMaxLon: row.bboxMaxLon ?? null } });

      const clerkRes = await fetch('https://api.clerk.com/v1/users', {
        method: 'POST',
        headers: { Authorization: `Bearer ${c.env.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_address: [row.deoEmail], public_metadata: { role: 'deo', districtName: row.districtName }, skip_password_requirement: true }),
      });
      results.push({ email: row.deoEmail, status: clerkRes.ok ? 'created' : 'existing' });
    } catch (err) {
      results.push({ email: row.deoEmail, status: 'error', error: String(err) });
    }
  }
  return c.json({ results });
});

adminRouter.get('/audit-log', requireRole('admin'), async (c) => {
  const db = drizzle(c.env.DB);
  const page = Math.max(1, Number(c.req.query('page') ?? 1));
  const PAGE_SIZE = 100;
  const rows = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE).all();
  return c.json({ rows, page, pageSize: PAGE_SIZE });
});

adminRouter.get('/districts/:district/export', requireRole('admin'), async (c) => {
  const district = c.req.param('district')!;
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(phase1RawCollection).where(eq(phase1RawCollection.districtName, district)).all();
  const header = Object.keys(rows[0] ?? {}).join(',');
  const csv = [header, ...rows.map((r) => Object.values(r).join(','))].join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${district}-shops.csv"` } });
});

adminRouter.get('/export/all', requireRole('admin'), async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(phase1RawCollection).all();
  const header = Object.keys(rows[0] ?? {}).join(',');
  const csv = [header, ...rows.map((r) => Object.values(r).join(','))].join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="phase1-all-districts.csv"' } });
});
