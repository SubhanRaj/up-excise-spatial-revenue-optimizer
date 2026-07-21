import { test } from '@playwright/test';
import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Not a UI test — turns the screenshots captured by manual-screenshots.spec.ts into the
 * bilingual (English/Hindi) DEO User Manual PDF via Chromium's print-to-PDF (page.pdf()).
 * No new dependency: reuses the Playwright/Chromium already installed for e2e testing.
 * Run manual-screenshots.spec.ts first so docs/manual/screenshots/*.png and the sample
 * template xlsx (os.tmpdir()/excise-manual-template-sample.xlsx) exist.
 */

const MANUAL_DIR = path.join(__dirname, '..', '..', '..', 'docs', 'manual');
const SHOTS_DIR = path.join(MANUAL_DIR, 'screenshots');
const OUT_PDF = path.join(MANUAL_DIR, 'DEO-User-Manual.pdf');
const TEMPLATE_SAMPLE_PATH = path.join(os.tmpdir(), 'excise-manual-template-sample.xlsx');

// Revenue Formulas — mirrors CLAUDE.md's "Revenue Formulas" table and packages/schema/src/constants.ts
// exactly (BHANG_MGQ_MULTIPLIER, ON_PREMISES_CONSUMPTION_FEE). Kept as manual copy, not an
// import, since this is a Node test script outside the Next.js/schema build graph — if these
// constants ever change, update this table to match.
const BHANG_MGQ_MULTIPLIER = 20;
const ON_PREMISES_CONSUMPTION_FEE = 300_000;

interface Section {
  file?: string;
  titleEn: string;
  titleHi: string;
  textEn?: string;
  textHi?: string;
  /** Raw HTML body — used instead of file/textEn/textHi for table-style sections. */
  customHtml?: string;
  /** Table sections can span multiple pages — skip the single-page page-break-inside:avoid rule. */
  allowPageBreak?: boolean;
}

