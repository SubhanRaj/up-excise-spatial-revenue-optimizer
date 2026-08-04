/**
 * Regression guard for the recurring "Excel found unreadable content" class of bug.
 *
 * Real incident (2026-08-04): an errorTitle one character over OOXML's 32-char cap on
 * `dataValidation@errorTitle` made strict Excel builds prompt a repair on open while
 * lenient builds (older Excel, Excel Online, LibreOffice) opened the file fine — the
 * exact "some users, not others" pattern that made it hard to catch by hand. This script
 * builds the real DEO template with the real exceljs package, reloads it, and checks
 * every data-validation title/message and sheet name against Excel's actual OOXML limits.
 *
 * Run via `pnpm --filter web test` (wired into CI's `pnpm test` in ci.yml and deploy.yml,
 * so a violation blocks the deploy instead of only surfacing when a DEO opens the file).
 */
import ExcelJS from 'exceljs';
(globalThis as Record<string, unknown>).ExcelJS = ExcelJS;

const { generateTemplate, generateProvisionTemplate } = await import('../src/lib/excel.ts');

// OOXML schema limits (ECMA-376 / ISO 29500) that Excel enforces strictly on some builds
// and silently ignores on others — never loosen these without checking the actual spec.
const LIMITS = {
  errorTitle: 32,
  promptTitle: 32,
  error: 255,
  prompt: 255,
  sheetName: 31,
} as const;

let failures = 0;

function checkWorkbook(label: string, wb: ExcelJS.Workbook) {
  for (const ws of wb.worksheets) {
    if (ws.name.length > LIMITS.sheetName) {
      failures++;
      console.error(`[${label}] sheet name "${ws.name}" is ${ws.name.length} chars, over the ${LIMITS.sheetName}-char Excel limit`);
    }
    // exceljs's shipped type defs omit `dataValidations` on the loaded model, though it exists at runtime.
    const dv = (ws as unknown as { dataValidations?: { model?: Record<string, Record<string, unknown>> } }).dataValidations?.model;
    if (!dv) continue;
    for (const [addr, rule] of Object.entries(dv)) {
      for (const field of ['errorTitle', 'promptTitle', 'error', 'prompt'] as const) {
        const v = rule[field];
        if (typeof v === 'string' && v.length > LIMITS[field]) {
          failures++;
          console.error(`[${label}] ${ws.name}!${addr} ${field} is ${v.length} chars (limit ${LIMITS[field]}): ${JSON.stringify(v)}`);
        }
      }
    }
  }
}

async function loadFromBlob(blob: Blob): Promise<ExcelJS.Workbook> {
  const buf = Buffer.from(await blob.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

checkWorkbook('generateTemplate', await loadFromBlob(await generateTemplate('Test District', ['Sector - 1', 'Circle 2 - Test Area'])));
checkWorkbook('generateProvisionTemplate', await loadFromBlob(await generateProvisionTemplate([{ districtName: 'Test District', division: 'Test Division' }])));

if (failures > 0) {
  console.error(`\n${failures} Excel OOXML limit violation(s) found — fix before deploying. A violation here means some (not all) DEOs will get a "found unreadable content" repair prompt on open.`);
  process.exit(1);
}
console.log('Excel template OOXML limits OK.');
