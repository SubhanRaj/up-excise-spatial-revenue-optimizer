import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, count, sum } from 'drizzle-orm';
import { districts, districtCirclesSectors, phase1RawCollection, auditLog } from '@excise/schema';
import type { HonoEnv } from '../types.js';
import { requireRole } from '../middleware/auth.js';

export const districtsRouter = new Hono<HonoEnv>();

districtsRouter.get('/', requireRole('deo'), async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({ name: districts.name, division: districts.division })
    .from(districts)
    .orderBy(districts.name)
    .all();
  return c.json(rows);
});

districtsRouter.get('/:district/units', requireRole('deo'), async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select()
    .from(districtCirclesSectors)
    .where(eq(districtCirclesSectors.districtName, c.req.param('district')!))
    .all();
  return c.json(rows);
});

districtsRouter.post('/:district/units', requireRole('deo'), async (c) => {
  const body = await c.req.json<{ name: string; type: 'circle' | 'sector' }>();
  if (!body.name?.trim() || !['circle', 'sector'].includes(body.type)) {
    return c.json({ error: 'name and type (circle|sector) required' }, 400);
  }
  const db = drizzle(c.env.DB);
  const deoId = c.get('deoId');
  const districtName = c.req.param('district')!;
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(districtCirclesSectors).values({
      districtName,
      name: body.name.trim(),
      type: body.type,
      createdByDeo: deoId,
      createdAt: now,
    });
    await tx.insert(auditLog).values({
      eventType: 'unit_registered',
      deoId,
      districtName,
      ipAddress: c.req.header('CF-Connecting-IP') ?? null,
      userAgent: c.req.header('User-Agent') ?? null,
      metadata: JSON.stringify({ name: body.name, type: body.type }),
      createdAt: now,
    });
  });

  return c.json({ ok: true });
});

districtsRouter.get('/:district/template', requireRole('deo'), async (c) => {
  const district = c.req.param('district')!;
  const db = drizzle(c.env.DB);
  const units = await db
    .select({ name: districtCirclesSectors.name, type: districtCirclesSectors.type })
    .from(districtCirclesSectors)
    .where(eq(districtCirclesSectors.districtName, district))
    .all();

  return c.json({
    districtName: district,
    units,
    columns: [
      'circle_sector_name', 'thana_name', 'adjacent_thanas_raw',
      'shop_id', 'shop_name', 'shop_type', 'has_cl5cc',
      'latitude_dms', 'longitude_dms', 'latitude_decimal', 'longitude_decimal',
      'license_fee_lf', 'basic_license_fee_blf',
      'mgr_amount', 'composite_lf_fl', 'composite_lf_beer',
      'composite_mgr_fl', 'composite_mgr_beer', 'mgq_quantity',
      'consideration_fee', 'special_beer_lf', 'special_beer_mgr',
    ],
  });
});

districtsRouter.get('/:district/status', requireRole('deo'), async (c) => {
  const district = c.req.param('district')!;
  const db = drizzle(c.env.DB);

  const [units, uploaded] = await Promise.all([
    db.select({ name: districtCirclesSectors.name }).from(districtCirclesSectors)
      .where(eq(districtCirclesSectors.districtName, district)).all(),
    db.select({ circleSectorName: phase1RawCollection.circleSectorName, rowCount: count(phase1RawCollection.id) })
      .from(phase1RawCollection).where(eq(phase1RawCollection.districtName, district))
      .groupBy(phase1RawCollection.circleSectorName).all(),
  ]);

  const uploadedMap = Object.fromEntries(uploaded.map((u) => [u.circleSectorName, u.rowCount]));
  const summary = units.map((u) => ({ name: u.name, rowCount: uploadedMap[u.name] ?? 0 }));
  return c.json({ units: summary, canSubmit: summary.every((s) => s.rowCount > 0) });
});

districtsRouter.post('/:district/submit', requireRole('deo'), async (c) => {
  const district = c.req.param('district')!;
  const db = drizzle(c.env.DB);
  const deoId = c.get('deoId');

  const [units, uploaded] = await Promise.all([
    db.select({ name: districtCirclesSectors.name }).from(districtCirclesSectors)
      .where(eq(districtCirclesSectors.districtName, district)).all(),
    db.select({ circleSectorName: phase1RawCollection.circleSectorName })
      .from(phase1RawCollection).where(eq(phase1RawCollection.districtName, district))
      .groupBy(phase1RawCollection.circleSectorName).all(),
  ]);

  const uploadedNames = new Set(uploaded.map((u) => u.circleSectorName));
  const missing = units.filter((u) => !uploadedNames.has(u.name)).map((u) => u.name);
  if (missing.length > 0) {
    return c.json({ error: `Missing data for units: ${missing.join(', ')}` }, 400);
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(districts).set({ status: 'submitted', submittedAt: now }).where(eq(districts.name, district));
    await tx.insert(auditLog).values({
      eventType: 'district_submitted',
      deoId,
      districtName: district,
      ipAddress: c.req.header('CF-Connecting-IP') ?? null,
      userAgent: c.req.header('User-Agent') ?? null,
      metadata: JSON.stringify({ submittedAt: now.toISOString() }),
      createdAt: now,
    });
  });

  return c.json({ ok: true, submittedAt: now.toISOString() });
});

export async function computeStateTotals(db: ReturnType<typeof drizzle>) {
  const result = await db
    .select({ totalVendCount: count(phase1RawCollection.id), totalRevenue: sum(phase1RawCollection.totalRevenue) })
    .from(phase1RawCollection)
    .get();
  return { totalVendCount: result?.totalVendCount ?? 0, totalRevenue: Number(result?.totalRevenue ?? 0) };
}
