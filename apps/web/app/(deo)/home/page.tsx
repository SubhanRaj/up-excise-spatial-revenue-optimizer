export const dynamic = 'force-dynamic';

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function DeoDashboard() {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect('/login');

  const meta = sessionClaims?.publicMetadata as { role?: string; districtName?: string } | undefined;
  const district = meta?.districtName ?? 'Unknown District';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-base-content/60 mt-1">
            District: <span className="font-semibold text-base-content">{district}</span>
          </p>
        </div>
        <div className="badge badge-primary badge-outline p-3 text-sm font-medium">Phase 1 — Data Collection</div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat bg-base-100 rounded-2xl shadow">
          <div className="stat-title">Circles / Sectors</div>
          <div className="stat-value text-primary" id="stat-circles">—</div>
          <div className="stat-desc">registered</div>
        </div>
        <div className="stat bg-base-100 rounded-2xl shadow">
          <div className="stat-title">Shops Staged</div>
          <div className="stat-value text-secondary" id="stat-staged">—</div>
          <div className="stat-desc">in IndexedDB</div>
        </div>
        <div className="stat bg-base-100 rounded-2xl shadow">
          <div className="stat-title">Shops Uploaded</div>
          <div className="stat-value text-success" id="stat-uploaded">—</div>
          <div className="stat-desc">to server</div>
        </div>
      </div>

      {/* Action cards */}
      <div className="grid md:grid-cols-3 gap-5">
        <a href="/units" className="card bg-base-100 shadow hover:shadow-lg transition-all hover:-translate-y-0.5 p-6 flex flex-col gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            {/* tabler:layout-grid */}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>
          </div>
          <div>
            <h3 className="font-semibold text-base">Circles &amp; Sectors</h3>
            <p className="text-sm text-base-content/60 mt-1">Register inspection circles and sectors, then download the district template</p>
          </div>
          <div className="mt-auto">
            <span className="btn btn-primary btn-sm w-full">Manage</span>
          </div>
        </a>

        <a href="/upload" className="card bg-base-100 shadow hover:shadow-lg transition-all hover:-translate-y-0.5 p-6 flex flex-col gap-4">
          <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center">
            {/* tabler:upload */}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 9 12 4 17 9"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
          </div>
          <div>
            <h3 className="font-semibold text-base">Upload District File</h3>
            <p className="text-sm text-base-content/60 mt-1">Parse the consolidated district Excel file and stage all shop records</p>
          </div>
          <div className="mt-auto">
            <span className="btn btn-secondary btn-sm w-full">Upload</span>
          </div>
        </a>

        <a href="/verify" className="card bg-base-100 shadow hover:shadow-lg transition-all hover:-translate-y-0.5 p-6 flex flex-col gap-4">
          <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
            {/* tabler:clipboard-check */}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><path d="m9 14 2 2 4-4"/></svg>
          </div>
          <div>
            <h3 className="font-semibold text-base">Verify &amp; Submit</h3>
            <p className="text-sm text-base-content/60 mt-1">Review staged records, fix validation errors, then submit to headquarters</p>
          </div>
          <div className="mt-auto">
            <span className="btn btn-success btn-sm w-full">Review</span>
          </div>
        </a>
      </div>

      {/* Info banner */}
      <div className="alert alert-info">
        {/* tabler:info-circle */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>All data is saved offline first. You can work without internet — records upload automatically when connectivity is restored.</span>
      </div>
    </div>
  );
}
