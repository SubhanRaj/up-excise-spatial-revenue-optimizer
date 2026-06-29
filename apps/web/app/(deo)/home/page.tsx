export const dynamic = 'force-dynamic';

import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function DeoDashboard() {
  const user = await currentUser();
  if (!user) redirect('/login');

  const meta = user.publicMetadata as { role?: string; districtName?: string };
  const district = meta.districtName ?? 'Unknown District';

  return (
    <div className="space-y-6">
      <div className="card bg-base-100 shadow p-6">
        <h2 className="text-xl font-bold mb-1">Welcome, {user.firstName ?? user.emailAddresses[0]?.emailAddress}</h2>
        <p className="text-base-content/70">District: <strong>{district}</strong></p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <a href="/units" className="card bg-base-100 shadow hover:shadow-md transition-shadow p-6 flex flex-col items-center gap-3">
          <span className="text-3xl">📋</span>
          <h3 className="font-semibold">Manage Circles / Sectors</h3>
          <p className="text-sm text-center text-base-content/70">Register circles and sectors, then download your district template</p>
        </a>
        <a href="/upload" className="card bg-base-100 shadow hover:shadow-md transition-shadow p-6 flex flex-col items-center gap-3">
          <span className="text-3xl">⬆️</span>
          <h3 className="font-semibold">Upload District File</h3>
          <p className="text-sm text-center text-base-content/70">Upload the consolidated district Excel file</p>
        </a>
        <a href="/verify" className="card bg-base-100 shadow hover:shadow-md transition-shadow p-6 flex flex-col items-center gap-3">
          <span className="text-3xl">✅</span>
          <h3 className="font-semibold">Verify &amp; Submit</h3>
          <p className="text-sm text-center text-base-content/70">Review staged data and submit to the system</p>
        </a>
      </div>
    </div>
  );
}
