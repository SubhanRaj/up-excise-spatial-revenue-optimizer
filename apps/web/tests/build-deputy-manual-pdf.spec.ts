import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Not a UI test — turns the screenshots captured by deputy-screenshots.spec.ts into the
 * bilingual (English/Hindi) Deputy Excise Commissioner User Manual PDF via Chromium's
 * print-to-PDF. Run deputy-screenshots.spec.ts first so the PNGs exist.
 */

const MANUAL_DIR = path.join(__dirname, '..', '..', '..', 'docs', 'manual');
const SHOTS_DIR = path.join(MANUAL_DIR, 'deputy-screenshots');
const OUT_PDF = path.join(MANUAL_DIR, 'Deputy-User-Manual.pdf');

interface Section {
  file?: string;
  titleEn: string;
  titleHi: string;
  textEn?: string;
  textHi?: string;
  customHtml?: string;
}

const SECTIONS: Section[] = [
  {
    titleEn: '1. What This Portal Is For',
    titleHi: '१. यह पोर्टल किसलिए है',
    customHtml: `
      <p class="en">As Deputy Excise Commissioner you supervise every district in your division. This portal shows the figures your District Excise Officers have entered — the same district data headquarters sees, limited to your division. You cannot change any figure. For each district you record a short sign-off: <strong>"Looks correct"</strong> or <strong>"Flag an issue"</strong>. Each sign-off is recorded at headquarters with your name and the time. Once every district in your division is verified you lock the division; once all 18 divisions are locked the state's data collection is closed.</p>
      <p class="hi">उप आबकारी आयुक्त के रूप में आप अपने मंडल के हर जिले की निगरानी करते हैं। यह पोर्टल आपके जिला आबकारी अधिकारियों द्वारा दर्ज किए गए आंकड़े दिखाता है — वही जिला डेटा जो मुख्यालय देखता है, केवल आपके मंडल तक सीमित। आप कोई आंकड़ा नहीं बदल सकते। हर जिले के लिए आप एक संक्षिप्त हस्ताक्षर दर्ज करते हैं: <strong>"Looks correct"</strong> या <strong>"Flag an issue"</strong>। हर हस्ताक्षर आपके नाम और समय के साथ मुख्यालय में दर्ज होता है। जब आपके मंडल का हर जिला verify हो जाए, आप मंडल lock करते हैं; जब सभी 18 मंडल lock हो जाएं, राज्य का डेटा संग्रह बंद हो जाता है।</p>
    `,
  },
  {
    titleEn: '2. Signing In',
    titleHi: '२. साइन इन करें',
    customHtml: `
      <p class="en">Open the portal in your browser. The sign-in box has three tabs: "DEO", "Deputy", and "Admin". Tap <strong>"Deputy"</strong>, enter your 10-digit division mobile number, and tap "Sign in". Use the Deputy tab — your number will not work under the DEO tab, and the error looks the same either way, so check the tab first. There is no password.</p>
      <p class="hi">अपने ब्राउज़र में पोर्टल खोलें। साइन-इन बॉक्स में तीन टैब हैं: "DEO", "Deputy", और "Admin"। <strong>"Deputy"</strong> पर टैप करें, अपना 10-अंकीय मंडल मोबाइल नंबर दर्ज करें, और "Sign in" पर टैप करें। Deputy टैब का उपयोग करें — DEO टैब के नीचे आपका नंबर काम नहीं करेगा, और दोनों स्थितियों में त्रुटि एक जैसी दिखती है, इसलिए पहले टैब जांचें। कोई पासवर्ड नहीं है।</p>
    `,
  },
  {
    file: '00-deputy-acknowledgment.png',
    titleEn: '3. The Review Reminder',
    titleHi: '३. समीक्षा अनुस्मारक',
    textEn: 'Each time you open the portal, a short reminder appears explaining your part in this round: the figures are for FY 2025-26, entered and verified by your DEOs; you check each district and record "Looks correct" or "Flag an issue"; and once every district is done you lock the division. Read it and tap "I understand". Your acknowledgement is recorded at headquarters with your name and the time.',
    textHi: 'हर बार पोर्टल खोलने पर एक संक्षिप्त अनुस्मारक दिखता है जो इस दौर में आपकी भूमिका बताता है: आंकड़े FY 2025-26 के हैं, आपके DEO द्वारा दर्ज और verify किए गए; आप हर जिला जांचकर "Looks correct" या "Flag an issue" दर्ज करते हैं; और हर जिला पूरा होने पर आप मंडल lock करते हैं। इसे पढ़ें और "I understand" पर टैप करें। आपकी स्वीकृति आपके नाम और समय के साथ मुख्यालय में दर्ज होती है।',
  },
  {
    file: '01-deputy-dashboard.png',
    titleEn: '4. Division Dashboard',
    titleHi: '४. मंडल डैशबोर्ड',
    textEn: 'After signing in you land on your division dashboard. The stat cards show the division totals — number of districts, how many have been submitted, total vends uploaded, and total annual revenue. The map colours each district by status: grey is pending, amber is in progress, green is submitted, blue is verified. Click any district on the map, or any row in the "Districts" table below it, to open that district\'s figures.',
    textHi: 'साइन इन करने के बाद आप अपने मंडल डैशबोर्ड पर पहुँचते हैं। स्टेट कार्ड मंडल के कुल आंकड़े दिखाते हैं — जिलों की संख्या, कितने सबमिट हुए, कुल अपलोड किए गए vends, और कुल वार्षिक राजस्व। नक्शा हर जिले को स्थिति के अनुसार रंग देता है: ग्रे — pending, अम्बर — in progress, हरा — submitted, नीला — verified। नक्शे पर किसी भी जिले पर, या नीचे "Districts" तालिका की किसी भी पंक्ति पर क्लिक करके उस जिले के आंकड़े खोलें।',
  },
  {
    file: '02-deputy-districts-list.png',
    titleEn: '5. Districts List',
    titleHi: '५. जिलों की सूची',
    textEn: 'The Districts tab in the navbar opens the same list as a full table, with a search box (match a district or DEO name), a status filter, and sortable columns. The "Review" column shows whether you have already recorded a sign-off for that district — "Looks correct", "Flagged", or blank if not yet reviewed. Click a row to open the district.',
    textHi: 'navbar में Districts टैब वही सूची एक पूर्ण तालिका के रूप में खोलता है, जिसमें एक search box (जिला या DEO नाम मिलाएं), एक status filter, और sortable columns हैं। "Review" column दिखाता है कि आपने उस जिले के लिए पहले से कोई हस्ताक्षर दर्ज किया है या नहीं — "Looks correct", "Flagged", या खाली अगर अभी समीक्षा नहीं हुई। जिला खोलने के लिए पंक्ति पर क्लिक करें।',
  },
  {
    file: '03-deputy-district-figures.png',
    titleEn: '6. A District\'s Figures',
    titleHi: '६. किसी जिले के आंकड़े',
    textEn: 'This is every shop the DEO uploaded for the district, the same view headquarters uses. The stat cards at the top show status, shop count, circle/sector count, and total revenue. Below them, use the shop-type breakdown bar, the circle/sector breakdown table, and the filter / sort / group-by-type / search controls on the shop table to check the figures. A ⚠ next to a revenue amount, or a "Possible Duplicate Thana Names" card, is worth opening. Everything on this screen is read-only.',
    textHi: 'यह वह हर दुकान है जो DEO ने जिले के लिए अपलोड की, वही दृश्य जो मुख्यालय उपयोग करता है। ऊपर के स्टेट कार्ड स्थिति, दुकान संख्या, circle/sector संख्या, और कुल राजस्व दिखाते हैं। उनके नीचे, आंकड़े जांचने के लिए shop-type breakdown बार, circle/sector breakdown तालिका, और शॉप तालिका पर filter / sort / group-by-type / search नियंत्रण उपयोग करें। किसी राजस्व राशि के पास ⚠, या "Possible Duplicate Thana Names" कार्ड, खोलने योग्य है। इस स्क्रीन पर सब कुछ केवल-पढ़ने के लिए है।',
  },
  {
    file: '04-deputy-review-dialog.png',
    titleEn: '7. Recording Your Review',
    titleHi: '७. अपनी समीक्षा दर्ज करना',
    textEn: 'How the verification builds up: the DEO enters their district\'s figures, submits them, then — straight away, with no state-wide round to wait for — confirms and verifies their own district, so it reaches you as "Verified". You then check it. At the bottom of the district page is the "Your review" panel. Tap "Looks correct" once the figures are right — a dialog opens for an optional note, then confirm. To raise a problem instead, tap "Flag an issue"; a note describing it is required, and headquarters can then open a correction so the DEO fixes the shop(s) and verifies again. Either way, one line is recorded at headquarters with your name, the district, your verdict, and your note. No figure changes.',
    textHi: 'सत्यापन इस तरह बनता है: DEO अपने जिले के आंकड़े दर्ज करता है, सबमिट करता है, फिर तुरंत — किसी राज्य-स्तरीय दौर की प्रतीक्षा के बिना — अपने जिले को confirm और verify करता है, तो जिला आप तक "Verified" के रूप में पहुँचता है। फिर आप उसे जांचते हैं। जिले के पेज के नीचे "Your review" पैनल है। आंकड़े सही होने पर "Looks correct" पर टैप करें — एक वैकल्पिक नोट के लिए संवाद खुलता है, फिर पुष्टि करें। समस्या उठाने के लिए "Flag an issue" पर टैप करें; उसका वर्णन करने वाला नोट अनिवार्य है, और फिर मुख्यालय सुधार खोल सकता है ताकि DEO दुकानें ठीक करके दोबारा verify करे। दोनों स्थितियों में, आपके नाम, जिले, निर्णय और नोट के साथ मुख्यालय में एक पंक्ति दर्ज होती है। कोई आंकड़ा नहीं बदलता।',
  },
  {
    file: '05-deputy-review-recorded.png',
    titleEn: '8. After a Review Is Recorded',
    titleHi: '८. समीक्षा दर्ज होने के बाद',
    textEn: 'Once recorded, the panel shows your last verdict, the date and time, and your note. You can record a new sign-off on the same district any time — the most recent one is what shows. The same verdict appears in the "Review" column on the dashboard and the Districts list.',
    textHi: 'दर्ज होने के बाद, पैनल आपका अंतिम निर्णय, दिनांक और समय, और आपका नोट दिखाता है। आप उसी जिले पर कभी भी नया हस्ताक्षर दर्ज कर सकते हैं — सबसे हालिया वाला दिखता है। वही निर्णय डैशबोर्ड और Districts सूची के "Review" column में दिखता है।',
  },
  {
    titleEn: '9. Locking Your Division',
    titleHi: '९. अपना मंडल लॉक करना',
    customHtml: `
      <p class="en">The dashboard has a "Verify &amp; lock this division" card. It stays disabled until every district in your division is verified by its DEO and you have recorded "Looks correct" on each one — the card lists which districts still need either. Once all are done, tap <strong>"Verify &amp; Lock Division"</strong>, type your full name (this is your sign-off, the same way a DEO signs off their district), and confirm. After locking, your DEOs can no longer request a correction on their own; only state Excise headquarters can reopen the division. When all 18 divisions are locked, the state's data collection is closed.</p>
      <p class="hi">डैशबोर्ड पर एक "Verify &amp; lock this division" कार्ड है। यह तब तक निष्क्रिय रहता है जब तक आपके मंडल का हर जिला उसके DEO द्वारा verify न हो जाए और आपने हर एक पर "Looks correct" दर्ज न कर दिया हो — कार्ड बताता है कि किन जिलों में अभी कौन सा काम बाकी है। सब पूरा होने पर, <strong>"Verify &amp; Lock Division"</strong> पर टैप करें, अपना पूरा नाम टाइप करें (यह आपका हस्ताक्षर है, जैसे DEO अपने जिले पर हस्ताक्षर करता है), और पुष्टि करें। लॉक करने के बाद, आपके DEO खुद सुधार का अनुरोध नहीं कर सकते; केवल राज्य आबकारी मुख्यालय ही मंडल दोबारा खोल सकता है। जब सभी 18 मंडल लॉक हो जाते हैं, राज्य का डेटा संग्रह बंद हो जाता है।</p>
    `,
  },
  {
    titleEn: '10. What You Cannot Do',
    titleHi: '१०. आप क्या नहीं कर सकते',
    customHtml: `
      <p class="en">This portal shows only your own division — you cannot open another division's districts or figures. You cannot edit a shop, unlock a district, delete data, or download templates; those are the DEO's and headquarters' actions. If a district's figures are wrong, use "Flag an issue" with a clear note — headquarters and the DEO act on it from there.</p>
      <p class="hi">यह पोर्टल केवल आपका अपना मंडल दिखाता है — आप किसी अन्य मंडल के जिले या आंकड़े नहीं खोल सकते। आप किसी दुकान को edit नहीं कर सकते, जिला unlock नहीं कर सकते, डेटा delete नहीं कर सकते, या टेम्पलेट download नहीं कर सकते; वे DEO और मुख्यालय के कार्य हैं। यदि किसी जिले के आंकड़े गलत हैं, तो एक स्पष्ट नोट के साथ "Flag an issue" का उपयोग करें — मुख्यालय और DEO उस पर आगे कार्रवाई करते हैं।</p>
    `,
  },
];

