'use client';

import { normalizeCoordinates } from './coordinates';
import { computeRevenue } from './revenue';
import { validateRow } from './validate';
import type { StagedRow } from './types';
import type ExcelJSNamespace from 'exceljs';
import { SHOP_TYPES, SHOP_TYPE_LABELS } from '@excise/schema';
import { STATUS_LABEL } from './status';

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

// A cell a DEO fills via the has_cl5cc TRUE/FALSE dropdown doesn't always come back from
// ExcelJS as a plain boolean — Excel/LibreOffice actually save a typed/selected TRUE or
// FALSE literal as a formula cell (`TRUE()` / `FALSE()`), which ExcelJS returns as
// `{ formula, result }` (and `result` can be entirely absent for FALSE). The previous
// `Boolean(val) && val !== 'false' && val !== '0'` check treated that object as truthy no
// matter its actual value, so every real-world CL5CC selection silently became `true`.
// Confirmed by round-tripping a generated template through LibreOffice and reading it back.
function parseBool(val: unknown): boolean {
  if (val == null) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'object') {
    const obj = val as { formula?: string; result?: unknown };
    if (typeof obj.result === 'boolean') return obj.result;
    if (typeof obj.formula === 'string') return /^\s*TRUE\s*\(\s*\)\s*$/i.test(obj.formula);
    return false;
  }
  const s = String(val).trim().toLowerCase();
  return s === 'true' || s === '1';
}

const NUM_FIELDS = new Set<keyof StagedRow>([
  'licenseFeeLf', 'basicLicenseFeeBlf', 'mgrAmount',
  'compositeLfFl', 'compositeLfBeer', 'compositeMgrFl', 'compositeMgrBeer',
  'mgqQuantity', 'considerationFee', 'specialBeerLf', 'specialBeerMgr',
  'latitudeDecimal', 'longitudeDecimal',
]);

// Backend enum values (CLAUDE.md "Shop Type Enum" — exact strings, never change these).
// The sheet never shows these raw underscored constants to the DEO; the dropdown shows
// SHOP_TYPE_LABELS instead, and parseExcelFile maps the friendly label back to the enum.
const SHOP_TYPE_OPTIONS = Object.values(SHOP_TYPE_LABELS);
// Reverse mapping is deliberately lenient, not just the exact dropdown string lowercased —
// Excel's list validation never fires on a pasted value (same category as the has_cl5cc/
// circle_sector_name paste issues elsewhere in this file), so a DEO/Inspector pasting a
// shorter or differently-worded shop type (e.g. "Composite Shop" instead of the dropdown's
// full "Composite Shop (FL + Beer)") used to fall through to the raw enum-constant error
// ("Must be one of: MODEL_SHOP, COMPOSITE_SHOP, ...") instead of being recognized. Every
// entry here still resolves to the one canonical enum value validateRow() checks against.
const SHOP_TYPE_REVERSE: Record<string, string> = {
  ...Object.fromEntries(Object.entries(SHOP_TYPE_LABELS).map(([enumKey, label]) => [label.toLowerCase(), enumKey])),
  ...Object.fromEntries(SHOP_TYPES.map((enumKey) => [enumKey.toLowerCase(), enumKey])),
  ...Object.fromEntries(SHOP_TYPES.map((enumKey) => [enumKey.toLowerCase().replace(/_/g, ' '), enumKey])),
  'model shop': 'MODEL_SHOP',
  'composite shop': 'COMPOSITE_SHOP',
  'composite': 'COMPOSITE_SHOP',
  'prv': 'PRV',
  'premium retail vend': 'PRV',
  'bhang shop': 'BHANG_SHOP',
  'bhang': 'BHANG_SHOP',
  'country liquor': 'COUNTRY_LIQUOR',
  'hbr': 'HBR',
};
// Widened-key alias for lookups keyed by a plain `string` (export rows, dynamic Object.entries
// keys) rather than the narrow `ShopType` union — SHOP_TYPE_LABELS itself stays precisely
// typed for call sites that already have a real ShopType value.
const SHOP_TYPE_LABEL_LOOKUP: Record<string, string> = SHOP_TYPE_LABELS;
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
  registeredUnits: string[] = [],
): Promise<StagedRow[]> {
  const registeredUnitSet = new Set(registeredUnits);
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
        (row as Record<string, unknown>)[fieldName] = parseBool(val);
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

    // license_fee_lf / mgr_amount are computed totals for COMPOSITE_SHOP (CLAUDE.md's Revenue
    // Formulas section) — the sub-component fields are the source of truth. The Excel cell
    // itself blocks a DEO from typing a matching value into either column on a composite row
    // (FIELD_GATES excludes COMPOSITE_SHOP from both), so it must be computed here instead of
    // trusting whatever (always-zero) value came out of the cell.
    if (row.shopType === 'COMPOSITE_SHOP') {
      row.licenseFeeLf = (row.compositeLfFl ?? 0) + (row.compositeLfBeer ?? 0);
      row.mgrAmount = (row.compositeMgrFl ?? 0) + (row.compositeMgrBeer ?? 0);
    }

    row.totalRevenue = computeRevenue(row as Parameters<typeof computeRevenue>[0]);

    // Same checks the Worker runs on upload (validateRow mirrors it exactly) — running them
    // here catches paste-bypassed has_cl5cc/shop_type mismatches and other Worker-rejectable
    // rows at parse time, before a chunk POST round-trip, instead of only after a rejection.
    const rowErrors = validateRow(row as Parameters<typeof validateRow>[0]);
    const reasons = rowErrors.map((e) => e.message);

    // circle_sector_name's Excel cell validation is a dropdown (list), which — like
    // has_cl5cc — never fires on a pasted value, only on typed keystrokes. A row whose name
    // doesn't exactly match a registered unit doesn't get rejected here or by the Worker
    // (neither validateRow nor the Worker's per-row insert re-checks this — only the chunk's
    // single declared circleSectorName is checked against the district's registered units),
    // so it silently never matches any tab's `circleSectorName === activeUnit` filter and
    // never gets included in any of submitDistrict()'s per-unit upload groups either — the
    // row just vanishes from view under every circle/sector, which reads to a DEO as "my
    // uploaded data got wiped." Flagging it as an error here (with the exact typed value in
    // the message) surfaces it in the Staged Data table via the Unregistered/Mismatched card
    // in /verify instead of silently discarding it.
    if (registeredUnitSet.size > 0 && row.circleSectorName && !registeredUnitSet.has(row.circleSectorName)) {
      reasons.push(`Circle/sector "${row.circleSectorName}" is not a registered unit for this district — check for typos, or select it from the dropdown instead of typing/pasting it.`);
    }

    if (reasons.length > 0) {
      row.status = 'error';
      row.errorReason = reasons.join('; ');
    }

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
  adjacent_thanas_raw: 'Adjacent Thanas (Mandatory) — e.g. Kotwali, Hazratganj\nसंलग्न थाने (अनिवार्य) — उदा. कोतवाली, हज़रतगंज',
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
  { key: 'license_fee_lf', allowedTypes: ['MODEL_SHOP', 'PRV', 'BHANG_SHOP', 'HBR'] },
  { key: 'basic_license_fee_blf', allowedTypes: ['COUNTRY_LIQUOR'] },
  { key: 'mgr_amount', allowedTypes: ['MODEL_SHOP', 'PRV'] },
  { key: 'composite_lf_fl', allowedTypes: ['COMPOSITE_SHOP'] },
  { key: 'composite_lf_beer', allowedTypes: ['COMPOSITE_SHOP'] },
  { key: 'composite_mgr_fl', allowedTypes: ['COMPOSITE_SHOP'] },
  { key: 'composite_mgr_beer', allowedTypes: ['COMPOSITE_SHOP'] },
  { key: 'mgq_quantity', allowedTypes: ['BHANG_SHOP'] },
  { key: 'consideration_fee', allowedTypes: ['COUNTRY_LIQUOR', 'HBR'] },
  { key: 'special_beer_lf', allowedTypes: ['COUNTRY_LIQUOR'], requireCl5cc: true },
  { key: 'special_beer_mgr', allowedTypes: ['COUNTRY_LIQUOR'], requireCl5cc: true },
];

