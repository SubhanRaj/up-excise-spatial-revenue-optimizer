'use client';

import { useEffect, useState } from 'react';
import { adminExportCache } from '@/lib/db';
import type { ExportShopRow, StateExportUnit } from '@/lib/excel';

export interface AdminExportData { rows: ExportShopRow[]; units: StateExportUnit[] }

// Reuses the same excise-admin IndexedDB cache the /admin/export page already populates
// (GET /api/admin/export/all — every shop row + circle/sector row, state-wide). Cache-first,
// no background fetch: if nothing is cached yet, callers get `data: null` and must call
// `sync()` explicitly (a real button click) rather than this hook silently pulling ~30K rows
// off D1 on every admin who happens to load a page using it.
export function useAdminExportData() {
  const [data, setData] = useState<AdminExportData | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    adminExportCache.get().then((c) => {
      if (c) { setData(c.data as AdminExportData); setFetchedAt(c.fetchedAt); }
      setLoading(false);
    });
  }, []);

  // Returns the freshly-fetched data (not just setting state) — React state updates aren't
  // visible synchronously after `await sync()`, so a caller that needs the data right away
  // (e.g. a download button building a workbook) reads the return value instead of `data`.
  async function sync(): Promise<AdminExportData> {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/export/all');
      const d = await res.json() as AdminExportData;
      await adminExportCache.set(d);
      setData(d);
      setFetchedAt(Date.now());
      return d;
    } finally {
      setSyncing(false);
    }
  }

  return { data, fetchedAt, loading, syncing, sync };
}
