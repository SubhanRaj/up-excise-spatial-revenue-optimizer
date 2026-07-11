export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import HelpPanel from '@/app/_components/HelpPanel';
import HomeStats from './HomeStats';

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { districtCirclesSectors } from '@excise/schema';
import { eq } from 'drizzle-orm';

export default async function DeoDashboard() {
  const session = await requireAuth('deo');
  const district = session.districtName ?? 'Unknown District';
  const { env } = await getCloudflareContext({ async: true }) as { env: CloudflareEnv };
  const db = drizzle(env.DB);
  const unitsResult = await db.select({ id: districtCirclesSectors.id }).from(districtCirclesSectors).where(eq(districtCirclesSectors.districtName, district)).limit(1).all();
  const hasUnits = unitsResult.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome back / नमस्ते</h1>
          <p className="text-base-content/80 mt-1">
            District: <span className="font-semibold text-base-content">{district}</span>
          </p>
        </div>
        <div className="badge badge-primary badge-outline p-3 text-sm font-medium">Phase 1 — Data Collection</div>
      </div>

      <HomeStats district={district} />

      {!hasUnits ? (
        <div className="card bg-base-100 shadow-lg border-2 border-primary/30 p-8 max-w-xl mx-auto items-center text-center">
          <div className="w-14 h-14 rounded-full bg-primary text-primary-content flex items-center justify-center mb-4 text-2xl font-bold">
            1
          </div>
          <h2 className="font-bold text-lg">Step 1 of 3 — Create Circles &amp; Sectors</h2>
          <p className="text-sm text-base-content/70 mb-1">चरण 1 — सर्कल और सेक्टर बनाएं</p>
          <p className="text-sm text-base-content/90 mt-2">
            Create &amp; lock your circles and sectors to proceed.
          </p>
          <Link href="/units" className="btn btn-primary btn-lg mt-6 w-full sm:w-auto">Create Circles &amp; Sectors →</Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          <Link href="/upload" className="card bg-base-100 shadow hover:shadow-lg transition-all hover:-translate-y-0.5 p-6 flex flex-col gap-4">
            <div className="w-12 h-12 rounded-full bg-secondary text-secondary-content flex items-center justify-center text-xl font-bold">
              2
            </div>
            <div>
              <h3 className="font-semibold text-base">Step 2 — Upload District File</h3>
              <p className="text-xs text-base-content/60">चरण 2 — जिला फ़ाइल अपलोड करें</p>
              <p className="text-sm text-base-content/80 mt-1">Download the template, get it filled, then upload the completed Excel file here</p>
            </div>
            <div className="mt-auto"><span className="btn btn-secondary btn-sm w-full">Upload</span></div>
          </Link>

          <Link href="/verify" className="card bg-base-100 shadow hover:shadow-lg transition-all hover:-translate-y-0.5 p-6 flex flex-col gap-4">
            <div className="w-12 h-12 rounded-full bg-success text-success-content flex items-center justify-center text-xl font-bold">
              3
            </div>
            <div>
              <h3 className="font-semibold text-base">Step 3 — Verify &amp; Submit</h3>
              <p className="text-xs text-base-content/60">चरण 3 — जांचें और सबमिट करें</p>
              <p className="text-sm text-base-content/80 mt-1">Review uploaded records, fix errors, then submit to headquarters</p>
            </div>
            <div className="mt-auto"><span className="btn btn-success btn-sm w-full">Review</span></div>
          </Link>
        </div>
      )}

      <HelpPanel
        pageKey="home"
        title="Getting started — Phase 1 Data Collection Workflow"
        titleHi="शुरुआत करें — Phase 1 डेटा संग्रहण वर्कफ़्लो"
        childrenHi={<>
          <p>आपका कार्य <strong>{district}</strong> के लिए shop डेटा को headquarters में सबमिट करना है। इस वर्कफ़्लो में तीन चरण हैं, जिन्हें सख्ती से क्रम में पूरा करना है:</p>
          <ol className="list-decimal list-inside space-y-1 mt-1">
            <li><strong>Circles &amp; Sectors</strong> — अपने सभी inspection circles और sectors को एक ही बार में रजिस्टर करें। सबमिट करने के बाद यह लॉक हो जाता है, इसलिए नाम पहले ध्यान से जांच लें।</li>
            <li><strong>Upload District File</strong> — Inspectors द्वारा भरे गए सेक्शन इकट्ठा करें, उन्हें एक Excel फ़ाइल में मिलाएं, और यहां अपलोड करें। डेटा अपने-आप आपके डिवाइस पर सेव हो जाता है।</li>
            <li><strong>Verify &amp; Submit</strong> — सभी rows की समीक्षा करें, कोई भी अमान्य adjacent Thana entry (लाल रंग में दिखाई गई) हटाएं, फिर headquarters को सबमिट करें।</li>
          </ol>
          <p className="mt-1">सारा डेटा पहले offline सेव होता है। आप बिना इंटरनेट के भी काम कर सकते हैं — connectivity वापस आते ही records अपने-आप अपलोड हो जाते हैं।</p>
        </>}
      >
        <p>Your task is to submit shop data for <strong>{district}</strong> to headquarters. The workflow has three steps, done strictly in order:</p>
        <ol className="list-decimal list-inside space-y-1 mt-1">
          <li><strong>Circles &amp; Sectors</strong> — Register all inspection circles and sectors in one go. This is locked once submitted, so double-check names first.</li>
          <li><strong>Upload District File</strong> — Collect filled Inspector sections, consolidate into one Excel file, and upload here. Data is saved to your device automatically.</li>
          <li><strong>Verify &amp; Submit</strong> — Review all rows, remove any invalid adjacent Thana entries (shown in red), then submit to headquarters.</li>
        </ol>
        <p className="mt-1">All data is saved offline first. You can work without internet — records upload automatically when connectivity is restored.</p>
      </HelpPanel>

      <div className="alert alert-info">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>All data is saved offline first. You can work without internet — records upload automatically when connectivity is restored.</span>
      </div>
    </div>
  );
}