const COLUMN_GUIDE: unknown[][] = [
  ['Field / फ़ील्ड', 'Description / विवरण', 'Required For / किसके लिए आवश्यक', 'Notes / नोट्स'],
  [FRIENDLY_LABELS.circle_sector_name, 'Circle or sector name — must exactly match a pre-registered unit.\nसर्कल या सेक्टर का नाम — पहले से रजिस्टर्ड unit से बिल्कुल मेल खाना चाहिए।', 'All shop types / सभी प्रकार', 'Pre-registered in the portal before template download.\nटेम्पलेट डाउनलोड करने से पहले पोर्टल में रजिस्टर होता है।'],
  [FRIENDLY_LABELS.thana_name, 'Enter the Thana name.\nथाना नाम दर्ज करें।', 'All shop types / सभी प्रकार', 'English only. Free text — no master list enforced in Phase 1.\nकेवल अंग्रेज़ी में। स्वतंत्र टेक्स्ट है।'],
  [FRIENDLY_LABELS.adjacent_thanas_raw, 'Names of Thanas adjacent to this Thana, comma-separated. Example: Kotwali, Hazratganj\nइस थाने से सटे (adjacent) थानों के नाम, अल्पविराम (,) से अलग करके। उदाहरण: Kotwali, Hazratganj', 'All shop types — MANDATORY, cannot be left blank / सभी प्रकार — अनिवार्य, खाली नहीं छोड़ सकते', 'At least one Thana name is required — a blank cell will be rejected on the Verify page and cannot be submitted. Only list Thanas within this district. Separately, a name turns red on the Verify page if it doesn\'t (yet) appear as a Thana elsewhere in this district\'s own uploaded data — that red-name check is NOT an error and does not block submission on its own; it usually just means no shop from that Thana has been uploaded yet in this batch. Still worth a spelling check, but a red name by itself is fine — only a fully blank cell is blocked.\nकम से कम एक Thana नाम अनिवार्य है — खाली cell को Verify पेज पर अस्वीकार कर दिया जाएगा और सबमिट नहीं हो सकेगा। केवल इसी जिले के थाने लिखें। इसके अलावा, अगर कोई नाम अभी तक इस जिले के अपने अपलोड किए गए डेटा में कहीं और Thana के रूप में मौजूद नहीं है, तो वह नाम लाल हो जाता है — यह red-name जांच अपने आप में कोई त्रुटि नहीं है और इससे सबमिशन नहीं रुकता; आमतौर पर इसका मतलब बस इतना है कि उस Thana की कोई दुकान अभी तक इस batch में अपलोड नहीं हुई। फिर भी वर्तनी एक बार जांच लें, लेकिन अकेले लाल नाम होना कोई समस्या नहीं है — केवल पूरी तरह खाली cell को रोका जाता है।'],
  [FRIENDLY_LABELS.shop_id, 'Department-assigned license/registration ID.\nविभाग द्वारा दिया गया लाइसेंस/पंजीकरण आईडी।', 'All shop types / सभी प्रकार', 'Alphanumeric. Must be unique within the district. For HBR shops, include "HBR" in the ID (e.g. HBR001) so bar licenses are identifiable by ID alone — a soft warning, not a blocking rule.\nअक्षर व अंक। जिले में अद्वितीय होना चाहिए। HBR दुकानों के लिए, ID में "HBR" शामिल करें (जैसे HBR001) ताकि bar license सिर्फ ID से पहचाने जा सकें — यह एक सुझाव है, अनिवार्य नियम नहीं।'],
  [FRIENDLY_LABELS.shop_name, 'Official name of the retail vend.\nदुकान का आधिकारिक नाम।', 'All shop types / सभी प्रकार', 'English only.\nकेवल अंग्रेज़ी में।'],
  [FRIENDLY_LABELS.shop_type, 'Shop classification — choose from the dropdown.\nदुकान का वर्गीकरण — dropdown से चुनें।', 'All shop types / सभी प्रकार', 'MODEL_SHOP | COMPOSITE_SHOP | PRV | BHANG_SHOP | COUNTRY_LIQUOR | HBR'],
  [FRIENDLY_LABELS.has_cl5cc, 'TRUE = Country Liquor shop that ALSO has the CL5CC beer endorsement. FALSE = every other case, including a standard Country Liquor shop that sells only country liquor and no beer. Type TRUE or FALSE.\nTRUE = ऐसी Country Liquor दुकान जिसके पास CL5CC बियर endorsement भी है। FALSE = बाकी हर स्थिति, जिसमें एक सामान्य Country Liquor दुकान भी शामिल है जो केवल देशी शराब बेचती है, बियर नहीं। TRUE या FALSE टाइप करें।', 'All shop types (FALSE/blank) — TRUE only for COUNTRY_LIQUOR / सभी प्रकार (FALSE/खाली) — TRUE केवल COUNTRY_LIQUOR के लिए', 'FALSE (or leaving it blank) is correct and expected for every shop type — including most Country Liquor shops, which don\'t have the beer endorsement. The cell itself rejects TRUE unless Shop Type is Country Liquor; FALSE/blank is always accepted.\nFALSE (या खाली छोड़ना) हर दुकान प्रकार के लिए सही और सामान्य है — जिसमें अधिकतर Country Liquor दुकानें भी शामिल हैं, जिनके पास बियर endorsement नहीं होता। Cell खुद TRUE को अस्वीकार कर देगा जब तक Shop Type Country Liquor न हो; FALSE/खाली हमेशा मान्य है।'],
  [FRIENDLY_LABELS.latitude, 'Latitude — DMS or Decimal.\nअक्षांश — DMS या Decimal में।', 'All shop types (fill in when known) / सभी प्रकार (जब पता हो तब भरें)', 'e.g. 26°50\'48.12"N or 26.8467'],
  [FRIENDLY_LABELS.longitude, 'Longitude — DMS or Decimal.\nदेशांतर — DMS या Decimal में।', 'All shop types (fill in when known) / सभी प्रकार (जब पता हो तब भरें)', 'e.g. 80°56\'46.3"E or 80.9462'],
  [FRIENDLY_LABELS.license_fee_lf, 'Annual license fee (INR, whole rupees).\nवार्षिक लाइसेंस शुल्क (INR, पूर्ण रुपयों में)।', 'MODEL_SHOP, PRV, BHANG_SHOP, HBR', 'Locked to 0 for other shop types — cell will reject entry. For Composite Shop, leave this blank/0 — the portal computes it automatically from Composite LF – Foreign Liquor + Composite LF – Beer below.\nअन्य दुकान प्रकार के लिए यह 0 पर locked है — गलत entry स्वीकार नहीं होगी। Composite Shop के लिए इसे खाली/0 छोड़ें — पोर्टल इसे नीचे दिए गए Composite LF – Foreign Liquor + Composite LF – Beer से स्वतः गणना कर लेगा।'],
  [FRIENDLY_LABELS.basic_license_fee_blf, 'Basic license fee for country liquor (INR).\nदेशी शराब के लिए मूल लाइसेंस शुल्क (INR)।', 'COUNTRY_LIQUOR', 'Locked to 0 for other shop types.\nअन्य दुकान प्रकार के लिए 0 पर locked है।'],
  [FRIENDLY_LABELS.mgr_amount, 'Annual Minimum Guaranteed Revenue (INR).\nवार्षिक न्यूनतम गारंटीड राजस्व (INR)।', 'MODEL_SHOP, PRV', 'Locked to 0 for other shop types. For Composite Shop, leave this blank/0 — the portal computes it automatically from Composite MGR – Foreign Liquor + Composite MGR – Beer below.\nअन्य दुकान प्रकार के लिए 0 पर locked है। Composite Shop के लिए इसे खाली/0 छोड़ें — पोर्टल इसे नीचे दिए गए Composite MGR – Foreign Liquor + Composite MGR – Beer से स्वतः गणना कर लेगा।'],
  [FRIENDLY_LABELS.composite_lf_fl, 'Annual LF for Foreign Liquor component (INR).\nविदेशी शराब भाग के लिए वार्षिक LF (INR)।', 'COMPOSITE_SHOP only / केवल COMPOSITE_SHOP', 'Locked to 0 for other shop types.\nअन्य दुकान प्रकार के लिए 0 पर locked है।'],
  [FRIENDLY_LABELS.composite_lf_beer, 'Annual LF for Beer component (INR).\nबियर भाग के लिए वार्षिक LF (INR)।', 'COMPOSITE_SHOP only / केवल COMPOSITE_SHOP', 'Locked to 0 for other shop types.\nअन्य दुकान प्रकार के लिए 0 पर locked है।'],
  [FRIENDLY_LABELS.composite_mgr_fl, 'Annual MGR for Foreign Liquor (INR).\nविदेशी शराब के लिए वार्षिक MGR (INR)।', 'COMPOSITE_SHOP only / केवल COMPOSITE_SHOP', 'Locked to 0 for other shop types.\nअन्य दुकान प्रकार के लिए 0 पर locked है।'],
  [FRIENDLY_LABELS.composite_mgr_beer, 'Annual MGR for Beer (INR).\nबियर के लिए वार्षिक MGR (INR)।', 'COMPOSITE_SHOP only / केवल COMPOSITE_SHOP', 'Locked to 0 for other shop types.\nअन्य दुकान प्रकार के लिए 0 पर locked है।'],
  [FRIENDLY_LABELS.mgq_quantity, 'Minimum Guaranteed QUANTITY in units — NOT rupees.\nन्यूनतम गारंटीड मात्रा, यूनिट में — रुपये में नहीं।', 'BHANG_SHOP only / केवल BHANG_SHOP', 'Multiplied by ₹20/unit for revenue. Locked to 0 for other shop types.\nराजस्व हेतु ₹20 प्रति यूनिट से गुणा होता है। अन्य दुकान प्रकार के लिए 0 पर locked है।'],
  [FRIENDLY_LABELS.consideration_fee, 'Consideration fee (INR). For HBR, this is the total consideration fee involved in the lifting for the previous license year.\nप्रतिफल शुल्क (INR)। HBR के लिए, यह पिछले लाइसेंस वर्ष की lifting में शामिल कुल प्रतिफल शुल्क है।', 'COUNTRY_LIQUOR, HBR', 'Locked to 0 for other shop types.\nअन्य दुकान प्रकार के लिए 0 पर locked है।'],
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
  // Excel 2007's older validation-list rendering can silently let a DEO/Inspector type past
  // the dropdown/lock rules this template depends on — this line is the only warning visible
  // to someone who never opens the app, so it must live in the file itself, not just the UI.
  titleCell.value = `${titleText}\n⚠ Open only in Microsoft Excel 2013 or later (or Excel Online) — Excel 2007/2010 do not reliably show this file's dropdowns and validation rules. / केवल Microsoft Excel 2013 या नए वर्शन में खोलें — पुराने Excel में dropdown और validation सही से काम नहीं करते।`;
  titleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A44' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  titleCell.protection = { locked: true };
  ws.getRow(1).height = 42;

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
  const shopIdCol = TEMPLATE_HEADERS.indexOf('shop_id') + 1;
  const colLetter = (n: number) => ws.getColumn(n).letter;
  const validations = (ws as ValidatableWorksheet).dataValidations;

  validations.add(`${colLetter(shopTypeCol)}3:${colLetter(shopTypeCol)}${VALIDATION_ROW_LIMIT}`, {
    type: 'list', allowBlank: true, formulae: [`"${SHOP_TYPE_OPTIONS.join(',')}"`],
    showInputMessage: true, promptTitle: 'Shop type', prompt: 'Choose a shop type from the dropdown list.',
    showErrorMessage: true, errorStyle: 'error', errorTitle: 'Invalid shop type', error: `Use one of: ${SHOP_TYPE_OPTIONS.join(', ')}`,
  });

  // Per-cell gate: a financial field only accepts a value when the row's shop_type (and,
  // for CL5CC fields, has_cl5cc) matches — matches CLAUDE.md's Revenue Formulas table
  // exactly, so a DEO cannot fill e.g. basic_license_fee_blf on a MODEL_SHOP row.
  const shopTypeLetter = colLetter(shopTypeCol);
  const cl5ccLetter = colLetter(cl5ccCol);

  // has_cl5cc: a custom formula, not a plain list dropdown — TRUE is only accepted when
  // shop_type is Country Liquor; FALSE (and blank) are always accepted regardless of type.
  // This used to be a `custom` formula comparing the cell against the *quoted text*
  // "true"/"false", which never matched a real Boolean cell value and rejected every entry
  // in both directions (fixed to a plain list dropdown in M-31). That old bug was the quoting,
  // not the custom-formula approach itself — this formula uses the same unquoted boolean
  // literal comparison (`=TRUE`/`=FALSE`) already proven correct in the FIELD_GATES loop
  // below. The tradeoff versus the M-31 dropdown: no autofill/dropdown arrow on this cell
  // anymore (Excel can't combine a `list` and a `custom` validation on one cell) — the DEO
  // types TRUE or FALSE, which Excel auto-converts to a native Boolean the same way either
  // input method would.
  validations.add(`${cl5ccLetter}3:${cl5ccLetter}${VALIDATION_ROW_LIMIT}`, {
    type: 'custom', allowBlank: true,
    formulae: [`=OR($${cl5ccLetter}3="",$${cl5ccLetter}3=FALSE,AND($${cl5ccLetter}3=TRUE,$${shopTypeLetter}3="${SHOP_TYPE_LABELS.COUNTRY_LIQUOR}"))`],
    showInputMessage: true, promptTitle: 'CL5CC', prompt: 'Type TRUE or FALSE. TRUE is only valid when Shop Type is Country Liquor.',
    showErrorMessage: true, errorStyle: 'error', errorTitle: 'Invalid value',
    error: 'Type TRUE or FALSE. TRUE is only valid when Shop Type is Country Liquor.\nTRUE या FALSE टाइप करें। TRUE केवल तभी मान्य है जब Shop Type Country Liquor हो।',
  });
  if (units.length > 0) {
    validations.add(`${colLetter(unitCol)}3:${colLetter(unitCol)}${VALIDATION_ROW_LIMIT}`, {
      type: 'list', allowBlank: true, formulae: [`'Reference Data'!$A$2:$A$${units.length + 1}`],
      showInputMessage: true, promptTitle: 'Circle / Sector', prompt: 'Select a registered unit.',
      showErrorMessage: true, errorStyle: 'error', errorTitle: 'Invalid Unit', error: 'Please select a unit from the dropdown list.',
    });
  }

  // Shop ID convention for HBR: the department identifies bar licenses by an ID containing
  // "HBR" (e.g. HBR001), so a DEO can visually spot HBR rows in the ID column alone.
  // `errorStyle: 'warning'` (not 'error') deliberately — this is a naming convention to guide
  // future entries, not a hard rule to enforce retroactively; a DEO can click "Yes" past it,
  // so districts that already have HBR data under a different ID pattern are never blocked.
  const shopIdLetter = colLetter(shopIdCol);
  validations.add(`${shopIdLetter}3:${shopIdLetter}${VALIDATION_ROW_LIMIT}`, {
    type: 'custom', allowBlank: true,
    formulae: [`=OR($${shopTypeLetter}3<>"${SHOP_TYPE_LABELS.HBR}",ISNUMBER(SEARCH("HBR",$${shopIdLetter}3)))`],
    showInputMessage: true, promptTitle: 'Shop ID', prompt: 'For HBR shops, the Shop ID should contain "HBR" (e.g. HBR001).',
    showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Shop ID convention for HBR',
    error: 'For shop type HBR, the Shop ID should contain "HBR" (e.g. HBR001). Click Yes to keep this value anyway.\nशॉप टाइप HBR के लिए, Shop ID में "HBR" शामिल होना चाहिए (जैसे HBR001)। इस value को फिर भी रखने के लिए Yes पर क्लिक करें।',
  });
  for (const gate of FIELD_GATES) {
    const col = TEMPLATE_HEADERS.indexOf(gate.key) + 1;
    const letter = colLetter(col);
    const allowedLabels = gate.allowedTypes.map((t) => SHOP_TYPE_LABEL_LOOKUP[t]!);
    const typesCond = allowedLabels.map((label) => `$${shopTypeLetter}3="${label}"`).join(',');
    // $cl5ccLetter}3=TRUE (unquoted boolean literal), not ="true" — Excel auto-converts a
    // typed "true" token to a native Boolean, which never equals the quoted text "true"
    // (same bug just fixed on the has_cl5cc column itself).
    const cond = gate.requireCl5cc ? `AND(OR(${typesCond}),$${cl5ccLetter}3=TRUE)` : `OR(${typesCond})`;
    const [enLabel] = FRIENDLY_LABELS[gate.key]!.split('\n');
    validations.add(`${letter}3:${letter}${VALIDATION_ROW_LIMIT}`, {
      type: 'custom', allowBlank: true, formulae: [`=OR($${letter}3="",$${letter}3=0,${cond})`],
      showErrorMessage: true, errorStyle: 'error',
      errorTitle: 'Not applicable for this type',
      error: `"${enLabel}" only applies to ${allowedLabels.join('/')}${gate.requireCl5cc ? ' with CL5CC' : ''}. Leave blank or 0 otherwise.\nयह फ़ील्ड केवल ${allowedLabels.join('/')}${gate.requireCl5cc ? ' (CL5CC सहित)' : ''} के लिए है। अन्यथा खाली या 0 छोड़ें।`,
    });
  }

  // No password — a guardrail against accidentally overtyping a header, not a security
  // boundary (same pattern as the Reference Data sheet below). Data cells stay unlocked via
  // the column-level default set above, so typing/sorting/filtering data rows is unaffected.
  await ws.protect('', {
    selectLockedCells: true, selectUnlockedCells: true,
    formatCells: false, formatColumns: true, formatRows: false,
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
  const guideColCount = (COLUMN_GUIDE[0] as unknown[]).length;
  wsGuide.spliceRows(1, 0, [
    '⚠ Use Microsoft Excel 2013 or later (or Excel Online) to open and fill this file. Excel 2007/2010 do not reliably show its dropdowns and validation rules, which can let wrong data get typed in undetected.\n' +
    'केवल Microsoft Excel 2013 या नए वर्शन में यह फ़ाइल खोलें और भरें। पुराने Excel (2007/2010) में इस फ़ाइल के dropdown और validation सही से नहीं दिखते, जिससे गलत डेटा बिना पकड़े भर सकता है।',
  ], [
    '⚠ For "Shop Type" and "Circle / Sector Name": you MUST click the cell and pick a value from its dropdown arrow — do not type or paste your own text. Excel\'s dropdown check does not run on typed/pasted values, so a value like "Circle 1" or "Composite Shop" (instead of the exact dropdown option) is silently accepted by Excel but rejected or misfiled later, and this cannot be corrected afterward except by re-entering that row correctly.\n' +
    '"Shop Type" और "Circle / Sector Name" के लिए: सेल पर क्लिक करके dropdown arrow से value चुनें — खुद टाइप या paste न करें। Excel की dropdown जांच टाइप/paste की गई value पर काम नहीं करती, इसलिए "Circle 1" या "Composite Shop" जैसी गलत value (सही dropdown option की बजाय) बिना रोक-टोक स्वीकार हो जाती है, और बाद में उसे ठीक करना पड़ता है — इसलिए शुरू से ही dropdown का उपयोग करें।',
  ]);
  wsGuide.mergeCells(1, 1, 1, guideColCount);
  const guideWarnCell = wsGuide.getCell(1, 1);
  guideWarnCell.font = { bold: true, color: { argb: 'FF7A0000' } };
  guideWarnCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0B2' } };
  guideWarnCell.alignment = { wrapText: true, vertical: 'middle' };
  wsGuide.getRow(1).height = 60;
  wsGuide.mergeCells(2, 1, 2, guideColCount);
  const dropdownWarnCell = wsGuide.getCell(2, 1);
  dropdownWarnCell.font = { bold: true, color: { argb: 'FF7A0000' } };
  dropdownWarnCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCDD2' } };
  dropdownWarnCell.alignment = { wrapText: true, vertical: 'middle' };
  wsGuide.getRow(2).height = 90;
  applyPrintSetup(wsGuide, 3, guideColCount);
  wsGuide.views = [{ state: 'frozen', ySplit: 3, xSplit: 0 }];

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
    ['DEO Email', 'Department-issued email address for this DEO', 'For records only — DEOs sign in via CUG, not email/magic-link. Must be unique across all 75 rows.'],
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

// ── Admin exports ────────────────────────────────────────────────────────────
//
// Every admin-facing export (full-state, per-district, per-circle/sector) shares this one
// row shape and one sheet builder, so a header/format change only ever happens in one place.
// Headers are English-only — CLAUDE.md's DEO Workflow section is explicit that the admin/HQ
// portal is English-only; bilingual headers are a DEO-template-only thing (see
// buildShopDataSheet above). shop_type uses the bare SHOP_TYPE_LABELS (e.g. "HBR", never
// spelled out) — the same values the upload template's dropdown uses — not the admin district
// page's TYPE_LABEL, which spells HBR out for on-screen prose only (see CLAUDE.md's Shop Type
// Enum section).

export interface ExportShopRow {
  districtName?: string;
  shopId: string;
  shopName: string;
  circleSectorName: string;
  thanaName: string;
  adjacentThanasRaw: string | null;
  shopType: string;
  hasCl5cc: boolean;
  latitudeDecimal: number | null;
  longitudeDecimal: number | null;
  licenseFeeLf: number;
  basicLicenseFeeBlf: number;
  mgrAmount: number;
  compositeLfFl: number;
  compositeLfBeer: number;
  compositeMgrFl: number;
  compositeMgrBeer: number;
  mgqQuantity: number;
  considerationFee: number;
  specialBeerLf: number;
  specialBeerMgr: number;
  totalRevenue: number;
  uploadedByDeo: string;
}

const SHOP_EXPORT_HEADERS = [
  'Shop ID', 'Shop Name', 'Circle / Sector Name', 'Thana Name', 'Adjacent Thanas',
  'Shop Type', 'Has CL5CC?', 'Latitude', 'Longitude',
  'License Fee (LF) ₹', 'Basic License Fee (BLF) ₹', 'Min. Guaranteed Revenue (MGR) ₹',
  'Composite LF – Foreign Liquor ₹', 'Composite LF – Beer ₹',
  'Composite MGR – Foreign Liquor ₹', 'Composite MGR – Beer ₹',
  'MGQ Quantity (units)', 'Consideration Fee ₹',
  'Special Beer LF ₹ (CL5CC)', 'Special Beer MGR ₹ (CL5CC)',
  'Total Revenue ₹', 'Uploaded By (DEO ID)',
];
const REVENUE_COL_LABEL = 'Total Revenue ₹';

function shopExportHeaders(includeDistrict: boolean): string[] {
  return includeDistrict ? ['District Name', ...SHOP_EXPORT_HEADERS] : SHOP_EXPORT_HEADERS;
}

function shopExportValues(s: ExportShopRow, includeDistrict: boolean): unknown[] {
  const base = [
    s.shopId, s.shopName, s.circleSectorName, s.thanaName, s.adjacentThanasRaw ?? '',
    SHOP_TYPE_LABEL_LOOKUP[s.shopType] ?? s.shopType, s.hasCl5cc,
    s.latitudeDecimal, s.longitudeDecimal,
    s.licenseFeeLf, s.basicLicenseFeeBlf, s.mgrAmount,
    s.compositeLfFl, s.compositeLfBeer, s.compositeMgrFl, s.compositeMgrBeer,
    s.mgqQuantity, s.considerationFee, s.specialBeerLf, s.specialBeerMgr,
    s.totalRevenue, s.uploadedByDeo,
  ];
  return includeDistrict ? [s.districtName ?? '', ...base] : base;
}

/** Excel sheet names: max 31 chars, no `: \ / ? * [ ]`. District names in this dataset don't
 * contain those, but sanitize defensively rather than assume. */
function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, '').trim();
  return (cleaned || 'Sheet').slice(0, 31);
}

/** One title row + one header row + shop rows + a bold TOTAL row — the shared shape behind
 * every shop-list sheet, whether it's a single-sheet download or one tab inside a bigger
 * workbook. An empty list still gets a real sheet with a placeholder line, not a skipped tab,
 * so a multi-district export's tab structure stays stable across runs. */
function addShopSheet(
  wb: ExcelJSNamespace.Workbook,
  sheetName: string,
  titleText: string,
  shops: ExportShopRow[],
  includeDistrict = false,
): ExcelJSNamespace.Worksheet {
  const ws = wb.addWorksheet(sanitizeSheetName(sheetName));
  const headers = shopExportHeaders(includeDistrict);

  ws.mergeCells(1, 1, 1, headers.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = titleText;
  titleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A44' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 24;

  ws.getRow(2).values = headers as ExcelJSNamespace.CellValue[];
  styleHeaderRow(ws, 2);

  if (shops.length === 0) {
    const r = ws.addRow(['No shop data uploaded yet.']);
    ws.mergeCells(r.number, 1, r.number, headers.length);
    r.getCell(1).alignment = { horizontal: 'center' };
    r.getCell(1).font = { italic: true, color: { argb: 'FF64748B' } };
  } else {
    for (const s of shops) ws.addRow(shopExportValues(s, includeDistrict) as ExcelJSNamespace.CellValue[]);
    const totalRevenue = shops.reduce((sum, s) => sum + s.totalRevenue, 0);
    const totalRow = new Array(headers.length).fill('');
    totalRow[0] = `TOTAL — ${shops.length} shop${shops.length === 1 ? '' : 's'}`;
    const revenueColIdx = headers.indexOf(REVENUE_COL_LABEL);
    if (revenueColIdx >= 0) totalRow[revenueColIdx] = totalRevenue;
    const row = ws.addRow(totalRow);
    row.font = { bold: true };
    row.eachCell((cell) => { cell.border = { top: { style: 'thin' } }; });
  }

  ws.columns = headers.map((h) => ({ width: Math.max(16, h.length + 2) }));
  applyPrintSetup(ws, 2, headers.length);
  ws.pageSetup.printTitlesRow = '1:2';
  ws.views = [{ state: 'frozen', ySplit: 2, xSplit: 0 }];
  return ws;
}

/** Single-sheet download — used for a district's full shop list and for a single
 * circle/sector's shop list (district detail page). */
export async function exportShopsToXlsx(
  shops: ExportShopRow[],
  opts: { title: string; sheetName: string; filename: string },
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'UP Excise Spatial Revenue Optimizer';
  wb.created = new Date();
  addShopSheet(wb, opts.sheetName, opts.title, shops, false);

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = opts.filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface StateExportDistrict {
  name: string; division: string | null; deoName: string | null; status: string;
  expectedVendCount: number | null; vendCount: number; totalRevenue: number;
  submittedAt: string | null;
}

export interface StateExportUnit { districtName: string; name: string; type: string; }

const CIRCLE_SECTOR_TYPE_KEYS = ['MODEL_SHOP', 'COMPOSITE_SHOP', 'PRV', 'BHANG_SHOP', 'COUNTRY_LIQUOR', 'HBR'];

function buildSummarySheet(wb: ExcelJSNamespace.Workbook, districts: StateExportDistrict[], shops: ExportShopRow[]) {
  const ws = wb.addWorksheet('Summary');
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  let r = 1;

  function sectionTitle(text: string) {
    const cell = ws.getCell(r, 1);
    cell.value = text;
    cell.font = { bold: true, size: 13 };
    r += 1;
  }
  function tableHeader(cols: string[]) {
    ws.getRow(r).values = cols as ExcelJSNamespace.CellValue[];
    styleHeaderRow(ws, r);
    r += 1;
  }
  function dataRow(vals: unknown[]) {
    ws.getRow(r).values = vals as ExcelJSNamespace.CellValue[];
    r += 1;
  }

  const totalRevenue = shops.reduce((sum, s) => sum + s.totalRevenue, 0);
  const submittedOrVerifiedCount = districts.filter((d) => d.status === 'submitted' || d.status === 'verified').length;

  sectionTitle('State Totals');
  tableHeader(['Metric', 'Value']);
  dataRow(['Districts Submitted', `${submittedOrVerifiedCount} of ${districts.length}`]);
  dataRow(['Total Shops', shops.length]);
  dataRow(['Total Revenue ₹', totalRevenue]);
  r += 1;

  sectionTitle('District Status Breakdown');
  tableHeader(['Status', 'Districts']);
  const statusCounts: Record<string, number> = {};
  for (const d of districts) statusCounts[d.status] = (statusCounts[d.status] ?? 0) + 1;
  for (const status of ['pending', 'in_progress', 'submitted', 'verified']) {
    dataRow([STATUS_LABEL[status] ?? status, statusCounts[status] ?? 0]);
  }
  r += 1;

  sectionTitle('Shop Type Breakdown');
  tableHeader(['Shop Type', 'Count', 'Revenue ₹']);
  const byType: Record<string, { count: number; revenue: number }> = {};
  for (const s of shops) {
    if (!byType[s.shopType]) byType[s.shopType] = { count: 0, revenue: 0 };
    byType[s.shopType]!.count += 1;
    byType[s.shopType]!.revenue += s.totalRevenue;
  }
  for (const [type, agg] of Object.entries(byType)) dataRow([SHOP_TYPE_LABEL_LOOKUP[type] ?? type, agg.count, agg.revenue]);
  r += 1;

  sectionTitle('Division Rollup');
  tableHeader(['Division', 'Districts', 'Submitted', 'Total Shops', 'Total Revenue ₹']);
  const byDivision: Record<string, { districts: number; submitted: number; shops: number; revenue: number }> = {};
  for (const d of districts) {
    const key = d.division ?? 'Unassigned';
    if (!byDivision[key]) byDivision[key] = { districts: 0, submitted: 0, shops: 0, revenue: 0 };
    byDivision[key]!.districts += 1;
    if (d.status === 'submitted') byDivision[key]!.submitted += 1;
    byDivision[key]!.shops += d.vendCount;
    byDivision[key]!.revenue += d.totalRevenue;
  }
  for (const [division, agg] of Object.entries(byDivision).sort(([a], [b]) => a.localeCompare(b))) {
    dataRow([division, agg.districts, agg.submitted, agg.shops, agg.revenue]);
  }

  ws.columns = [{ width: 28 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 20 }];
}

function buildDistrictsSheet(wb: ExcelJSNamespace.Workbook, districts: StateExportDistrict[]) {
  const ws = wb.addWorksheet('Districts');
  const headers = ['District', 'Division', 'DEO Name', 'Status', 'Expected Vends', 'Actual Vends', 'Total Revenue ₹', 'Submitted At'];
  ws.getRow(1).values = headers as ExcelJSNamespace.CellValue[];
  styleHeaderRow(ws, 1);
  for (const d of districts) {
    ws.addRow([
      d.name, d.division ?? '', d.deoName ?? '', d.status,
      d.expectedVendCount ?? '', d.vendCount, d.totalRevenue,
      d.submittedAt ? new Date(d.submittedAt).toLocaleDateString('en-IN') : '',
    ]);
  }
  ws.columns = headers.map((h) => ({ width: Math.max(16, h.length + 4) }));
  applyPrintSetup(ws, 1, headers.length);
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];
}

/** One row per district: status, circle/sector count, total shops/revenue, and a count +
 * revenue column pair per shop type — the per-district detail behind the Summary sheet's
 * state-wide totals, for admins who need to see progress and shop-type mix district by
 * district in one sheet rather than opening all 75 per-district tabs. */
function buildDistrictProgressSheet(
  wb: ExcelJSNamespace.Workbook,
  districts: StateExportDistrict[],
  shops: ExportShopRow[],
  units: StateExportUnit[],
) {
  const ws = wb.addWorksheet('District Progress');

  const unitCountByDistrict = new Map<string, number>();
  for (const u of units) unitCountByDistrict.set(u.districtName, (unitCountByDistrict.get(u.districtName) ?? 0) + 1);

  const shopsByDistrict = new Map<string, ExportShopRow[]>();
  for (const s of shops) {
    const key = s.districtName ?? '';
    if (!shopsByDistrict.has(key)) shopsByDistrict.set(key, []);
    shopsByDistrict.get(key)!.push(s);
  }

  const typeHeaders = CIRCLE_SECTOR_TYPE_KEYS.flatMap((t) => [`${SHOP_TYPE_LABEL_LOOKUP[t]} Count`, `${SHOP_TYPE_LABEL_LOOKUP[t]} Revenue ₹`]);
  const headers = ['District', 'Division', 'Status', 'Circle/Sector Count', 'Total Shops', 'Total Revenue ₹', ...typeHeaders];
  ws.getRow(1).values = headers as ExcelJSNamespace.CellValue[];
  styleHeaderRow(ws, 1);

  for (const d of districts) {
    const districtShops = shopsByDistrict.get(d.name) ?? [];
    const byType: Record<string, { count: number; revenue: number }> = {};
    for (const s of districtShops) {
      if (!byType[s.shopType]) byType[s.shopType] = { count: 0, revenue: 0 };
      byType[s.shopType]!.count += 1;
      byType[s.shopType]!.revenue += s.totalRevenue;
    }
    const typeVals = CIRCLE_SECTOR_TYPE_KEYS.flatMap((t) => [byType[t]?.count ?? 0, byType[t]?.revenue ?? 0]);
    ws.addRow([
      d.name, d.division ?? '', STATUS_LABEL[d.status] ?? d.status,
      unitCountByDistrict.get(d.name) ?? 0, districtShops.length, d.totalRevenue,
      ...typeVals,
    ]);
  }

  ws.columns = headers.map((h) => ({ width: Math.max(14, h.length + 2) }));
  applyPrintSetup(ws, 1, headers.length);
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];
}

function buildStatusSummarySheet(wb: ExcelJSNamespace.Workbook, districts: StateExportDistrict[]) {
  const ws = wb.addWorksheet('Summary');
  const statusCounts: Record<string, number> = {};
  for (const d of districts) statusCounts[d.status] = (statusCounts[d.status] ?? 0) + 1;

  ws.getRow(1).values = ['Status', 'Districts'] as ExcelJSNamespace.CellValue[];
  styleHeaderRow(ws, 1);
  for (const status of ['pending', 'in_progress', 'submitted', 'verified']) {
    ws.addRow([STATUS_LABEL[status] ?? status, statusCounts[status] ?? 0]);
  }
  const totalRow = ws.addRow(['Total', districts.length]);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => { cell.border = { top: { style: 'thin' } }; });

  ws.columns = [{ width: 20 }, { width: 14 }];
}