const SECTIONS: Section[] = [
  {
    file: '01-login-page.png',
    titleEn: '1. Signing In',
    titleHi: '१. साइन इन करें',
    textEn: 'Open the portal in your browser. DEOs sign in with their department CUG mobile number — tap the "CUG Mobile (DEO)" tab (selected by default), enter your 10-digit CUG number, and tap "Sign in". Your number is kept fully secure and private. You do not need a password.',
    textHi: 'अपने ब्राउज़र में पोर्टल खोलें। DEO अपने विभागीय CUG मोबाइल नंबर से साइन इन करते हैं — "CUG Mobile (DEO)" टैब चुनें (यह डिफ़ॉल्ट रूप से चयनित है), अपना 10-अंकीय CUG नंबर दर्ज करें, और "Sign in" पर टैप करें। आपका नंबर पूरी तरह सुरक्षित और निजी रखा जाता है। आपको किसी पासवर्ड की आवश्यकता नहीं है।',
  },
  {
    file: '02-home-step1-gate.png',
    titleEn: '2. Your Dashboard — Step 1 Only',
    titleHi: '२. आपका डैशबोर्ड — केवल चरण १',
    textEn: 'After signing in you land on your Dashboard. Until you register your district\'s Circles & Sectors, only "Step 1 — Create Circles & Sectors" is shown. Upload and Verify are intentionally hidden — they will appear automatically once Step 1 is complete. This ensures every district follows the same, correct order.',
    textHi: 'साइन इन करने के बाद आप अपने डैशबोर्ड पर पहुँचते हैं। जब तक आप अपने जिले के Circles & Sectors पंजीकृत नहीं करते, तब तक केवल "चरण 1 — Circles & Sectors बनाएं" दिखाया जाता है। Upload और Verify जानबूझकर छिपाए गए हैं — चरण 1 पूरा होते ही ये अपने-आप दिखाई देंगे। इससे हर जिला सही और एक जैसे क्रम का पालन करता है।',
  },
  {
    file: '03-units-step1-counts.png',
    titleEn: '3. Circles & Sectors — How Many?',
    titleHi: '३. Circles & Sectors — कितने हैं?',
    textEn: 'On the Circles & Sectors page, first tell the system how many Sectors (urban area) and how many Circles (rural area) your district has. Enter each count and tap "Continue →". You do not need to know the names yet — just the counts.',
    textHi: 'Circles & Sectors पेज पर, सबसे पहले सिस्टम को बताएं कि आपके जिले में कितने Sectors (शहरी क्षेत्र) और कितने Circles (ग्रामीण क्षेत्र) हैं। प्रत्येक संख्या दर्ज करें और "Continue →" पर टैप करें। अभी आपको नाम जानने की आवश्यकता नहीं है — केवल संख्या।',
  },
  {
    file: '04-units-step2-names-empty.png',
    titleEn: '4. Enter Each Name',
    titleHi: '४. प्रत्येक नाम दर्ज करें',
    textEn: 'The system generates one labelled box per Sector and Circle. Sector names are usually just a number (e.g. "Sector 1") but may include an area. Circle names usually include the area (e.g. "Circle 2 Fatehabad, Agra"). Note the numbering rule: if your district has any Sectors, Circle numbering starts at 2 — Circle 1 is reserved for the sector-covered urban area. Every box is required.',
    textHi: 'सिस्टम प्रत्येक Sector और Circle के लिए एक लेबल वाला बॉक्स बनाता है। Sector के नाम आमतौर पर सिर्फ एक नंबर होते हैं (जैसे "Sector 1") लेकिन इसमें कोई क्षेत्र भी शामिल हो सकता है। Circle के नाम में आमतौर पर क्षेत्र शामिल होता है (जैसे "Circle 2 Fatehabad, Agra")। नंबरिंग नियम ध्यान दें: यदि आपके जिले में कोई Sector है, तो Circle नंबरिंग 2 से शुरू होती है — Circle 1 शहरी क्षेत्र के लिए आरक्षित है। हर बॉक्स भरना अनिवार्य है।',
  },
  {
    file: '05-units-step2-names-filled.png',
    titleEn: '5. Double-Check Before Submitting',
    titleHi: '५. सबमिट करने से पहले दोबारा जांचें',
    textEn: 'Fill in every box carefully. Check spelling twice — once submitted, this list is locked and cannot be edited by you. If needed, tap "← Change Count" to go back and adjust the number of boxes.',
    textHi: 'हर बॉक्स को ध्यान से भरें। वर्तनी दो बार जांचें — एक बार सबमिट करने के बाद यह सूची लॉक हो जाती है और इसे आपके द्वारा edit नहीं किया जा सकता। यदि आवश्यक हो, तो बॉक्सों की संख्या बदलने के लिए "← Change Count" पर टैप करें।',
  },
  {
    file: '06-units-confirm-lock.png',
    titleEn: '6. Final Confirmation',
    titleHi: '६. अंतिम पुष्टि',
    textEn: 'A confirmation dialog warns you this action cannot be undone. Read the count of sectors and circles shown, then tap "Yes, Lock & Submit" only when you are certain every name is correct.',
    textHi: 'एक पुष्टिकरण संवाद आपको चेतावनी देता है कि यह क्रिया पूर्ववत नहीं की जा सकती। दिखाए गए sectors और circles की संख्या पढ़ें, फिर "Yes, Lock & Submit" पर तभी टैप करें जब आप सुनिश्चित हों कि हर नाम सही है।',
  },
  {
    file: '07-units-locked.png',
    titleEn: '7. Locked — Made a Mistake?',
    titleHi: '७. लॉक हो गया — कोई गलती हुई?',
    textEn: 'Once locked, your Sectors and Circles are shown read-only. If you spot an error, tap "Request Unlock" and explain the reason — an Admin at Headquarters will review your request and can unlock the list so you can re-register (see Section 12).',
    textHi: 'लॉक होने के बाद, आपके Sectors और Circles केवल पढ़ने के लिए दिखाए जाते हैं। यदि आपको कोई त्रुटि दिखे, तो "Request Unlock" पर टैप करें और कारण बताएं — मुख्यालय का एक Admin आपके अनुरोध की समीक्षा करेगा और सूची को अनलॉक कर सकता है ताकि आप दोबारा पंजीकरण कर सकें (देखें खंड १२)।',
  },
  {
    file: '08-home-all-steps-unlocked.png',
    titleEn: '8. Dashboard — All Steps Unlocked',
    titleHi: '८. डैशबोर्ड — सभी चरण अनलॉक',
    textEn: 'Return to your Dashboard. Now that Circles & Sectors are locked, the Upload and Verify cards appear automatically. Proceed to Step 2 — Upload District File.',
    textHi: 'अपने डैशबोर्ड पर वापस जाएं। अब जब Circles & Sectors लॉक हो चुके हैं, Upload और Verify कार्ड अपने-आप दिखाई देते हैं। चरण 2 — Upload District File पर आगे बढ़ें।',
  },
  {
    file: '09-upload-empty.png',
    titleEn: '9. Download the Template & Upload District File',
    titleHi: '९. टेम्पलेट डाउनलोड करें और जिला फ़ाइल अपलोड करें',
    textEn: 'First tap "Download District Template" — this generates a bilingual Excel workbook pre-filled with your registered Circle/Sector names (see Section 10 for what\'s inside). Give copies to your Inspectors to fill, then collect the filled sections, consolidate them into one district Excel file, and select it here. Every shop must reference a Circle/Sector name exactly as registered in Step 1.',
    textHi: 'सबसे पहले "Download District Template" पर टैप करें — यह आपके पंजीकृत Circle/Sector नामों से पहले से भरा हुआ एक द्विभाषी Excel workbook बनाता है (अंदर क्या है, यह जानने के लिए खंड १० देखें)। भरने के लिए इसकी प्रतियां अपने Inspectors को दें, फिर भरे गए हिस्से इकट्ठा करें, उन्हें एक जिला Excel फ़ाइल में मिलाएं, और उसे यहां चुनें। प्रत्येक दुकान को ठीक उसी Circle/Sector नाम का संदर्भ देना चाहिए जो चरण 1 में पंजीकृत किया गया था।',
  },
  // Sections 10 & 11 (template columns table + revenue formulas) are inserted programmatically
  // below, right after this array, since their content is read from the real downloaded
  // template / derived from shared constants rather than hand-written prose.
  {
    file: '10-upload-parsed.png',
    titleEn: '12. File Parsed Locally',
    titleHi: '१२. फ़ाइल स्थानीय रूप से पढ़ी गई',
    textEn: 'The Excel file is read entirely in your browser and saved to your device automatically — nothing is uploaded to the server yet. This means your data is safe even if your internet connection drops. Tap "Go to Verify →" to review every row before final submission.',
    textHi: 'Excel फ़ाइल पूरी तरह से आपके ब्राउज़र में पढ़ी जाती है और अपने-आप आपके डिवाइस पर सेव हो जाती है — अभी तक कुछ भी सर्वर पर अपलोड नहीं हुआ है। इसका मतलब है कि आपका डेटा सुरक्षित है भले ही आपका इंटरनेट कनेक्शन टूट जाए। अंतिम सबमिशन से पहले हर row की समीक्षा करने के लिए "Go to Verify →" पर टैप करें।',
  },
  {
    file: '11-verify-rows.png',
    titleEn: '13. Verify & Submit',
    titleHi: '१३. जाँचें और सबमिट करें',
    textEn: 'Review every row, grouped by Circle/Sector. Any adjacent-Thana entry shown in red is a possible typo — it does not block submission but is worth double-checking. Use the search box to find a specific shop by name or ID.',
    textHi: 'Circle/Sector के अनुसार समूहीकृत हर row की समीक्षा करें। लाल रंग में दिखाई देने वाली कोई भी adjacent-Thana प्रविष्टि एक संभावित टाइपो है — यह सबमिशन को नहीं रोकती लेकिन इसे दोबारा जांचना उचित है। किसी विशेष दुकान को नाम या ID से खोजने के लिए search box का उपयोग करें।',
  },
  {
    file: '12-verify-confirm-submit.png',
    titleEn: '14. Confirm Submission',
    titleHi: '१४. सबमिशन की पुष्टि करें',
    textEn: 'When every row looks correct, tap "Submit District". A confirmation dialog shows the row count and warns this sends your data to Headquarters. Tap "Yes, Submit" only when ready.',
    textHi: 'जब हर row सही लगे, तो "Submit District" पर टैप करें। एक पुष्टिकरण संवाद row की संख्या दिखाता है और चेतावनी देता है कि यह आपका डेटा मुख्यालय को भेज देगा। तैयार होने पर ही "Yes, Submit" पर टैप करें।',
  },
  {
    file: '13-verify-submitted.png',
    titleEn: '15. Submitted Successfully',
    titleHi: '१५. सफलतापूर्वक सबमिट हुआ',
    textEn: 'A success message confirms your district has been submitted to Headquarters. Your work for this district\'s data collection is now complete.',
    textHi: 'एक सफलता संदेश पुष्टि करता है कि आपका जिला मुख्यालय को सबमिट कर दिया गया है। इस जिले के डेटा संग्रहण के लिए आपका काम अब पूर्ण हो चुका है।',
  },
  {
    file: '15-units-request-unlock-dialog.png',
    titleEn: '16. Requesting an Unlock',
    titleHi: '१६. अनलॉक अनुरोध करना',
    textEn: 'If you find a mistake in your Circles/Sectors list after it is locked, go back to the Circles & Sectors page and tap "Request Unlock". Type a clear reason (this is required) and tap "Submit Request".',
    textHi: 'यदि आपको लॉक होने के बाद अपनी Circles/Sectors सूची में कोई गलती दिखे, तो Circles & Sectors पेज पर वापस जाएं और "Request Unlock" पर टैप करें। एक स्पष्ट कारण लिखें (यह आवश्यक है) और "Submit Request" पर टैप करें।',
  },
  {
    file: '16-units-unlock-pending.png',
    titleEn: '17. Waiting for Admin Review',
    titleHi: '१७. Admin समीक्षा की प्रतीक्षा',
    textEn: 'Once submitted, your request shows as "pending Admin review" along with the reason you gave. An Admin at Headquarters will either approve it (unlocking your list so you can re-register from scratch) or deny it with a note explaining why.',
    textHi: 'सबमिट होने के बाद, आपका अनुरोध आपके द्वारा दिए गए कारण के साथ "Admin समीक्षा के लिए लंबित" के रूप में दिखता है। मुख्यालय का एक Admin इसे या तो स्वीकार करेगा (आपकी सूची को अनलॉक करके ताकि आप दोबारा से पंजीकरण कर सकें) या एक नोट के साथ अस्वीकार करेगा जिसमें कारण बताया जाएगा।',
  },
];

