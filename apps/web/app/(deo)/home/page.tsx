export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import HelpPanel from '@/app/_components/HelpPanel';
import HomeStats from './HomeStats';

export default async function DeoDashboard() {
  const session = await requireAuth('deo');
  const district = session.districtName ?? 'Unknown District';

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-base-content/60 mt-1">
            District: <span className="font-semibold text-base-content">{district}</span>
          </p>
        </div>
        <div className="badge badge-primary badge-outline p-3 text-sm font-medium">Phase 1 — Data Collection</div>
      </div>

      <HomeStats district={district} />

      <div className="grid md:grid-cols-3 gap-5">
        <Link href="/units" className="card bg-base-100 shadow hover:shadow-lg transition-all hover:-translate-y-0.5 p-6 flex flex-col gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>
          </div>
          <div>
            <h3 className="font-semibold text-base">Circles &amp; Sectors</h3>
            <p className="text-sm text-base-content/60 mt-1">Register inspection circles and sectors, then download the district template</p>
          </div>
          <div className="mt-auto"><span className="btn btn-primary btn-sm w-full">Manage</span></div>
        </Link>

        <Link href="/upload" className="card bg-base-100 shadow hover:shadow-lg transition-all hover:-translate-y-0.5 p-6 flex flex-col gap-4">
          <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 9 12 4 17 9"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
          </div>
          <div>
            <h3 className="font-semibold text-base">Upload District File</h3>
            <p className="text-sm text-base-content/60 mt-1">Parse the consolidated district Excel file and stage all shop records</p>
          </div>
          <div className="mt-auto"><span className="btn btn-secondary btn-sm w-full">Upload</span></div>
        </Link>

        <Link href="/verify" className="card bg-base-100 shadow hover:shadow-lg transition-all hover:-translate-y-0.5 p-6 flex flex-col gap-4">
          <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><path d="m9 14 2 2 4-4"/></svg>
          </div>
          <div>
            <h3 className="font-semibold text-base">Verify &amp; Submit</h3>
            <p className="text-sm text-base-content/60 mt-1">Review staged records, fix validation errors, then submit to headquarters</p>
          </div>
          <div className="mt-auto"><span className="btn btn-success btn-sm w-full">Review</span></div>
        </Link>
      </div>

      <HelpPanel pageKey="home" title="Getting started — Phase 1 Data Collection Workflow">
        <p>Your task is to submit shop data for <strong>{district}</strong> to headquarters. The workflow has three steps:</p>
        <ol className="list-decimal list-inside space-y-1 mt-1">
          <li><strong>Circles &amp; Sectors</strong> — Register all inspection circles and sectors, then download the district Excel template.</li>
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
