'use client';

import { useEffect, useState, useCallback } from 'react';
import { stagingDb } from '@/lib/db';
import type { StagedRow } from '@/lib/types';

const COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 hours
const LS_KEY = 'last-sync-time';

function getSyncCooldownLabel(): string | null {
  try {
    const lastSync = localStorage.getItem(LS_KEY);
    if (!lastSync) return null;
    const diff = Date.now() - parseInt(lastSync, 10);
    if (diff >= COOLDOWN_MS) return null;
    const remainingMs = COOLDOWN_MS - diff;
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const mins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `Available in ${hours}h ${mins}m`;
    return `Available in ${mins}m`;
  } catch {
    return null;
  }
}

export default function HomeStats({ district }: { district: string }) {
  const [circles, setCircles] = useState<number | null>(null);
  const [circlesError, setCirclesError] = useState<string | null>(null);
  const [staged, setStaged] = useState<number | null>(null);
  const [uploaded, setUploaded] = useState<number | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [cooldownLabel, setCooldownLabel] = useState<string | null>(null);

  const refreshStats = useCallback(() => {
    stagingDb.count().then(setStaged).catch(() => setStaged(0));
    stagingDb.getByStatus('uploaded').then((rows) => setUploaded(rows.length)).catch(() => setUploaded(0));
  }, []);

  const refreshCooldown = useCallback(() => {
    setCooldownLabel(getSyncCooldownLabel());
  }, []);

  useEffect(() => {
    // Fetch circles/sectors from server
    fetch(`/api/districts/${encodeURIComponent(district)}/units`)
      .then(async (r) => {
        if (!r.ok) {
          const text = await r.text().catch(() => r.statusText);
          throw new Error(`${r.status}: ${text}`);
        }
        return r.json();
      })
      .then((units: unknown) => {
        if (Array.isArray(units)) setCircles(units.length);
        else setCircles(0);
        setCirclesError(null);
      })
      .catch((e: Error) => {
        setCircles(0);
        setCirclesError(e.message);
      });

    refreshStats();
    refreshCooldown();

    // Poll cooldown every 60s so the label stays live without a refresh
    const timer = setInterval(refreshCooldown, 60_000);
    return () => clearInterval(timer);
  }, [district, refreshStats, refreshCooldown]);

  async function handleSync() {
    // Re-check cooldown right before sync (guards race conditions)
    const label = getSyncCooldownLabel();
    if (label) { setCooldownLabel(label); return; }

    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch(`/api/districts/${encodeURIComponent(district)}/shops`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const body = await res.json() as { rows: any[] };
      const rows: StagedRow[] = (body.rows ?? []).map((r: any) => ({
        ...r,
        status: 'uploaded' as const,
        uploadError: undefined,
      }));
      await stagingDb.putRows(rows);
      localStorage.setItem(LS_KEY, Date.now().toString());
      refreshCooldown();
      refreshStats();
    } catch (err: any) {
      setSyncError(err.message ?? 'Unknown error');
    } finally {
      setSyncing(false);
    }
  }

  const isBusy = syncing;

  return (
    <div className={`space-y-4 ${isBusy ? 'pointer-events-none opacity-50' : ''}`}>
      <div className="grid grid-cols-3 gap-4">
        <div className="stat bg-base-100 rounded-2xl shadow">
          <div className="stat-title">Circles / Sectors</div>
          <div className="stat-value text-primary">{circles ?? '—'}</div>
          <div className="stat-desc">
            {circlesError
              ? <span className="text-error text-xs">{circlesError}</span>
              : 'registered'}
          </div>
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
          <p className="text-xs text-base-content/80">Pull previously uploaded shops from the server to your local device.</p>
          {syncError && <p className="text-xs text-error mt-1">{syncError}</p>}
        </div>
        <div className="flex items-center gap-2">
          {cooldownLabel && (
            <button
              className="btn btn-xs btn-ghost text-base-content/60 hover:text-error"
              title="Clear sync cooldown"
              onClick={() => {
                try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
                setCooldownLabel(null);
              }}
            >
              Reset
            </button>
          )}
          <button
            onClick={handleSync}
            disabled={isBusy || !!cooldownLabel}
            className="btn btn-sm btn-outline"
          >
            {syncing ? <><span className="loading loading-spinner loading-xs" /> Syncing…</> : cooldownLabel ?? 'Sync from Server'}
          </button>
        </div>
      </div>
    </div>
  );
}
