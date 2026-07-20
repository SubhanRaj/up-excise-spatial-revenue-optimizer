import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { districtCirclesSectors } from '@excise/schema';
import { withErrorHandling } from '@/lib/with-error-handling';


async function GET_(
  _req: NextRequest,
  { params }: { params: Promise<{ district: string }> },
): Promise<NextResponse> {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { district } = await params;
  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  const units = await db
    .select({ name: districtCirclesSectors.name, type: districtCirclesSectors.type })
    .from(districtCirclesSectors)
    .where(eq(districtCirclesSectors.districtName, district))
    .all();

  return NextResponse.json({
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
}

export const GET = withErrorHandling('districts/[district]/template:GET', GET_);
