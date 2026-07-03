'use client';

import JSZip from 'jszip';
import { normalizeCoordinates } from './coordinates';
import { computeRevenue } from './revenue';
import type { StagedRow } from './types';

declare global {
  // SheetJS loaded from CDN in root layout.tsx — never bundled.
  const XLSX: {
    read: (data: ArrayBuffer, opts: { type: string }) => { SheetNames: string[]; Sheets: Record<string, unknown> };
    write: (wb: unknown, opts: { type: string; bookType: string }) => ArrayBuffer;
    utils: {
      sheet_to_json: (sheet: unknown, opts?: unknown) => Record<string, unknown>[];
      aoa_to_sheet: (data: unknown[][]) => unknown;
      book_new: () => { SheetNames: string[]; Sheets: Record<string, unknown> };
      book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
    };
  };
}

/** Column name → StagedRow field mapping for the standardized DEO Excel template. */
const COL_MAP: Record<string, keyof StagedRow> = {
  circle_sector_name: 'circleSectorName',
  thana_name: 'thanaName',
  adjacent_thanas_raw: 'adjacentThanasRaw',
  shop_id: 'shopId',
  shop_name: 'shopName',
  shop_type: 'shopType',
  has_cl5cc: 'hasCl5cc',
  latitude: 'latitudeDms',
  longitude: 'longitudeDms',
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

const SHOP_TYPE_OPTIONS = ['MODEL_SHOP', 'COMPOSITE_SHOP', 'PRV', 'BHANG_SHOP', 'COUNTRY_LIQUOR'] as const;
const CL5CC_OPTIONS = ['true', 'false'] as const;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildListValidationXml(range: string, formula: string, promptTitle: string, prompt: string, errorTitle: string, error: string): string {
  return [
    `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorStyle="stop" promptTitle="${escapeXml(promptTitle)}" prompt="${escapeXml(prompt)}" errorTitle="${escapeXml(errorTitle)}" error="${escapeXml(error)}" sqref="${escapeXml(range)}">`,
    `<formula1>${escapeXml(formula)}</formula1>`,
    '</dataValidation>',
  ].join('');
}

async function addTemplateValidations(workbookBytes: ArrayBuffer, units: string[]): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(workbookBytes);
  
  const validationsList = [
    buildListValidationXml('F3:F1048576', `"${SHOP_TYPE_OPTIONS.join(',')}"`, 'Shop type', 'Choose a shop type from the dropdown list.', 'Invalid shop type', `Use one of: ${SHOP_TYPE_OPTIONS.join(', ')}`),
    buildListValidationXml('G3:G1048576', `"${CL5CC_OPTIONS.join(',')}"`, 'CL5CC', 'Choose true if the shop has CL5CC; otherwise choose false.', 'Invalid CL5CC value', 'Use true or false only.'),
  ];

  if (units.length > 0) {
    validationsList.push(
      buildListValidationXml('A3:A1048576', `'Reference Data'!$A$2:$A$${units.length + 1}`, 'Circle / Sector', 'Select a registered unit.', 'Invalid Unit', 'Please select a unit from the dropdown list.')
    );
  }

  const validations = validationsList.join('');

  for (const sheetName of ['sheet1.xml', 'sheet2.xml']) {
    const sheet = zip.file(`xl/worksheets/${sheetName}`);
    if (!sheet) continue;

    const xml = await sheet.async('string');
    // Inject immediately after </sheetData> to preserve valid Excel XML schema order
    const nextXml = xml.replace('</sheetData>', `</sheetData><dataValidations count="${validationsList.length}">${validations}</dataValidations>`);
    zip.file(`xl/worksheets/${sheetName}`, nextXml);
  }

  return await zip.generateAsync({ type: 'arraybuffer' });
}