/** Splits a COLUMN_GUIDE-style "English text\nHindi text" cell into its two lines. */
function splitBilingual(cell: string): [string, string] {
  const idx = cell.indexOf('\n');
  return idx === -1 ? [cell, ''] : [cell.slice(0, idx), cell.slice(idx + 1)];
}

async function buildTemplateColumnsSection(): Promise<Section> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_SAMPLE_PATH);
  const guide = wb.getWorksheet('Instructions');
  if (!guide) throw new Error('Instructions sheet not found in downloaded template sample');

  const rows: string[][] = [];
  guide.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header row
    const vals = (row.values as ExcelJS.CellValue[]).slice(1, 5).map((v) => String(v ?? ''));
    rows.push(vals);
  });

  const tableRows = rows.map(([field, description, requiredFor, notes]) => {
    const [fieldEn, fieldHi] = splitBilingual(field ?? '');
    const [descEn, descHi] = splitBilingual(description ?? '');
    const [notesEn, notesHi] = splitBilingual(notes ?? '');
    return `
      <tr>
        <td><strong>${fieldEn}</strong><br><span class="hi">${fieldHi}</span></td>
        <td>${descEn}<br><span class="hi">${descHi}</span></td>
        <td>${requiredFor ?? ''}</td>
        <td>${notesEn}${notesHi ? `<br><span class="hi">${notesHi}</span>` : ''}</td>
      </tr>`;
  }).join('\n');

  const customHtml = `
    <p class="en">Every column in the "Data Entry" sheet is explained on the workbook's own "Instructions" sheet — reproduced here in full, read directly from the real downloaded template so it can never drift out of date. The header row itself is locked (cannot be overtyped by mistake); hovering any header cell in Excel also shows this same guidance as a tooltip.</p>
    <p class="hi">"Data Entry" शीट के हर column को workbook की अपनी "Instructions" शीट पर समझाया गया है — यह यहां पूरी तरह से वास्तविक डाउनलोड किए गए टेम्पलेट से सीधे पढ़कर दिखाया गया है, ताकि यह कभी पुराना न पड़े। हेडर row खुद लॉक है (गलती से overtype नहीं किया जा सकता); Excel में किसी भी हेडर सेल पर mouse ले जाने पर भी यही जानकारी tooltip के रूप में दिखती है।</p>
    <table class="guide-table">
      <thead><tr><th>Field / फ़ील्ड</th><th>Description / विवरण</th><th>Required For / किसके लिए</th><th>Notes / नोट्स</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div class="callout">
      <p class="en"><strong>Adjacent Thanas format:</strong> spaces are allowed <em>inside</em> a single Thana name (e.g. "Sadar Bazar"). To list more than one adjacent Thana, separate each full name with a comma — a space after the comma is fine. Example: <code>Fatehabad, Hariparvat, Sadar Bazar</code> — not <code>Fatehabad Hariparvat Sadar Bazar</code> (no commas) and not one name per cell.</p>
      <p class="hi"><strong>Adjacent Thanas का format:</strong> एक ही Thana नाम के अंदर space होना ठीक है (जैसे "Sadar Bazar")। एक से अधिक adjacent Thana लिखने के लिए, हर पूरे नाम को अल्पविराम (,) से अलग करें — अल्पविराम के बाद space होना भी ठीक है। उदाहरण: <code>Fatehabad, Hariparvat, Sadar Bazar</code> — न कि <code>Fatehabad Hariparvat Sadar Bazar</code> (बिना अल्पविराम के) और न ही हर सेल में एक नाम।</p>
    </div>
  `;

  return {
    titleEn: '10. Understanding the Template — Columns & Validation',
    titleHi: '१०. टेम्पलेट को समझना — Columns और Validation',
    customHtml,
    allowPageBreak: true,
  };
}