test('build bilingual Deputy User Manual PDF from captured screenshots', async ({ page }) => {
  test.setTimeout(60000);

  const missing = SECTIONS.filter((s) => s.file && !fs.existsSync(path.join(SHOTS_DIR, s.file)));
  if (missing.length) {
    throw new Error(`Missing screenshots — run deputy-screenshots.spec.ts first: ${missing.map((m) => m.file).join(', ')}`);
  }

  const imgDataUri = (file: string) =>
    `data:image/png;base64,${fs.readFileSync(path.join(SHOTS_DIR, file)).toString('base64')}`;

  const sectionsHtml = SECTIONS.map((s) => `
    <section class="step">
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
  <div class="sub">Deputy Excise Commissioner — User Manual</div>
  <div class="sub-hi">उप आबकारी आयुक्त — उपयोगकर्ता मैनुअल</div>
  <div class="meta">Department of Excise, Government of Uttar Pradesh</div>
</div>

<div class="toc">
  <h2>Contents / विषय-सूची</h2>
  <div class="about">
    <p class="en"><strong>About this manual:</strong> Every page in the portal has a small "?" Help button with a brief, page-specific tip. This PDF is the detailed companion. It can be downloaded any time from the dashboard.</p>
    <p class="hi"><strong>इस मैनुअल के बारे में:</strong> पोर्टल के हर पेज पर एक छोटा "?" Help बटन होता है जिसमें उस पेज से जुड़ी संक्षिप्त जानकारी होती है। यह PDF उसी की विस्तृत साथी है। इसे कभी भी डैशबोर्ड से डाउनलोड किया जा सकता है।</p>
  </div>
  <ol>
    ${SECTIONS.map((s) => `<li>${s.titleEn} <span class="hi">— ${s.titleHi}</span></li>`).join('\n    ')}
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

  console.log(`Deputy manual PDF written → ${OUT_PDF}`);
});
