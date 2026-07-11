'use client';

import { normalizeCoordinates } from './coordinates';
import { computeRevenue } from './revenue';
import type { StagedRow } from './types';
import type ExcelJSNamespace from 'exceljs';

declare global {
  // ExcelJS loaded from CDN in root layout.tsx — never bundled. The single spreadsheet
  // library for this app: reading uploaded files, generating downloadable templates,
  // and exporting data all go through it, so every workbook gets the same freeze panes /
  // print setup / data validation support with no second library and no hand-edited XML.
  const ExcelJS: typeof ExcelJSNamespace;
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

// Data validation dropdowns are applied to a large-but-finite row range rather than
// the full 1,048,576-row sheet — 5,000 rows comfortably covers any single district
// while keeping the sqref range readable.
const VALIDATION_ROW_LIMIT = 5000;

/** Landscape, fit-to-width, header row repeated on every printed page — applied to every generated sheet. */
function applyPrintSetup(ws: ExcelJSNamespace.Worksheet, headerRow: number, colCount: number) {
  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };
  ws.headerFooter = { differentFirst: false };
  ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
  ws.views = [{ state: 'frozen', ySplit: headerRow, xSplit: 0 }];
  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: colCount } };
}

// exceljs's shipped type defs omit `Worksheet.dataValidations`, though it exists at runtime.
interface ValidatableWorksheet extends ExcelJSNamespace.Worksheet {
  dataValidations: { add: (address: string, rule: Partial<ExcelJSNamespace.DataValidation>) => void };
}

function styleHeaderRow(ws: ExcelJSNamespace.Worksheet, rowNum: number) {
  const row = ws.getRow(rowNum);
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin' } };
  });
  row.height = 28;
}

/** Reads a worksheet's data rows into plain objects keyed by the given header row's cell text. */
function rowsFromSheet(ws: ExcelJSNamespace.Worksheet, headerRow: number): Record<string, unknown>[] {
  const headerValues = ws.getRow(headerRow).values as unknown[];
  const headers = headerValues.map((v) => (v == null ? '' : String(v).trim()));

  const rows: Record<string, unknown>[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const values = ws.getRow(r).values as unknown[];
    if (!values || values.every((v) => v == null || v === '')) continue;

    const obj: Record<string, unknown> = {};
    for (let c = 1; c < values.length; c++) {
      const header = headers[c];
      if (!header) continue;
      obj[header] = values[c];
    }
    rows.push(obj);
  }
  return rows;
}

/**
 * Reads the first sheet of an uploaded workbook into plain row objects keyed by the
 * header row's cell text. `headerRow` defaults to 1 (no title row above the headers).
 */
export async function readWorkbookRows(file: File, headerRow = 1): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Excel file has no sheets');
  return rowsFromSheet(ws, headerRow);
}

/**
 * Parses a DEO district Excel file into StagedRows.
 * All heavy work runs in-browser via ExcelJS loaded from CDN — zero Worker CPU.
 */
