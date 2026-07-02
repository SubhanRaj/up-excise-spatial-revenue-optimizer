'use client';

import { useEffect, useState } from 'react';
import { stagingDb } from '@/lib/db';
import type { StagedRow } from '@/lib/types';

export default function HomeStats({ district }: { district: string }) {
  const [circles, setCircles] = useState<number | null>(null);
  const [staged, setStaged] = useState<number | null>(null);
  const [uploaded, setUploaded] = useState<number | null>(null);
  
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [timeToNextSync, setTimeToNextSync] = useState<string | null>(null);

  const COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 hours

  function refreshStats() {
    stagingDb.count().then(setStaged).catch(() => setStaged(0));
    stagingDb.getByStatus('uploaded').then((rows) => setUploaded(rows.length)).catch(() => setUploaded(0));
  }

  useEffect(() => {
    fetch(`/api/districts/${encodeURIComponent(district)}/units`)
      .then((r) => r.json())
      .then((units: unknown[]) => setCircles(units.length))
      .catch(() => setCircles(0));

    refreshStats();
    
    // Check sync cooldown
    const lastSync = localStorage.getItem('last-sync-time');
    if (lastSync) {
      const diff = Date.now() - parseInt(lastSync, 10);
      if (diff < COOLDOWN_MS) {
        const remainingHours = Math.ceil((COOLDOWN_MS - diff) / (1000 * 60 * 60));
        setTimeToNextSync(`Available in ${remainingHours} hours`);
      }
    }
  }, [district]);

  async function handleSync() {
    if (timeToNextSync) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch(`/api/districts/${encodeURIComponent(district)}/shops`);
      if (!res.ok) throw new Error('Failed to fetch from server');
      const { rows } = await res.json() as { rows: any[] };
      
      const toUpsert: StagedRow[] = rows.map(r => ({
        ...r,
        status: 'uploaded',
        uploadError: undefined
      }));
      
      await stagingDb.putRows(toUpsert);
      localStorage.setItem('last-sync-time', Date.now().toString());
      setTimeToNextSync(`Available in 12 hours`);
      refreshStats();
    } catch (err: any) {
      setSyncError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
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
      
      <div className="flex items-center justify-between bg-base-100 p-4 rounded-xl shadow-sm border border-base-200">
        <div>
          <h3 className="font-semibold text-sm">Sync Device Data</h3>
          <p className="text-xs text-base-content/60">Pull previously uploaded shops from the server to your local device.</p>
          {syncError && <p className="text-xs text-error mt-1">{syncError}</p>}
        </div>
        <button 
          onClick={handleSync}
          disabled={syncing || !!timeToNextSync}
          className="btn btn-sm btn-outline"
        >
          {syncing ? 'Syncing...' : timeToNextSync ? timeToNextSync : 'Sync from Server'}
        </button>
      </div>
    </div>
  );
}