function buildRevenueFormulasSection(): Section {
  const rows: [string, string, string][] = [
    ['MODEL_SHOP', 'license_fee_lf + mgr_amount + ₹3,00,000 (fixed On Premises Consumption Fee)', 'The ₹3,00,000 fee is a fixed department-set constant — it is not a field you fill in.'],
    ['COMPOSITE_SHOP', 'composite_lf_fl + composite_lf_beer + composite_mgr_fl + composite_mgr_beer', 'All four sub-component fields are required — the Foreign Liquor and Beer portions of both LF and MGR.'],
    ['PRV', 'license_fee_lf + mgr_amount', '—'],
    ['BHANG_SHOP', `license_fee_lf + (mgq_quantity × ₹${BHANG_MGQ_MULTIPLIER}/unit)`, 'mgq_quantity is a COUNT of units, not a rupee amount — the Excel and the system both multiply it by ₹20 automatically.'],
    ['COUNTRY_LIQUOR (standard)', 'basic_license_fee_blf + consideration_fee', 'Used when Has CL5CC? is false.'],
    ['COUNTRY_LIQUOR + CL5CC', 'basic_license_fee_blf + consideration_fee + special_beer_lf + special_beer_mgr', 'Only when Has CL5CC? is true — the two special_beer_* fields only unlock in Excel for this combination.'],
  ];
  const tableRows = rows.map(([type, formula, note]) => `
    <tr><td><strong>${type}</strong></td><td><code>${formula}</code></td><td>${note}</td></tr>
  `).join('\n');

  const customHtml = `
    <p class="en">Every shop's <strong>Total Revenue</strong> is calculated automatically from the financial fields you fill in — you never type a total yourself. All amounts are annual, whole-rupee figures (no paise, no lakhs/crores shorthand — write the full number, e.g. 10000000 for one crore).</p>
    <p class="hi">हर दुकान का <strong>कुल राजस्व (Total Revenue)</strong> आपके द्वारा भरे गए वित्तीय fields से अपने-आप गणना होता है — आपको खुद कोई total टाइप नहीं करना है। सभी राशियां वार्षिक, पूर्ण-रुपये की संख्याएं हैं (पैसे नहीं, लाख/करोड़ का shorthand नहीं — पूरी संख्या लिखें, जैसे एक करोड़ के लिए 10000000)।</p>
    <table class="guide-table">
      <thead><tr><th>Shop Type</th><th>Annual Revenue Formula</th><th>Note</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div class="callout">
      <p class="en"><strong>Double-checked automatically:</strong> your browser computes each row's total revenue when you upload, and the server independently recomputes it from the same raw fields. If the two ever disagree — even by ₹1 — that row is rejected with a reason, protecting against a formula mistake silently corrupting the data. You do not need to do anything extra for this; just fill in the correct financial fields for your shop's type and it happens automatically.</p>
      <p class="hi"><strong>अपने-आप दोबारा जांचा जाता है:</strong> अपलोड करते समय आपका ब्राउज़र हर row का total revenue निकालता है, और server उसी raw fields से इसे स्वतंत्र रूप से दोबारा निकालता है। यदि दोनों में कभी असहमति हो — यहां तक कि ₹1 की भी — तो उस row को कारण सहित अस्वीकार कर दिया जाता है, जिससे किसी formula गलती से डेटा चुपचाप खराब होने से बचाव होता है। इसके लिए आपको कुछ अतिरिक्त करने की आवश्यकता नहीं है — बस अपनी दुकान के प्रकार के लिए सही वित्तीय fields भरें, बाकी अपने-आप हो जाता है।</p>
    </div>
  `;

  return {
    titleEn: '11. Revenue & Fee Formulas',
    titleHi: '११. राजस्व और शुल्क सूत्र',
    customHtml,
    allowPageBreak: true,
  };
}