export async function parseExcelFile(
  file: File,
  districtName: string,
  uploadedByDeo: string,
  onProgress?: (pct: number) => void,
): Promise<StagedRow[]> {
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Excel file has no sheets');

  // Our generated template has a merged title on row 1 and real headers on row 2;
  // a plain file (no title row) has headers directly on row 1.
  const row1 = (ws.getRow(1).values as unknown[]).map((v) => (v == null ? '' : String(v).trim()));
  const headerRow = row1.includes('circle_sector_name') ? 1 : 2;
  const raw = rowsFromSheet(ws, headerRow);

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

/** Builds the "Data Entry" or "Demo Data" sheet: title row, header row, optional example rows. */
function buildShopDataSheet(
  wb: ExcelJSNamespace.Workbook,
  name: string,
  titleText: string,
  exampleRows: unknown[][],
  units: string[],
) {
  const ws = wb.addWorksheet(name);

  ws.mergeCells(1, 1, 1, TEMPLATE_HEADERS.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = titleText;
  titleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A44' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 26;

  ws.getRow(2).values = TEMPLATE_HEADERS as ExcelJSNamespace.CellValue[];
  styleHeaderRow(ws, 2);

  for (const ex of exampleRows) ws.addRow(ex);

  ws.columns = TEMPLATE_HEADERS.map((h) => ({ width: Math.max(16, h.length + 4) }));
  for (let r = 3; r <= ws.rowCount; r++) {
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      cell.alignment = { wrapText: true, vertical: 'top' };
    });
  }

  applyPrintSetup(ws, 2, TEMPLATE_HEADERS.length);
  ws.pageSetup.printTitlesRow = '1:2';
  ws.views = [{ state: 'frozen', ySplit: 2, xSplit: 0 }];

  const shopTypeCol = TEMPLATE_HEADERS.indexOf('shop_type') + 1;
  const cl5ccCol = TEMPLATE_HEADERS.indexOf('has_cl5cc') + 1;
  const unitCol = TEMPLATE_HEADERS.indexOf('circle_sector_name') + 1;
  const colLetter = (n: number) => ws.getColumn(n).letter;
  const validations = (ws as ValidatableWorksheet).dataValidations;

  validations.add(`${colLetter(shopTypeCol)}3:${colLetter(shopTypeCol)}${VALIDATION_ROW_LIMIT}`, {
    type: 'list', allowBlank: true, formulae: [`"${SHOP_TYPE_OPTIONS.join(',')}"`],
    showInputMessage: true, promptTitle: 'Shop type', prompt: 'Choose a shop type from the dropdown list.',
    showErrorMessage: true, errorStyle: 'error', errorTitle: 'Invalid shop type', error: `Use one of: ${SHOP_TYPE_OPTIONS.join(', ')}`,
  });
  validations.add(`${colLetter(cl5ccCol)}3:${colLetter(cl5ccCol)}${VALIDATION_ROW_LIMIT}`, {
    type: 'list', allowBlank: true, formulae: [`"${CL5CC_OPTIONS.join(',')}"`],
    showInputMessage: true, promptTitle: 'CL5CC', prompt: 'Choose true if the shop has CL5CC; otherwise choose false.',
    showErrorMessage: true, errorStyle: 'error', errorTitle: 'Invalid CL5CC value', error: 'Use true or false only.',
  });
  if (units.length > 0) {
    validations.add(`${colLetter(unitCol)}3:${colLetter(unitCol)}${VALIDATION_ROW_LIMIT}`, {
      type: 'list', allowBlank: true, formulae: [`'Reference Data'!$A$2:$A$${units.length + 1}`],
      showInputMessage: true, promptTitle: 'Circle / Sector', prompt: 'Select a registered unit.',
      showErrorMessage: true, errorStyle: 'error', errorTitle: 'Invalid Unit', error: 'Please select a unit from the dropdown list.',
    });
  }

  return ws;
}

