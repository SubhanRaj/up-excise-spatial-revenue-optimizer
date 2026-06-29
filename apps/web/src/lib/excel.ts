'use client';

import { normalizeCoordinates } from './coordinates';
import { computeRevenue } from './revenue';
import type { StagedRow } from './types';

/** Column name → Phase1Row field mapping for the standardized DEO Excel template. */
const COL_MAP: Record<string, keyof StagedRow> = {
  circle_sector_name: 'circleSectorName',
  thana_name: 'thanaName',
  adjacent_thanas_raw: 'adjacentThanasRaw',
  shop_id: 'shopId',
  shop_name: 'shopName',
  shop_type: 'shopType',
  has_cl5cc: 'hasCl5cc',
  latitude_dms: 'latitudeDms',
  longitude_dms: 'longitudeDms',
  latitude_decimal: 'latitudeDecimal',
  longitude_decimal: 'longitudeDecimal',
  license_fee_lf: 'licenseFeeLf',
  basic_license_fee_blf: 'basicLicenseFeeBlf',
  mgr_amount: 'mgrAmount',
  composite_lf_fl: 'compositeLfFl',
  composite_lf_beer: 'compositeLfBeer',
  composite_mgr_fl: 'compositeMgrFl',
  composite_mgr_beer: 'compositeMgrBeer',
  mgq_quantity: 'mgqQuantity',
  consideration_fee: 'considerationFee',
  special_beer_lf: 'specialBeerLf',
  special_beer_mgr: 'specialBeerMgr',
};

const NUM_FIELDS = new Set<keyof StagedRow>([
  'licenseFeeLf', 'basicLicenseFeeBlf', 'mgrAmount',
  'compositeLfFl', 'compositeLfBeer', 'compositeMgrFl', 'compositeMgrBeer',
  'mgqQuantity', 'considerationFee', 'specialBeerLf', 'specialBeerMgr',
  'latitudeDecimal', 'longitudeDecimal',
]);

declare global {
  // SheetJS is loaded from CDN — not bundled
  const XLSX: {
    read: (data: ArrayBuffer, opts: { type: string }) => {
      SheetNames: string[];
      Sheets: Record<string, unknown>;
    };
    utils: {
      sheet_to_json: (sheet: unknown) => Record<string, unknown>[];
    };
  };
}

/**
 * Parses a DEO Excel file (loaded from SheetJS CDN) into StagedRows.
 * All heavy work runs in the browser — zero Worker CPU.
 */
export async function parseExcelFile(
  file: File,
  districtName: string,
  uploadedByDeo: string,
  onProgress?: (pct: number) => void,
): Promise<StagedRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]!];
  if (!ws) throw new Error('Excel file has no sheets');

  const raw = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
  const results: StagedRow[] = [];

  for (let i = 0; i < raw.length; i++) {
    if (onProgress && i % 100 === 0) onProgress(Math.round((i / raw.length) * 100));

    const r = raw[i]!;
    const row: Partial<StagedRow> = {
      districtName,
      uploadedByDeo,
      status: 'pending',
      hasCl5cc: false,
      adjacentThanasRaw: null,
      latitudeDms: null,
      longitudeDms: null,
      latitudeDecimal: null,
      longitudeDecimal: null,
      licenseFeeLf: 0,
      basicLicenseFeeBlf: 0,
      mgrAmount: 0,
      compositeLfFl: 0,
      compositeLfBeer: 0,
      compositeMgrFl: 0,
      compositeMgrBeer: 0,
      mgqQuantity: 0,
      considerationFee: 0,
      specialBeerLf: 0,
      specialBeerMgr: 0,
      totalRevenue: 0,
    };

    for (const [colName, fieldName] of Object.entries(COL_MAP)) {
      const val = r[colName];
      if (val == null) continue;

      if (fieldName === 'hasCl5cc') {
        (row as Record<string, unknown>)[fieldName] = Boolean(val) && val !== 'false' && val !== '0';
      } else if (NUM_FIELDS.has(fieldName)) {
        (row as Record<string, unknown>)[fieldName] = Number(val) || 0;
      } else {
        (row as Record<string, unknown>)[fieldName] = String(val).trim();
      }
    }

    // Coordinate normalization — DMS → DD
    const rawLat = r['latitude_dms'] ?? row.latitudeDecimal;
    const rawLon = r['longitude_dms'] ?? row.longitudeDecimal;
    const coords = normalizeCoordinates(rawLat as string | number, rawLon as string | number);
    if (coords) {
      row.latitudeDecimal = coords.latitudeDecimal;
      row.longitudeDecimal = coords.longitudeDecimal;
      if (coords.warning) row.coordinateWarning = coords.warning;
    }

    // Revenue computation
    row.totalRevenue = computeRevenue(row as Parameters<typeof computeRevenue>[0]);

    results.push(row as StagedRow);
  }

  onProgress?.(100);
  return results;
}

/** Generates the district Excel template as a Blob for download (requires SheetJS on CDN). */
export function generateTemplate(districtName: string, units: string[]): Blob {
  const header = [
    'circle_sector_name', 'thana_name', 'adjacent_thanas_raw',
    'shop_id', 'shop_name', 'shop_type', 'has_cl5cc',
    'latitude_dms', 'longitude_dms',
    'license_fee_lf', 'premises_consideration_fee', 'basic_license_fee_blf',
    'mgr_amount', 'composite_lf_fl', 'composite_lf_beer',
    'composite_mgr_fl', 'composite_mgr_beer', 'mgq_quantity',
    'consideration_fee', 'special_beer_lf', 'special_beer_mgr',
  ];

  // Example row per unit
  const rows = units.map((u) => [u, '', '', '', '', 'MODEL_SHOP', '0', '', '', ...Array(12).fill('0')]);

  const ws = XLSX.utils.sheet_to_json([['District', districtName], ['', ''], header, ...rows], { skipHeader: true });
  void ws;

  // Build workbook manually
  const aoa = [['District', districtName], ['', ''], header, ...rows];
  const sheet: Record<string, unknown> = {};
  aoa.forEach((row, ri) =>
    (row as unknown[]).forEach((cell, ci) => {
      const addr = `${String.fromCharCode(65 + ci)}${ri + 1}`;
      sheet[addr] = { v: cell };
    })
  );
  sheet['!ref'] = `A1:${String.fromCharCode(65 + header.length - 1)}${aoa.length}`;

  const wb = { SheetNames: ['Template'], Sheets: { Template: sheet } };
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

declare const XLSX: typeof import('./excel.js') extends never ? never : {
  write: (wb: unknown, opts: unknown) => ArrayBuffer;
  utils: { sheet_to_json: (data: unknown, opts?: unknown) => unknown[] };
  read: (data: ArrayBuffer, opts: { type: string }) => { SheetNames: string[]; Sheets: Record<string, unknown> };
};