test('build bilingual DEO User Manual PDF from captured screenshots', async ({ page }) => {
  test.setTimeout(60000);

  const missingShots = SECTIONS.filter((s) => s.file && !fs.existsSync(path.join(SHOTS_DIR, s.file)));
  if (missingShots.length) {
    throw new Error(`Missing screenshots — run manual-screenshots.spec.ts first: ${missingShots.map((m) => m.file).join(', ')}`);
  }
  if (!fs.existsSync(TEMPLATE_SAMPLE_PATH)) {
    throw new Error(`Missing sample template — run manual-screenshots.spec.ts first (expected at ${TEMPLATE_SAMPLE_PATH})`);
  }

  // Splice the two dynamically-built sections (real template columns + revenue formulas) in
  // right after "9. Download the Template & Upload District File", matching their numbering.
  const uploadIdx = SECTIONS.findIndex((s) => s.file === '09-upload-empty.png');
  const allSections = [
    ...SECTIONS.slice(0, uploadIdx + 1),
    await buildTemplateColumnsSection(),
    buildRevenueFormulasSection(),
    ...SECTIONS.slice(uploadIdx + 1),
  ];

  function imgDataUri(file: string): string {
    const buf = fs.readFileSync(path.join(SHOTS_DIR, file));
    return `data:image/png;base64,${buf.toString('base64')}`;
  }

  const sectionsHtml = allSections.map((s) => `
    <section class="step ${s.allowPageBreak ? 'flow' : ''}">
      <h2>${s.titleEn}<br><span class="hi">${s.titleHi}</span></h2>
      ${s.customHtml ?? `
        <p class="en">${s.textEn}</p>
        <p class="hi">${s.textHi}</p>
        <img src="${imgDataUri(s.file!)}" alt="${s.titleEn}" />
      `}
    </section>
  `).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 18mm 14mm; }
  body { font-family: -apple-system, Arial, 'Noto Sans Devanagari', sans-serif; color: #0f172a; line-height: 1.5; }
  .hi { color: #475569; font-weight: 500; }
  h1 { font-size: 26px; margin-bottom: 4px; }
  .cover { text-align: center; padding-top: 30vh; page-break-after: always; }
  .cover h1 { font-size: 32px; }
  .cover .sub { font-size: 16px; color: #475569; margin-top: 6px; }
  .cover .sub-hi { font-size: 16px; color: #475569; }
  .cover .meta { margin-top: 60px; font-size: 12px; color: #94a3b8; }
  .step { page-break-inside: avoid; page-break-after: always; padding-top: 6px; }
  .step h2 { font-size: 18px; border-bottom: 2px solid #1d4ed8; padding-bottom: 6px; margin-bottom: 10px; }
  .step h2 .hi { display: block; font-size: 14px; font-weight: 500; margin-top: 2px; }
  .step p.en { font-size: 13px; margin-bottom: 6px; }
  .step p.hi { font-size: 12.5px; color: #475569; margin-bottom: 14px; }
  .step img { width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  .step.flow { page-break-inside: auto; }
  .guide-table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 14px; }
  .guide-table th, .guide-table td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
  .guide-table th { background: #1d4ed8; color: #fff; font-size: 10.5px; }
  .guide-table tr { page-break-inside: avoid; }
  .guide-table code { font-size: 10px; background: #f1f5f9; padding: 1px 3px; border-radius: 3px; }
  .callout { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; page-break-inside: avoid; }
  .callout p { margin: 0 0 6px; font-size: 12px; }
  .callout p:last-child { margin-bottom: 0; }
  .callout code { background: #fef3c7; padding: 1px 3px; border-radius: 3px; }
  .toc { page-break-after: always; }
  .toc h2 { font-size: 20px; margin-bottom: 14px; }
  .toc ol { padding-left: 20px; font-size: 13px; }
  .toc li { margin-bottom: 6px; }
  .toc .about { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px 14px; margin-bottom: 18px; }
  .toc .about p { margin: 0 0 6px; font-size: 12px; }
  .toc .about p:last-child { margin-bottom: 0; }
</style>
</head>
<body>

<div class="cover">
  <h1>UP Excise Spatial Revenue Optimizer</h1>
  <div class="sub">DEO User Manual — Step-by-Step Guide</div>
  <div class="sub-hi">DEO उपयोगकर्ता मैनुअल — चरण-दर-चरण मार्गदर्शिका</div>
  <div class="meta">Department of Excise, Government of Uttar Pradesh</div>
</div>

<div class="toc">
  <h2>Contents / विषय-सूची</h2>
  <div class="about">
    <p class="en"><strong>About this manual:</strong> Every page in the portal has a small "?" <strong>Help</strong> button (top of the page) with a brief, page-specific tip — that in-app help is intentionally short. This PDF is the detailed companion, with every screen, the full Excel template contents, and the revenue formulas explained in full. It can be downloaded any time from the Dashboard's Help button.</p>
    <p class="hi"><strong>इस मैनुअल के बारे में:</strong> पोर्टल के हर पेज पर एक छोटा "?" <strong>Help</strong> बटन (पेज के ऊपर) होता है जिसमें उस पेज से जुड़ी संक्षिप्त जानकारी होती है — यह in-app help जानबूझकर छोटी रखी गई है। यह PDF उसी की विस्तृत साथी है, जिसमें हर स्क्रीन, पूरा Excel template और राजस्व सूत्र विस्तार से समझाए गए हैं। इसे कभी भी Dashboard के Help बटन से डाउनलोड किया जा सकता है।</p>
  </div>
  <ol>
    ${allSections.map((s) => `<li>${s.titleEn} <span class="hi">— ${s.titleHi}</span></li>`).join('\n    ')}
  </ol>
</div>

${sectionsHtml}

</body>
</html>`;

  await page.setContent(html, { waitUntil: 'load' });
  fs.mkdirSync(MANUAL_DIR, { recursive: true });
  await page.pdf({
    path: OUT_PDF,
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' },
  });

  console.log(`Manual PDF written → ${OUT_PDF}`);
});