/** Lightweight one-click download — just district status + per-district progress, not the
 * full 76-sheet state export. For an admin who wants a quick status snapshot without
 * generating every per-district/all-shops sheet. */
export async function generateDistrictProgressWorkbook(
  districts: StateExportDistrict[],
  shops: ExportShopRow[],
  units: StateExportUnit[],
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'UP Excise Spatial Revenue Optimizer';
  wb.created = new Date();
  buildStatusSummarySheet(wb, districts);
  buildDistrictProgressSheet(wb, districts, shops, units);
  return new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function buildCircleSectorSummarySheet(wb: ExcelJSNamespace.Workbook, shops: ExportShopRow[], units: StateExportUnit[]) {
  const ws = wb.addWorksheet('Circle-Sector Summary');
  const headers = [
    'District', 'Circle / Sector', 'Type', 'Distinct Thanas', 'Total Shops',
    ...CIRCLE_SECTOR_TYPE_KEYS.map((t) => SHOP_TYPE_LABEL_LOOKUP[t]!),
    'Total Revenue ₹',
  ];

  interface Agg { district: string; name: string; type: string; thanas: Set<string>; count: number; revenue: number; byType: Record<string, number> }
  const map = new Map<string, Agg>();
  for (const u of units) {
    map.set(`${u.districtName}::${u.name}`, { district: u.districtName, name: u.name, type: u.type, thanas: new Set(), count: 0, revenue: 0, byType: {} });
  }
  for (const s of shops) {
    const district = s.districtName ?? '';
    const key = `${district}::${s.circleSectorName}`;
    let entry = map.get(key);
    if (!entry) {
      entry = { district, name: s.circleSectorName, type: 'unit', thanas: new Set(), count: 0, revenue: 0, byType: {} };
      map.set(key, entry);
    }
    entry.thanas.add(s.thanaName);
    entry.count += 1;
    entry.revenue += s.totalRevenue;
    entry.byType[s.shopType] = (entry.byType[s.shopType] ?? 0) + 1;
  }

  const rows = Array.from(map.values()).sort((a, b) => a.district.localeCompare(b.district) || a.name.localeCompare(b.name));
  ws.getRow(1).values = headers as ExcelJSNamespace.CellValue[];
  styleHeaderRow(ws, 1);
  for (const e of rows) {
    ws.addRow([e.district, e.name, e.type, e.thanas.size, e.count, ...CIRCLE_SECTOR_TYPE_KEYS.map((t) => e.byType[t] ?? 0), e.revenue]);
  }
  ws.columns = headers.map((h) => ({ width: Math.max(14, h.length + 2) }));
  applyPrintSetup(ws, 1, headers.length);
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];
}

