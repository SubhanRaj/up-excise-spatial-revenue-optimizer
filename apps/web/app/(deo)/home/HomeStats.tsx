'use client';

import { useEffect, useState } from 'react';
import { stagingDb } from '@/lib/db';

export default function HomeStats({ district }: { district: string }) {
  const [circles, setCircles] = useState<number | null>(null);
  const [staged, setStaged] = useState<number | null>(null);
  const [uploaded, setUploaded] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/districts/${encodeURIComponent(district)}/units`)
      .then((r) => r.json())
      .then((units: unknown[]) => setCircles(units.length))
      .catch(() => setCircles(0));

    stagingDb.count().then(setStaged).catch(() => setStaged(0));
    stagingDb.getByStatus('uploaded').then((rows) => setUploaded(rows.length)).catch(() => setUploaded(0));
  }, [district]);

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="stat bg-base-100 rounded-2xl shadow">
        <div className="stat-title">Circles / Sectors</div>
        <div className="stat-value text-primary">{circles ?? '—'}</div>
        <div className="stat-desc">registered</div>
      </div>
      <div className="stat bg-base-100 rounded-2xl shadow">
        <div className="stat-title">Shops Staged</div>
        <div className="stat-value text-secondary">{staged ?? '—'}</div>
        <div className="stat-desc">in IndexedDB</div>
      </div>
      <div className="stat bg-base-100 rounded-2xl shadow">
        <div className="stat-title">Shops Uploaded</div>
        <div className="stat-value text-success">{uploaded ?? '—'}</div>
        <div className="stat-desc">to server</div>
      </div>
    </div>
  );
}
