export const dynamic = 'force-dynamic';

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function DeoDashboard() {
  // auth() parses JWT locally — no Clerk backend API call, works on CF edge
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect('/login');

  const meta = sessionClaims?.publicMetadata as { role?: string; districtName?: string } | undefined;
  const district = meta?.districtName ?? 'Unknown District';

  return (
    <div className="space-y-6">
      <div className="card bg-base-100 shadow p-6">
        <h2 className="text-xl font-bold mb-1">Welcome</h2>
        <p className="text-base-content/70">District: <strong>{district}</strong></p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <a href="/units" className="card bg-base-100 shadow hover:shadow-md transition-shadow p-6 flex flex-col items-center gap-3">
          {/* tabler:layout-grid */}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>
          <h3 className="font-semibold">Manage Circles / Sectors</h3>
          <p className="text-sm text-center text-base-content/70">Register circles and sectors, then download your district template</p>
        </a>
        <a href="/upload" className="card bg-base-100 shadow hover:shadow-md transition-shadow p-6 flex flex-col items-center gap-3">
          {/* tabler:upload */}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 9 12 4 17 9"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
          <h3 className="font-semibold">Upload District File</h3>
          <p className="text-sm text-center text-base-content/70">Upload the consolidated district Excel file</p>
        </a>
        <a href="/verify" className="card bg-base-100 shadow hover:shadow-md transition-shadow p-6 flex flex-col items-center gap-3">
          {/* tabler:clipboard-check */}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><path d="m9 14 2 2 4-4"/></svg>
          <h3 className="font-semibold">Verify &amp; Submit</h3>
          <p className="text-sm text-center text-base-content/70">Review staged data and submit to the system</p>
        </a>
      </div>
    </div>
  );
}