/**
 * Parses a DEO district Excel file into StagedRows.
 * All heavy work runs in-browser via SheetJS loaded from CDN — zero Worker CPU.
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

  let raw = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
  if (raw.length > 0) {
    const isTitleRowFormat = Object.values(raw[0]!).includes('circle_sector_name');
    if (isTitleRowFormat) {
      raw = XLSX.utils.sheet_to_json(ws, { range: 1 }) as Record<string, unknown>[];
    }
  }

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
    const rawLat = (r['latitude'] as string | undefined) ?? row.latitudeDms;
    const rawLon = (r['longitude'] as string | undefined) ?? row.longitudeDms;
    const coords = normalizeCoordinates(rawLat, rawLon);
    if (coords) {
      row.latitudeDecimal = coords.latitudeDecimal;
      row.longitudeDecimal = coords.longitudeDecimal;
      row.latitudeDms = String(rawLat);
      row.longitudeDms = String(rawLon);
      if (coords.warning) row.coordinateWarning = coords.warning;
    } else {
      // If parsing fails, reset to null
      row.latitudeDecimal = null;
      row.longitudeDecimal = null;
      row.latitudeDms = null;
      row.longitudeDms = null;
    }

    row.totalRevenue = computeRevenue(row as Parameters<typeof computeRevenue>[0]);
    results.push(row as StagedRow);
  }

  onProgress?.(100);
  return results;
}

const TEMPLATE_HEADERS = [
  'circle_sector_name', 'thana_name', 'adjacent_thanas_raw',
  'shop_id', 'shop_name', 'shop_type', 'has_cl5cc',
  'latitude', 'longitude',
  'license_fee_lf', 'basic_license_fee_blf',
  'mgr_amount', 'composite_lf_fl', 'composite_lf_beer',
  'composite_mgr_fl', 'composite_mgr_beer', 'mgq_quantity',
  'consideration_fee', 'special_beer_lf', 'special_beer_mgr',
];

const COLUMN_GUIDE: unknown[][] = [
  ['Column', 'Description', 'Required For', 'Notes'],
  ['circle_sector_name', 'Circle or sector name — must exactly match a pre-registered unit', 'All shop types', 'Pre-registered in the portal before template download'],
  ['thana_name', 'Thana name (Excise-authoritative, not police)', 'All shop types', 'English only. Free text — no master list enforced in Phase 1'],
  ['adjacent_thanas_raw', 'Comma-separated names of bordering Thanas in the same district', 'Optional', 'Cross-district Thanas are automatically rejected by the portal'],
  ['shop_id', 'Department-assigned license/registration ID', 'All shop types', 'Alphanumeric. Must be unique within the district'],
  ['shop_name', 'Official name of the retail vend', 'All shop types', 'English only'],
  ['shop_type', 'Shop classification', 'All shop types', 'Dropdown list: MODEL_SHOP | COMPOSITE_SHOP | PRV | BHANG_SHOP | COUNTRY_LIQUOR'],
  ['has_cl5cc', 'true = has CL5CC beer endorsement, false = standard', 'COUNTRY_LIQUOR only', 'Dropdown list: true | false. Any other shop_type must use false'],
  ['latitude', 'Latitude (DMS or Decimal)', 'Optional', 'e.g. 26°50\'48.12"N or 26.8467'],
  ['longitude', 'Longitude (DMS or Decimal)', 'Optional', 'e.g. 80°56\'46.3"E or 80.9462'],
  ['license_fee_lf', 'Annual license fee (INR, whole rupees)', 'MODEL_SHOP, PRV, BHANG_SHOP', 'COMPOSITE_SHOP: leave 0 — computed from composite_lf_fl + composite_lf_beer'],
  ['basic_license_fee_blf', 'Basic license fee for country liquor (INR)', 'COUNTRY_LIQUOR', ''],
  ['mgr_amount', 'Annual Minimum Guaranteed Revenue (INR)', 'MODEL_SHOP, PRV', 'COMPOSITE_SHOP: leave 0 — computed from composite_mgr_fl + composite_mgr_beer'],
  ['composite_lf_fl', 'Annual LF for Foreign Liquor component (INR)', 'COMPOSITE_SHOP only', ''],
  ['composite_lf_beer', 'Annual LF for Beer component (INR)', 'COMPOSITE_SHOP only', ''],
  ['composite_mgr_fl', 'Annual MGR for Foreign Liquor (INR)', 'COMPOSITE_SHOP only', ''],
  ['composite_mgr_beer', 'Annual MGR for Beer (INR)', 'COMPOSITE_SHOP only', ''],
  ['mgq_quantity', 'Minimum Guaranteed QUANTITY in units — NOT rupees', 'BHANG_SHOP only', 'Multiplied by ₹20/unit for revenue. Enter unit count, not a rupee figure'],
  ['consideration_fee', 'Consideration fee (INR)', 'COUNTRY_LIQUOR', ''],
  ['special_beer_lf', 'Special beer license fee (INR)', 'COUNTRY_LIQUOR + CL5CC only', 'Leave 0 if has_cl5cc = 0'],
  ['special_beer_mgr', 'Annual beer Minimum Guaranteed Revenue (INR)', 'COUNTRY_LIQUOR + CL5CC only', 'Leave 0 if has_cl5cc = 0'],
];

/**
 * Generates the district Excel template as a downloadable Blob.
 * Sheet 1 "Data Entry": column headers only (blank for DEO to fill).
 * Sheet 2 "Demo Data": column headers + one example row per shop type.
 * Sheet 3 "Instructions": description of every column.
 */
