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

// Backend enum values (CLAUDE.md "Shop Type Enum" — exact strings, never change these).
// The sheet never shows these raw underscored constants to the DEO; the dropdown shows
// SHOP_TYPE_LABELS instead, and parseExcelFile maps the friendly label back to the enum.
const SHOP_TYPE_LABELS: Record<string, string> = {
  MODEL_SHOP: 'Model Shop',
  COMPOSITE_SHOP: 'Composite Shop (FL + Beer)',
  PRV: 'PRV (Premium Retail Vend)',
  BHANG_SHOP: 'Bhang Shop',
  COUNTRY_LIQUOR: 'Country Liquor',
};
const SHOP_TYPE_OPTIONS = Object.values(SHOP_TYPE_LABELS);
const SHOP_TYPE_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(SHOP_TYPE_LABELS).map(([enumKey, label]) => [label.toLowerCase(), enumKey]),
);
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
    // Explicit lock — must be set on the cell itself, after any column-level unlock, or
    // ExcelJS's Column._applyStyle overwrites it (see buildShopDataSheet's column-protection
    // ordering note). A no-op on sheets that never call ws.protect().
    cell.protection = { locked: true };
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

/** Reads a worksheet's data rows keyed by a fixed column-position order, ignoring header cell text. */
function rowsFromSheetByPosition(ws: ExcelJSNamespace.Worksheet, headerRow: number, order: string[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const values = ws.getRow(r).values as unknown[];
    if (!values || values.every((v) => v == null || v === '')) continue;

    const obj: Record<string, unknown> = {};
    for (let c = 0; c < order.length; c++) obj[order[c]!] = values[c + 1];
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

  // Our generated template has a merged title ("District: ...") on row 1 and the
  // (bilingual, human-friendly) header row on row 2; a plain file with no title row
  // has headers directly on row 1. Detected by title text, not header text, because
  // the header row no longer contains the technical column keys — see TEMPLATE_HEADERS.
  const cellA1 = String(ws.getCell(1, 1).value ?? '');
  const headerRow = cellA1.includes('District:') ? 2 : 1;
  // Parsed by column position, not header text — the visible header is a friendly
  // bilingual label, so field identity comes from TEMPLATE_HEADERS' fixed column order.
  const raw = rowsFromSheetByPosition(ws, headerRow, TEMPLATE_HEADERS);

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
      } else if (fieldName === 'shopType') {
        const trimmed = String(val).trim();
        (row as Record<string, unknown>)[fieldName] = SHOP_TYPE_REVERSE[trimmed.toLowerCase()] ?? trimmed;
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

// Internal technical keys — fixed column order, used for parsing (by position, see
// rowsFromSheetByPosition) and for looking up validation rules. Never shown to the user;
// FRIENDLY_LABELS is what actually appears in the header row.
const TEMPLATE_HEADERS = [
  'circle_sector_name', 'thana_name', 'adjacent_thanas_raw',
  'shop_id', 'shop_name', 'shop_type', 'has_cl5cc',
  'latitude', 'longitude',
  'license_fee_lf', 'basic_license_fee_blf',
  'mgr_amount', 'composite_lf_fl', 'composite_lf_beer',
  'composite_mgr_fl', 'composite_mgr_beer', 'mgq_quantity',
  'consideration_fee', 'special_beer_lf', 'special_beer_mgr',
];

// Bilingual, human-readable header shown in the sheet — "\n" renders as a line break in
// Excel (wrapText is on). English on line 1, Hindi on line 2.
const FRIENDLY_LABELS: Record<string, string> = {
  circle_sector_name: 'Circle / Sector Name\nसर्कल/सेक्टर का नाम',
  thana_name: 'Thana Name\nथाना नाम',
  adjacent_thanas_raw: 'Adjacent Thanas — e.g. Kotwali, Hazratganj\nसंलग्न थाने — उदा. कोतवाली, हज़रतगंज',
  shop_id: 'Shop ID\nदुकान आईडी',
  shop_name: 'Shop Name\nदुकान का नाम',
  shop_type: 'Shop Type\nदुकान का प्रकार',
  has_cl5cc: 'Has CL5CC?\nCL5CC है?',
  latitude: 'Latitude\nअक्षांश',
  longitude: 'Longitude\nदेशांतर',
  license_fee_lf: 'License Fee (LF) ₹\nलाइसेंस शुल्क (LF) ₹',
  basic_license_fee_blf: 'Basic License Fee (BLF) ₹\nमूल लाइसेंस शुल्क (BLF) ₹',
  mgr_amount: 'Min. Guaranteed Revenue (MGR) ₹\nन्यूनतम गारंटीड राजस्व (MGR) ₹',
  composite_lf_fl: 'Composite LF – Foreign Liquor ₹\nकम्पोजिट LF – विदेशी शराब ₹',
  composite_lf_beer: 'Composite LF – Beer ₹\nकम्पोजिट LF – बियर ₹',
  composite_mgr_fl: 'Composite MGR – Foreign Liquor ₹\nकम्पोजिट MGR – विदेशी शराब ₹',
  composite_mgr_beer: 'Composite MGR – Beer ₹\nकम्पोजिट MGR – बियर ₹',
  mgq_quantity: 'MGQ Quantity (units)\nMGQ मात्रा (यूनिट में)',
  consideration_fee: 'Consideration Fee ₹\nप्रतिफल शुल्क ₹',
  special_beer_lf: 'Special Beer LF ₹ (CL5CC)\nविशेष बियर LF ₹ (CL5CC)',
  special_beer_mgr: 'Special Beer MGR ₹ (CL5CC)\nविशेष बियर MGR ₹ (CL5CC)',
};

// Which shop types a financial column applies to. Enforced live via a per-cell custom
// data-validation formula (see FIELD_GATES loop in buildShopDataSheet) so a DEO literally
// cannot type a value into a field that doesn't apply to the row's chosen shop_type —
// matches the revenue formulas in CLAUDE.md ("Revenue Formulas" section) exactly.
const FIELD_GATES: { key: string; allowedTypes: string[]; requireCl5cc?: boolean }[] = [
  { key: 'license_fee_lf', allowedTypes: ['MODEL_SHOP', 'PRV', 'BHANG_SHOP'] },
  { key: 'basic_license_fee_blf', allowedTypes: ['COUNTRY_LIQUOR'] },
  { key: 'mgr_amount', allowedTypes: ['MODEL_SHOP', 'PRV'] },
  { key: 'composite_lf_fl', allowedTypes: ['COMPOSITE_SHOP'] },
  { key: 'composite_lf_beer', allowedTypes: ['COMPOSITE_SHOP'] },
  { key: 'composite_mgr_fl', allowedTypes: ['COMPOSITE_SHOP'] },
  { key: 'composite_mgr_beer', allowedTypes: ['COMPOSITE_SHOP'] },
  { key: 'mgq_quantity', allowedTypes: ['BHANG_SHOP'] },
  { key: 'consideration_fee', allowedTypes: ['COUNTRY_LIQUOR'] },
  { key: 'special_beer_lf', allowedTypes: ['COUNTRY_LIQUOR'], requireCl5cc: true },
  { key: 'special_beer_mgr', allowedTypes: ['COUNTRY_LIQUOR'], requireCl5cc: true },
];

const COLUMN_GUIDE: unknown[][] = [
  ['Field / फ़ील्ड', 'Description / विवरण', 'Required For / किसके लिए आवश्यक', 'Notes / नोट्स'],
  [FRIENDLY_LABELS.circle_sector_name, 'Circle or sector name — must exactly match a pre-registered unit.\nसर्कल या सेक्टर का नाम — पहले से रजिस्टर्ड unit से बिल्कुल मेल खाना चाहिए।', 'All shop types / सभी प्रकार', 'Pre-registered in the portal before template download.\nटेम्पलेट डाउनलोड करने से पहले पोर्टल में रजिस्टर होता है।'],
  [FRIENDLY_LABELS.thana_name, 'Enter the Thana name.\nथाना नाम दर्ज करें।', 'All shop types / सभी प्रकार', 'English only. Free text — no master list enforced in Phase 1.\nकेवल अंग्रेज़ी में। स्वतंत्र टेक्स्ट है।'],
  [FRIENDLY_LABELS.adjacent_thanas_raw, 'Names of Thanas adjacent to this Thana, comma-separated. Example: Kotwali, Hazratganj\nइस थाने से सटे (adjacent) थानों के नाम, अल्पविराम (,) से अलग करके। उदाहरण: Kotwali, Hazratganj', 'Optional / वैकल्पिक', 'Only list Thanas within this district. On the Verify page, a name is highlighted red if it doesn\'t (yet) appear as a Thana elsewhere in this district\'s own uploaded data — usually a typo. This does not block submission and is not checked against any district master list.\nकेवल इसी जिले के थाने लिखें। Verify पेज पर, अगर कोई नाम अभी तक इस जिले के अपने अपलोड किए गए डेटा में कहीं और Thana के रूप में मौजूद नहीं है, तो उसे लाल रंग में हाइलाइट किया जाता है — आमतौर पर यह टाइपो होता है। इससे सबमिशन नहीं रुकता और यह किसी जिला मास्टर लिस्ट से नहीं जांचा जाता।'],
  [FRIENDLY_LABELS.shop_id, 'Department-assigned license/registration ID.\nविभाग द्वारा दिया गया लाइसेंस/पंजीकरण आईडी।', 'All shop types / सभी प्रकार', 'Alphanumeric. Must be unique within the district.\nअक्षर व अंक। जिले में अद्वितीय होना चाहिए।'],
  [FRIENDLY_LABELS.shop_name, 'Official name of the retail vend.\nदुकान का आधिकारिक नाम।', 'All shop types / सभी प्रकार', 'English only.\nकेवल अंग्रेज़ी में।'],
  [FRIENDLY_LABELS.shop_type, 'Shop classification — choose from the dropdown.\nदुकान का वर्गीकरण — dropdown से चुनें।', 'All shop types / सभी प्रकार', 'MODEL_SHOP | COMPOSITE_SHOP | PRV | BHANG_SHOP | COUNTRY_LIQUOR'],
  [FRIENDLY_LABELS.has_cl5cc, 'true = has CL5CC beer endorsement, false = standard.\ntrue = CL5CC बियर endorsement है, false = सामान्य।', 'COUNTRY_LIQUOR only / केवल COUNTRY_LIQUOR', 'Locked to false for every other Shop Type — cell will reject "true".\nअन्य किसी भी Shop Type के लिए "true" स्वीकार नहीं होगा।'],
  [FRIENDLY_LABELS.latitude, 'Latitude — DMS or Decimal.\nअक्षांश — DMS या Decimal में।', 'Optional / वैकल्पिक', 'e.g. 26°50\'48.12"N or 26.8467'],
  [FRIENDLY_LABELS.longitude, 'Longitude — DMS or Decimal.\nदेशांतर — DMS या Decimal में।', 'Optional / वैकल्पिक', 'e.g. 80°56\'46.3"E or 80.9462'],
  [FRIENDLY_LABELS.license_fee_lf, 'Annual license fee (INR, whole rupees).\nवार्षिक लाइसेंस शुल्क (INR, पूर्ण रुपयों में)।', 'MODEL_SHOP, PRV, BHANG_SHOP', 'Locked to 0 for other shop types — cell will reject entry.\nअन्य दुकान प्रकार के लिए यह 0 पर locked है — गलत entry स्वीकार नहीं होगी।'],
  [FRIENDLY_LABELS.basic_license_fee_blf, 'Basic license fee for country liquor (INR).\nदेशी शराब के लिए मूल लाइसेंस शुल्क (INR)।', 'COUNTRY_LIQUOR', 'Locked to 0 for other shop types.\nअन्य दुकान प्रकार के लिए 0 पर locked है।'],
  [FRIENDLY_LABELS.mgr_amount, 'Annual Minimum Guaranteed Revenue (INR).\nवार्षिक न्यूनतम गारंटीड राजस्व (INR)।', 'MODEL_SHOP, PRV', 'Locked to 0 for other shop types.\nअन्य दुकान प्रकार के लिए 0 पर locked है।'],
  [FRIENDLY_LABELS.composite_lf_fl, 'Annual LF for Foreign Liquor component (INR).\nविदेशी शराब भाग के लिए वार्षिक LF (INR)।', 'COMPOSITE_SHOP only / केवल COMPOSITE_SHOP', 'Locked to 0 for other shop types.\nअन्य दुकान प्रकार के लिए 0 पर locked है।'],
  [FRIENDLY_LABELS.composite_lf_beer, 'Annual LF for Beer component (INR).\nबियर भाग के लिए वार्षिक LF (INR)।', 'COMPOSITE_SHOP only / केवल COMPOSITE_SHOP', 'Locked to 0 for other shop types.\nअन्य दुकान प्रकार के लिए 0 पर locked है।'],
  [FRIENDLY_LABELS.composite_mgr_fl, 'Annual MGR for Foreign Liquor (INR).\nविदेशी शराब के लिए वार्षिक MGR (INR)।', 'COMPOSITE_SHOP only / केवल COMPOSITE_SHOP', 'Locked to 0 for other shop types.\nअन्य दुकान प्रकार के लिए 0 पर locked है।'],
  [FRIENDLY_LABELS.composite_mgr_beer, 'Annual MGR for Beer (INR).\nबियर के लिए वार्षिक MGR (INR)।', 'COMPOSITE_SHOP only / केवल COMPOSITE_SHOP', 'Locked to 0 for other shop types.\nअन्य दुकान प्रकार के लिए 0 पर locked है।'],
  [FRIENDLY_LABELS.mgq_quantity, 'Minimum Guaranteed QUANTITY in units — NOT rupees.\nन्यूनतम गारंटीड मात्रा, यूनिट में — रुपये में नहीं।', 'BHANG_SHOP only / केवल BHANG_SHOP', 'Multiplied by ₹20/unit for revenue. Locked to 0 for other shop types.\nराजस्व हेतु ₹20 प्रति यूनिट से गुणा होता है। अन्य दुकान प्रकार के लिए 0 पर locked है।'],
  [FRIENDLY_LABELS.consideration_fee, 'Consideration fee (INR).\nप्रतिफल शुल्क (INR)।', 'COUNTRY_LIQUOR', 'Locked to 0 for other shop types.\nअन्य दुकान प्रकार के लिए 0 पर locked है।'],
  [FRIENDLY_LABELS.special_beer_lf, 'Special beer license fee (INR).\nविशेष बियर लाइसेंस शुल्क (INR)।', 'COUNTRY_LIQUOR + CL5CC only / केवल CL5CC', 'Locked to 0 unless shop_type is COUNTRY_LIQUOR and has_cl5cc = true.\nतभी भरा जा सकता है जब shop_type COUNTRY_LIQUOR हो और has_cl5cc = true हो।'],
  [FRIENDLY_LABELS.special_beer_mgr, 'Annual beer Minimum Guaranteed Revenue (INR).\nवार्षिक बियर न्यूनतम गारंटीड राजस्व (INR)।', 'COUNTRY_LIQUOR + CL5CC only / केवल CL5CC', 'Locked to 0 unless shop_type is COUNTRY_LIQUOR and has_cl5cc = true.\nतभी भरा जा सकता है जब shop_type COUNTRY_LIQUOR हो और has_cl5cc = true हो।'],
];

// Per-column hover tooltip (Excel cell "note" — small red triangle, shows on mouseover)
// on the Data Entry header row, so a DEO doesn't have to flip to the Instructions sheet
// for a field's rules. Derived from COLUMN_GUIDE (same row order as TEMPLATE_HEADERS) so
// the two never drift apart — English-only, the Instructions sheet already carries Hindi.
const HEADER_HELP: Record<string, string> = Object.fromEntries(
  TEMPLATE_HEADERS.map((h, i) => {
    const [, description, requiredFor, notes] = COLUMN_GUIDE[i + 1] as string[];
    const englishOf = (s: string) => s.split('\n')[0];
    return [h, `${englishOf(description!)}\nRequired for: ${requiredFor}\n${englishOf(notes!)}`];
  }),
);

/** Builds the "Data Entry" sheet: title row (locked), header row (locked, with hover help), blank data rows (unlocked). */
async function buildShopDataSheet(
  wb: ExcelJSNamespace.Workbook,
  name: string,
  titleText: string,
  units: string[],
): Promise<ExcelJSNamespace.Worksheet> {
  const ws = wb.addWorksheet(name);

  // Column widths + unlock-by-default must be set BEFORE any cell in these columns gets a
  // style (title/header below) — ExcelJS's Column.protection setter walks every cell that
  // already exists in the column and overwrites its protection (Column._applyStyle), so
  // setting it after styling the header would silently unlock the header too. Data rows
  // typed in later by the DEO pick up this column default automatically — no explicit
  // per-row loop needed (and none would be affordable at 5,000 rows × 19 columns).
  ws.columns = TEMPLATE_HEADERS.map((h) => ({ width: Math.max(22, (FRIENDLY_LABELS[h]!.split('\n')[0]?.length ?? 16) + 2) }));
  for (let c = 1; c <= TEMPLATE_HEADERS.length; c++) ws.getColumn(c).protection = { locked: false };

  ws.mergeCells(1, 1, 1, TEMPLATE_HEADERS.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = titleText;
  titleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A44' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  titleCell.protection = { locked: true };
  ws.getRow(1).height = 26;

  ws.getRow(2).values = TEMPLATE_HEADERS.map((h) => FRIENDLY_LABELS[h]!) as ExcelJSNamespace.CellValue[];
  styleHeaderRow(ws, 2);
  ws.getRow(2).height = 42; // two-line bilingual header
  TEMPLATE_HEADERS.forEach((h, i) => { ws.getCell(2, i + 1).note = HEADER_HELP[h]!; });

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
  // has_cl5cc only applies to Country Liquor shops (CLAUDE.md "CL5CC Rule") — locked to
  // false/blank for every other shop_type. No dropdown arrow (custom validation can't show
  // one), same tradeoff as the FIELD_GATES loop below; the input message tells the DEO why.
  validations.add(`${colLetter(cl5ccCol)}3:${colLetter(cl5ccCol)}${VALIDATION_ROW_LIMIT}`, {
    type: 'custom', allowBlank: true,
    formulae: [`=OR($${colLetter(cl5ccCol)}3="",$${colLetter(cl5ccCol)}3="false",AND($${colLetter(cl5ccCol)}3="true",$${colLetter(shopTypeCol)}3="${SHOP_TYPE_LABELS.COUNTRY_LIQUOR}"))`],
    showInputMessage: true, promptTitle: 'CL5CC', prompt: 'Type true or false. "true" is only allowed when Shop Type is Country Liquor.',
    showErrorMessage: true, errorStyle: 'error', errorTitle: 'CL5CC not applicable',
    error: `"true" is only allowed when Shop Type = Country Liquor. Use false otherwise.\n"true" केवल तभी जब Shop Type = Country Liquor हो। अन्यथा false रखें।`,
  });
  if (units.length > 0) {
    validations.add(`${colLetter(unitCol)}3:${colLetter(unitCol)}${VALIDATION_ROW_LIMIT}`, {
      type: 'list', allowBlank: true, formulae: [`'Reference Data'!$A$2:$A$${units.length + 1}`],
      showInputMessage: true, promptTitle: 'Circle / Sector', prompt: 'Select a registered unit.',
      showErrorMessage: true, errorStyle: 'error', errorTitle: 'Invalid Unit', error: 'Please select a unit from the dropdown list.',
    });
  }

  // Per-cell gate: a financial field only accepts a value when the row's shop_type (and,
  // for CL5CC fields, has_cl5cc) matches — matches CLAUDE.md's Revenue Formulas table
  // exactly, so a DEO cannot fill e.g. basic_license_fee_blf on a MODEL_SHOP row.
  const shopTypeLetter = colLetter(shopTypeCol);
  const cl5ccLetter = colLetter(cl5ccCol);
  for (const gate of FIELD_GATES) {
    const col = TEMPLATE_HEADERS.indexOf(gate.key) + 1;
    const letter = colLetter(col);
    const allowedLabels = gate.allowedTypes.map((t) => SHOP_TYPE_LABELS[t]!);
    const typesCond = allowedLabels.map((label) => `$${shopTypeLetter}3="${label}"`).join(',');
    const cond = gate.requireCl5cc ? `AND(OR(${typesCond}),$${cl5ccLetter}3="true")` : `OR(${typesCond})`;
    const [enLabel] = FRIENDLY_LABELS[gate.key]!.split('\n');
    validations.add(`${letter}3:${letter}${VALIDATION_ROW_LIMIT}`, {
      type: 'custom', allowBlank: true, formulae: [`=OR($${letter}3="",$${letter}3=0,${cond})`],
      showErrorMessage: true, errorStyle: 'error',
      errorTitle: 'Not applicable for this shop type',
      error: `"${enLabel}" only applies to ${allowedLabels.join('/')}${gate.requireCl5cc ? ' with CL5CC' : ''}. Leave blank or 0 otherwise.\nयह फ़ील्ड केवल ${allowedLabels.join('/')}${gate.requireCl5cc ? ' (CL5CC सहित)' : ''} के लिए है। अन्यथा खाली या 0 छोड़ें।`,
    });
  }

  // No password — a guardrail against accidentally overtyping a header, not a security
  // boundary (same pattern as the Reference Data sheet below). Data cells stay unlocked via
  // the column-level default set above, so typing/sorting/filtering data rows is unaffected.
  await ws.protect('', {
    selectLockedCells: true, selectUnlockedCells: true,
    formatCells: false, formatColumns: false, formatRows: false,
    insertRows: true, insertColumns: false, deleteRows: true, deleteColumns: false,
    sort: true, autoFilter: true,
  });

  return ws;
}

/**
 * Generates the district Excel template as a downloadable Blob.
 * Sheet 1 "Data Entry": bilingual (English/Hindi) column headers only (blank for DEO to fill).
 *   Header row is locked (sheet-protected, no password) so it can't be overtyped by mistake;
 *   every data cell stays unlocked. Each header cell also carries a hover note (Excel cell
 *   comment) with that field's rules, sourced from COLUMN_GUIDE.
 * Sheet 2 "Instructions": bilingual description of every column.
 * Sheet 3 "Reference Data" (hidden): registered circle/sector units, feeds the dropdown on sheet 1.
 *
 * No separate "Demo Data" sheet — DEOs mistook the example rows there for a second copy of
 * the district's own data and got confused about which sheet to actually fill in.
 *
 * Built with ExcelJS (loaded from CDN, global `ExcelJS`) instead of SheetJS's writer —
 * ExcelJS produces spec-compliant OOXML natively (freeze panes, print setup, data
 * validation) so there is no hand-edited worksheet XML that can corrupt the file.
 */
export async function generateTemplate(districtName: string, units: string[]): Promise<Blob> {
  const titleText = `District: ${districtName.toUpperCase()}   |   UP Excise Spatial Revenue Optimizer   |   DEO Data Entry Template`;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'UP Excise Spatial Revenue Optimizer';
  wb.created = new Date();

  await buildShopDataSheet(wb, 'Data Entry', titleText, units);

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

  // Hidden, not deleted — the circle/sector dropdown on Data Entry still
  // references it by name. Hidden because it's pure repetition of data the DEO already
  // knows (their own circle/sector list) and adds no value as a visible tab.
  const wsRef = wb.addWorksheet('Reference Data');
  wsRef.getRow(1).values = ['Registered Units'] as ExcelJSNamespace.CellValue[];
  styleHeaderRow(wsRef, 1);
  for (const u of units) wsRef.addRow([u]);
  wsRef.getColumn(1).width = 30;
  applyPrintSetup(wsRef, 1, 1);
  wsRef.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];
  wsRef.state = 'hidden';
  // Read-only — every cell defaults to locked, so enabling sheet protection (no password;
  // this is a guardrail against accidental edits if unhidden, not a security boundary)
  // blocks typing/inserting/deleting rows here. An edited or reordered reference list
  // would silently break the circle/sector dropdown and, since generateTemplate rebuilds
  // this sheet fresh from `units` on every download, is never a legitimate DEO action.
  await wsRef.protect('', { selectLockedCells: true, selectUnlockedCells: false, insertRows: false, insertColumns: false, deleteRows: false, deleteColumns: false, sort: false, autoFilter: false });

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
