import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { phase1RawCollection, districtCirclesSectors, auditLog } from '@excise/schema';
import type { HonoEnv, ChunkBody, RejectedRow } from '../types.js';
import { validateRow } from '../lib/validate.js';
import { requireRole } from '../middleware/auth.js';

export const uploadRouter = new Hono<HonoEnv>();

uploadRouter.post('/chunk', requireRole('deo'), async (c) => {
  const body = await c.req.json<ChunkBody>();
  const { rows, deoId, districtName, circleSectorName, chunkIndex } = body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return c.json({ error: 'rows must be a non-empty array' }, 400);
  }
  if (rows.length > 500) {
    return c.json({ error: 'Maximum 500 rows per chunk' }, 400);
  }

  const db = drizzle(c.env.DB);

  const unit = await db
    .select({ id: districtCirclesSectors.id })
    .from(districtCirclesSectors)
    .where(
      and(
        eq(districtCirclesSectors.districtName, districtName),
        eq(districtCirclesSectors.name, circleSectorName)
      )
    )
    .get();

  if (!unit) {
    return c.json({
      error: `Circle/sector "${circleSectorName}" is not registered for district "${districtName}"`,
    }, 400);
  }

  const rejected: RejectedRow[] = [];
  const accepted: typeof phase1RawCollection.$inferInsert[] = [];
  const now = new Date();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const err = validateRow(row, i);
    if (err) { rejected.push(err); continue; }

    accepted.push({
      districtName: row.districtName,
      circleSectorName: row.circleSectorName,
      thanaName: row.thanaName,
      adjacentThanasRaw: row.adjacentThanasRaw,
      shopId: row.shopId,
      shopName: row.shopName,
      shopType: row.shopType,
      hasCl5cc: row.hasCl5cc,
      latitudeDms: row.latitudeDms,
      longitudeDms: row.longitudeDms,
      latitudeDecimal: row.latitudeDecimal,
      longitudeDecimal: row.longitudeDecimal,
      licenseFeeLf: row.licenseFeeLf,
      basicLicenseFeeBlf: row.basicLicenseFeeBlf,
      mgrAmount: row.mgrAmount,
      compositeLfFl: row.compositeLfFl,
      compositeLfBeer: row.compositeLfBeer,
      compositeMgrFl: row.compositeMgrFl,
      compositeMgrBeer: row.compositeMgrBeer,
      mgqQuantity: row.mgqQuantity,
      considerationFee: row.considerationFee,
      specialBeerLf: row.specialBeerLf,
      specialBeerMgr: row.specialBeerMgr,
      totalRevenue: row.totalRevenue,
      uploadedByDeo: deoId,
      createdAt: now,
    });
  }

  if (accepted.length > 0) {
    const stmts = accepted.map((row) =>
      db
        .insert(phase1RawCollection)
        .values(row)
        .onConflictDoUpdate({
          target: [phase1RawCollection.shopId, phase1RawCollection.districtName],
          set: {
            circleSectorName: row.circleSectorName,
            thanaName: row.thanaName,
            adjacentThanasRaw: row.adjacentThanasRaw,
            shopName: row.shopName,
            shopType: row.shopType,
            hasCl5cc: row.hasCl5cc,
            latitudeDms: row.latitudeDms,
            longitudeDms: row.longitudeDms,
            latitudeDecimal: row.latitudeDecimal,
            longitudeDecimal: row.longitudeDecimal,
            licenseFeeLf: row.licenseFeeLf,
            basicLicenseFeeBlf: row.basicLicenseFeeBlf,
            mgrAmount: row.mgrAmount,
            compositeLfFl: row.compositeLfFl,
            compositeLfBeer: row.compositeLfBeer,
            compositeMgrFl: row.compositeMgrFl,
            compositeMgrBeer: row.compositeMgrBeer,
            mgqQuantity: row.mgqQuantity,
            considerationFee: row.considerationFee,
            specialBeerLf: row.specialBeerLf,
            specialBeerMgr: row.specialBeerMgr,
            totalRevenue: row.totalRevenue,
            uploadedByDeo: row.uploadedByDeo,
          },
        })
    );
    // ponytail: audit log included in batch — all writes are atomic in one D1 transaction
    const auditStmt = db.insert(auditLog).values({
      eventType: 'upload_chunk',
      deoId,
      districtName,
      ipAddress: c.req.header('CF-Connecting-IP') ?? null,
      userAgent: c.req.header('User-Agent') ?? null,
      metadata: JSON.stringify({ chunkIndex, accepted: accepted.length, rejected: rejected.length }),
      createdAt: now,
    });
    const [first, ...rest] = [...stmts, auditStmt];
    await db.batch([first!, ...rest]);
  }

  return c.json({ accepted: accepted.length, rejected });
});
