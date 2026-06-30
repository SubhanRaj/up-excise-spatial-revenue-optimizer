import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { validateRow } from '@/lib/validate';
import { phase1RawCollection, districtCirclesSectors, auditLog } from '@excise/schema';
import type { Phase1RowInput } from '@/lib/types';

export const runtime = 'edge';

interface ChunkBody {
  rows: Phase1RowInput[];
  deoId: string;
  districtName: string;
  circleSectorName: string;
  chunkIndex: number;
}

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as ChunkBody;
  const { rows, deoId, districtName, circleSectorName, chunkIndex } = body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'rows must be a non-empty array' }, { status: 400 });
  }
  if (rows.length > 500) {
    return NextResponse.json({ error: 'Maximum 500 rows per chunk' }, { status: 400 });
  }

  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);

  const unit = await db
    .select({ id: districtCirclesSectors.id })
    .from(districtCirclesSectors)
    .where(and(
      eq(districtCirclesSectors.districtName, districtName),
      eq(districtCirclesSectors.name, circleSectorName),
    ))
    .get();

  if (!unit) {
    return NextResponse.json({
      error: `Circle/sector "${circleSectorName}" is not registered for district "${districtName}"`,
    }, { status: 400 });
  }

  const rejected: { rowIndex: number; reason: string }[] = [];
  const accepted: typeof phase1RawCollection.$inferInsert[] = [];
  const now = new Date();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const errors = validateRow(row);
    if (errors.length > 0) {
      rejected.push({ rowIndex: i, reason: errors[0]!.message });
      continue;
    }
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
      db.insert(phase1RawCollection).values(row).onConflictDoUpdate({
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
    const auditStmt = db.insert(auditLog).values({
      eventType: 'upload_chunk',
      deoId,
      districtName,
      ipAddress: req.headers.get('CF-Connecting-IP') ?? null,
      userAgent: req.headers.get('User-Agent') ?? null,
      metadata: JSON.stringify({ chunkIndex, accepted: accepted.length, rejected: rejected.length }),
      createdAt: now,
    });
    const [first, ...rest] = [...stmts, auditStmt];
    // ponytail: audit log in same batch — atomic write
    await db.batch([first!, ...rest]);
  }

  return NextResponse.json({ accepted: accepted.length, rejected });
}