/**
 * Generates the district Excel template as a downloadable Blob.
 * Sheet 1 "Data Entry": column headers only (blank for DEO to fill).
 * Sheet 2 "Demo Data": column headers + one example row per shop type.
 * Sheet 3 "Instructions": description of every column.
 * Sheet 4 "Reference Data": registered circle/sector units, feeds the dropdown on sheets 1-2.
 *
 * Built with ExcelJS (loaded from CDN, global `ExcelJS`) instead of SheetJS's writer —
 * ExcelJS produces spec-compliant OOXML natively (freeze panes, print setup, data
 * validation) so there is no hand-edited worksheet XML that can corrupt the file.
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

  const titleText = `District: ${districtName.toUpperCase()}   |   UP Excise Spatial Revenue Optimizer   |   DEO Data Entry Template`;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'UP Excise Spatial Revenue Optimizer';
  wb.created = new Date();

  buildShopDataSheet(wb, 'Data Entry', titleText, [], units);
  buildShopDataSheet(wb, 'Demo Data', titleText, examples, units);

  const wsGuide = wb.addWorksheet('Instructions');
  wsGuide.getRow(1).values = COLUMN_GUIDE[0] as ExcelJSNamespace.CellValue[];
  styleHeaderRow(wsGuide, 1);
  for (const row of COLUMN_GUIDE.slice(1)) wsGuide.addRow(row);
  wsGuide.columns = [{ width: 24 }, { width: 55 }, { width: 26 }, { width: 45 }];
  for (let r = 2; r <= wsGuide.rowCount; r++) {
    wsGuide.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      cell.alignment = { wrapText: true, vertical: 'top' };
    });
  }
  applyPrintSetup(wsGuide, 1, (COLUMN_GUIDE[0] as unknown[]).length);
  wsGuide.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

  const wsRef = wb.addWorksheet('Reference Data');
  wsRef.getRow(1).values = ['Registered Units'] as ExcelJSNamespace.CellValue[];
  styleHeaderRow(wsRef, 1);
  for (const u of units) wsRef.addRow([u]);
  wsRef.getColumn(1).width = 30;
  applyPrintSetup(wsRef, 1, 1);
  wsRef.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
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

  const wb = new ExcelJS.Workbook();
  wb.creator = 'UP Excise Spatial Revenue Optimizer';
  wb.created = new Date();

  const wsList = wb.addWorksheet('DEO List');
  wsList.getRow(1).values = headers as ExcelJSNamespace.CellValue[];
  styleHeaderRow(wsList, 1);
  for (const row of body) wsList.addRow(row);
  wsList.columns = [{ width: 26 }, { width: 18 }, { width: 24 }, { width: 30 }, { width: 20 }, { width: 20 }];
  for (let r = 2; r <= wsList.rowCount; r++) {
    wsList.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      cell.alignment = { wrapText: true, vertical: 'top' };
    });
  }
  applyPrintSetup(wsList, 1, headers.length);
  wsList.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

  const wsGuide = wb.addWorksheet('Column Guide');
  wsGuide.getRow(1).values = guide[0] as ExcelJSNamespace.CellValue[];
  styleHeaderRow(wsGuide, 1);
  for (const row of guide.slice(1)) wsGuide.addRow(row);
  wsGuide.columns = [{ width: 24 }, { width: 55 }, { width: 45 }];
  for (let r = 2; r <= wsGuide.rowCount; r++) {
    wsGuide.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      cell.alignment = { wrapText: true, vertical: 'top' };
    });
  }
  applyPrintSetup(wsGuide, 1, (guide[0] as unknown[]).length);
  wsGuide.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Builds and downloads an .xlsx from a flat array of row objects (headers = keys of
 * the first row) — the shared path for every admin data export. Same landscape/fit-to-
 * width print setup, repeated header row, wrapped cells, and frozen header as the
 * generated templates above, so every workbook in the app looks and prints the same way.
 */
export async function exportRowsToXlsx(
  rows: Record<string, unknown>[],
  opts: { sheetName: string; filename: string; freezeFirstColumn?: boolean },
): Promise<void> {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]!);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'UP Excise Spatial Revenue Optimizer';
  wb.created = new Date();

  const ws = wb.addWorksheet(opts.sheetName.slice(0, 31));
  ws.getRow(1).values = headers as ExcelJSNamespace.CellValue[];
  styleHeaderRow(ws, 1);
  for (const r of rows) ws.addRow(headers.map((h) => r[h] as ExcelJSNamespace.CellValue));
  ws.columns = headers.map((h) => ({ width: Math.max(14, h.length + 4) }));
  for (let r = 2; r <= ws.rowCount; r++) {
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      cell.alignment = { wrapText: true, vertical: 'top' };
    });
  }

  applyPrintSetup(ws, 1, headers.length);
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: opts.freezeFirstColumn ? 1 : 0 }];

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = opts.filename;
  a.click();
  URL.revokeObjectURL(url);
}