export async function generateTemplate(districtName: string, units: string[]): Promise<Blob> {
  const exUnit = units[0] ?? 'Circle 1';
  const exThana = 'Kotwali';

  const examples: unknown[][] = [
    [exUnit, exThana, '', 'SHOP001', 'Example Model Liquor Store', 'MODEL_SHOP', 'false', '', '', 100000, 0, 200000, 0, 0, 0, 0, 0, 0, 0, 0],
    [exUnit, exThana, '', 'SHOP002', 'Example Composite Wine Shop', 'COMPOSITE_SHOP', 'false', '', '', 0, 0, 0, 50000, 50000, 100000, 100000, 0, 0, 0, 0],
    [exUnit, exThana, '', 'SHOP003', 'Example Premium Retail Vend', 'PRV', 'false', '', '', 80000, 0, 150000, 0, 0, 0, 0, 0, 0, 0, 0],
    [exUnit, exThana, '', 'SHOP004', 'Example Bhang Shop', 'BHANG_SHOP', 'false', '', '', 20000, 0, 0, 0, 0, 0, 0, 500, 0, 0, 0],
    [exUnit, exThana, '', 'SHOP005', 'Example Country Liquor Shop', 'COUNTRY_LIQUOR', 'false', '', '', 0, 75000, 0, 0, 0, 0, 0, 0, 60000, 0, 0],
    [exUnit, exThana, '', 'SHOP006', 'Example CL5CC Beer Endorsed Shop', 'COUNTRY_LIQUOR', 'true', '', '', 0, 75000, 0, 0, 0, 0, 0, 0, 60000, 25000, 50000],
  ];

  const titleRow = [`District: ${districtName.toUpperCase()}   |   UP Excise Spatial Revenue Optimizer   |   DEO Data Entry Template`];

  const wsDataEntry = XLSX.utils.aoa_to_sheet([titleRow, TEMPLATE_HEADERS]);
  wsDataEntry['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: TEMPLATE_HEADERS.length - 1 } }];
  wsDataEntry['!views'] = [{ state: 'frozen', ySplit: 2 }];

  const wsDemo = XLSX.utils.aoa_to_sheet([titleRow, TEMPLATE_HEADERS, ...examples]);
  wsDemo['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: TEMPLATE_HEADERS.length - 1 } }];
  wsDemo['!views'] = [{ state: 'frozen', ySplit: 2 }];

  const wsGuide = XLSX.utils.aoa_to_sheet(COLUMN_GUIDE);
  const wsRef = XLSX.utils.aoa_to_sheet([['Registered Units'], ...units.map(u => [u])]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsDataEntry, 'Data Entry');
  XLSX.utils.book_append_sheet(wb, wsDemo, 'Demo Data');
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Instructions');
  XLSX.utils.book_append_sheet(wb, wsRef, 'Reference Data');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const workbookBytes = await addTemplateValidations(out as ArrayBuffer, units);
  return new Blob([workbookBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

interface ProvisionTemplateRow {
  districtName: string; division?: string | null;
  deoName?: string | null; deoEmail?: string | null; deoId?: string | null;
  expectedVendCount?: number | null;
}

/**
 * Generates the DEO provision Excel template for admin bulk-provision upload.
 * Sheet 1 "DEO List": District Name + Division pre-filled from the District Master
 * table (single source of truth — see /admin/provision) so the admin only has to
 * fill in the DEO columns. Pass an empty array for a fully blank template.
 * Sheet 2 "Column Guide": description of every column.
 */
export async function generateProvisionTemplate(rows: ProvisionTemplateRow[] = []): Promise<Blob> {
  const headers = ['District Name', 'Division', 'DEO Name', 'DEO Email', 'DEO Identifier', 'Expected Vend Count'];
  const body = rows.map((r) => [
    r.districtName, r.division ?? '', r.deoName ?? '', r.deoEmail ?? '', r.deoId ?? '', r.expectedVendCount ?? '',
  ]);

  const guide: unknown[][] = [
    ['Column', 'Description', 'Notes'],
    ['District Name', 'Canonical district name — must be unique and consistent with the portal', 'Used as primary key. 75 rows total for UP.'],
    ['Division', 'Administrative division (18 divisions in UP)', 'Bare division name, e.g. "Lucknow" — no "Division" suffix. Must match districts.division exactly for grouping to work.'],
    ['DEO Name', 'Full name of the District Excise Officer', 'For display in the admin portal only'],
    ['DEO Email', 'Department-issued email address for this DEO', 'Used to create the portal login account (magic-link auth). Must be unique across all 75 rows.'],
    ['DEO Identifier', 'Department-assigned alphanumeric ID for this DEO', 'Stored on every shop record as uploaded_by_deo. Must be unique.'],
    ['Expected Vend Count', 'Approximate number of retail vends in the district', 'Used for "X of Y uploaded" progress display in the portal'],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DEO List');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(guide), 'Column Guide');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([out as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