/**
 * Full-state export workbook: Summary, Districts (master table), Circle-Sector Summary,
 * All Shops (Flat, one row per shop across every district), then one sheet per district
 * (all 75, even ones with zero shops yet — a stable tab structure across export runs).
 * All generation happens in-browser via ExcelJS — no server-side spreadsheet work, per
 * CLAUDE.md's Cloudflare Free Tier constraint.
 */
export async function generateFullStateWorkbook(
  districts: StateExportDistrict[],
  shops: ExportShopRow[],
  units: StateExportUnit[],
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'UP Excise Spatial Revenue Optimizer';
  wb.created = new Date();

  buildSummarySheet(wb, districts, shops);
  buildDistrictsSheet(wb, districts);
  buildDistrictProgressSheet(wb, districts, shops, units);
  buildCircleSectorSummarySheet(wb, shops, units);
  addShopSheet(wb, 'All Shops (Flat)', 'All Districts — Flat Shop List', shops, true);

  const byDistrict = new Map<string, ExportShopRow[]>();
  for (const s of shops) {
    const key = s.districtName ?? '';
    if (!byDistrict.has(key)) byDistrict.set(key, []);
    byDistrict.get(key)!.push(s);
  }
  for (const d of districts) {
    addShopSheet(wb, d.name, `District: ${d.name.toUpperCase()}`, byDistrict.get(d.name) ?? [], false);
  }

  return new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
