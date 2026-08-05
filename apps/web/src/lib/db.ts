'use client';

// Dexie.js is loaded from jsDelivr CDN — not bundled. Available as window.Dexie.
interface DexieTable<T> {
  add(item: T): Promise<number>;
  bulkAdd(items: T[]): Promise<number[]>;
  put(item: T & { id?: number }): Promise<number>;
  bulkPut(items: (T & { id?: number })[]): Promise<number[]>;
  toArray(): Promise<T[]>;
  where(field: string): { equals: (v: unknown) => { toArray: () => Promise<T[]>; modify: (fn: Partial<T>) => Promise<number> } };
  update(id: number, changes: Partial<T>): Promise<number>;
  delete(id: number): Promise<void>;
  filter(fn: (item: T) => boolean): { toArray: () => Promise<T[]> };
  count(): Promise<number>;
  clear(): Promise<void>;
}
interface DexieInstance {
  version(n: number): { stores: (schema: Record<string, string>) => void };
  table<T>(name: string): DexieTable<T>;
  transaction<T>(mode: 'rw', tables: DexieTable<unknown>[], fn: () => Promise<T>): Promise<T>;
}

import type { StagedRow } from './types';

function makeDexie(name: string): DexieInstance {
  const D = (globalThis as unknown as { Dexie: new (name: string) => DexieInstance }).Dexie;
  return new D(name);
}

// ── DEO staging DB ──────────────────────────────────────────────────────────

let _db: DexieInstance | null = null;

function getDb(): DexieInstance {
  if (!_db) {
    _db = makeDexie('excise-phase1');
    _db.version(1).stores({
      phase1_staging: '++id, districtName, circleSectorName, shopId, status, thanaName, shopType',
      upload_queue: '++id, chunkIndex, districtName, circleSectorName, status',
    });
  }
  return _db;
}

export const stagingDb = {
  // Replaces a district's staged (non-uploaded) rows with a fresh parse — this was
  // documented ("re-uploading replaces staged data, uploaded rows are preserved") but never
  // actually implemented: bulkPut only upserts by Dexie's auto-increment id, and a fresh
  // parseExcelFile() call always produces id-less row objects, so every re-upload silently
  // added a second (or third...) copy on top of the old staged rows instead of replacing
  // them — the real cause of /verify appearing to show "old data" after a corrected re-upload.
  putRows: async (rows: StagedRow[]) => {
    if (rows.length > 0) {
      const district = rows[0]!.districtName;
      const existing = await getDb().table<StagedRow>('phase1_staging').where('districtName').equals(district).toArray();
      await Promise.all(
        existing.filter((r) => r.status !== 'uploaded' && r.id != null)
          .map((r) => getDb().table<StagedRow>('phase1_staging').delete(r.id!))
      );
    }
    return getDb().table<StagedRow>('phase1_staging').bulkPut(rows);
  },

  getAll: () =>
    getDb().table<StagedRow>('phase1_staging').toArray(),

  getByStatus: (status: StagedRow['status']) =>
    getDb().table<StagedRow>('phase1_staging').where('status').equals(status).toArray(),

  getByDistrict: (district: string) =>
    getDb().table<StagedRow>('phase1_staging').where('districtName').equals(district).toArray(),

  updateStatus: (id: number, status: StagedRow['status'], errorReason?: string) =>
    getDb().table<StagedRow>('phase1_staging').update(id, { status, ...(errorReason ? { errorReason } : {}) }),

  updateRow: (id: number, changes: Partial<StagedRow>) =>
    getDb().table<StagedRow>('phase1_staging').update(id, changes),

  clear: () =>
    getDb().table<StagedRow>('phase1_staging').clear(),

  count: () =>
    getDb().table<StagedRow>('phase1_staging').count(),

  // Wipes both staged rows and any queued-for-sync upload chunks — used by the DEO
  // "Clear Staged Data" button to recover from a wrong file staged locally (never touches D1).
  clearAll: async () => {
    await Promise.all([
      getDb().table<StagedRow>('phase1_staging').clear(),
      getDb().table<QueuedChunk>('upload_queue').clear(),
    ]);
  },
};

interface QueuedChunk {
  id?: number;
  chunkIndex: number;
  districtName: string;
  circleSectorName: string;
  rows: StagedRow[];
  status: 'queued' | 'retrying' | 'done';
}

export const uploadQueue = {
  push: (chunk: Omit<QueuedChunk, 'id' | 'status'>) =>
    getDb().table<QueuedChunk>('upload_queue').add({ ...chunk, status: 'queued' }),

  getQueued: () =>
    getDb().table<QueuedChunk>('upload_queue').where('status').equals('queued').toArray(),

  markDone: (id: number) =>
    getDb().table<QueuedChunk>('upload_queue').update(id, { status: 'done' }),
};

// ── Admin export cache DB ───────────────────────────────────────────────────

interface AdminExportCache {
  key: string;           // fixed key e.g. 'all_shops'
  rows: unknown[];
  fetchedAt: number;     // Unix ms — used to show staleness warning
}

interface AdminKvCache<T> {
  key: string;
  data: T;
  fetchedAt: number;
}

let _adminDb: DexieInstance | null = null;

function getAdminDb(): DexieInstance {
  if (!_adminDb) {
    _adminDb = makeDexie('excise-admin');
    // version 1: export_cache only
    // version 2: add districts_cache
    _adminDb.version(1).stores({ export_cache: 'key' });
    _adminDb.version(2).stores({ export_cache: 'key', districts_cache: 'key' });
    _adminDb.version(3).stores({ export_cache: 'key', districts_cache: 'key', map_cache: 'key', shops_cache: 'key', audit_cache: 'key' });
    _adminDb.version(4).stores({ export_cache: 'key', districts_cache: 'key', map_cache: 'key', shops_cache: 'key', audit_cache: 'key', unlock_requests_cache: 'key' });
    _adminDb.version(5).stores({ export_cache: 'key', districts_cache: 'key', map_cache: 'key', shops_cache: 'key', audit_cache: 'key', unlock_requests_cache: 'key', settings_cache: 'key' });
  }
  return _adminDb;
}

// ── Districts aggregate cache (TTL: 5 min) ─────────────────────────────────

const DISTRICTS_KEY = 'districts';
const DISTRICTS_TTL_MS = 5 * 60 * 1000;

export const adminDistrictsCache = {
  get: () =>
    getAdminDb().table<AdminKvCache<unknown>>('districts_cache')
      .where('key').equals(DISTRICTS_KEY).toArray()
      .then((r) => {
        const entry = r[0];
        if (!entry) return null;
        return entry.data;
      }),

  set: (data: unknown) =>
    getAdminDb().table<AdminKvCache<unknown>>('districts_cache')
      .put({ key: DISTRICTS_KEY, data, fetchedAt: Date.now() }),

  invalidate: () =>
    getAdminDb().table<AdminKvCache<unknown>>('districts_cache').clear(),
};

// ── Full-state export cache ─────────────────────────────────────────────────
// Holds { rows, units } from GET /api/admin/export/all — shop rows plus every
// district_circles_sectors row, used together to build the multi-sheet workbook.

const EXPORT_CACHE_KEY = 'all_shops';

export const adminExportCache = {
  get: () =>
    getAdminDb().table<AdminKvCache<unknown>>('export_cache')
      .where('key').equals(EXPORT_CACHE_KEY).toArray()
      .then((r) => r[0] ?? null),

  set: (data: unknown) =>
    getAdminDb().table<AdminKvCache<unknown>>('export_cache')
      .put({ key: EXPORT_CACHE_KEY, data, fetchedAt: Date.now() }),

  clear: () =>
    getAdminDb().table<AdminKvCache<unknown>>('export_cache').clear(),
};

// ── Map cache (TTL: 5 min) ─────────────────────────────────────────────────

export const adminMapCache = {
  get: () =>
    getAdminDb().table<AdminKvCache<unknown>>('map_cache')
      .where('key').equals('map_data').toArray()
      .then((r) => {
        const entry = r[0];
        if (!entry) return null;
        return entry.data;
      }),
  set: (data: unknown) =>
    getAdminDb().table<AdminKvCache<unknown>>('map_cache')
      .put({ key: 'map_data', data, fetchedAt: Date.now() }),
  invalidate: () =>
    getAdminDb().table<AdminKvCache<unknown>>('map_cache').clear(),
};

// ── Shops cache (TTL: 5 min) ───────────────────────────────────────────────

export const adminShopsCache = {
  get: (districtName: string) =>
    getAdminDb().table<AdminKvCache<unknown>>('shops_cache')
      .where('key').equals(districtName).toArray()
      .then((r) => {
        const entry = r[0];
        if (!entry) return null;
        return entry.data;
      }),
  set: (districtName: string, data: unknown) =>
    getAdminDb().table<AdminKvCache<unknown>>('shops_cache')
      .put({ key: districtName, data, fetchedAt: Date.now() }),
  invalidate: () =>
    getAdminDb().table<AdminKvCache<unknown>>('shops_cache').clear(),
};

// ── Audit cache (TTL: 1 min) ───────────────────────────────────────────────

export const adminAuditCache = {
  get: (page: string) =>
    getAdminDb().table<AdminKvCache<unknown>>('audit_cache')
      .where('key').equals(page).toArray()
      .then((r) => {
        const entry = r[0];
        if (!entry) return null;
        return entry.data;
      }),
  set: (page: string, data: unknown) =>
    getAdminDb().table<AdminKvCache<unknown>>('audit_cache')
      .put({ key: page, data, fetchedAt: Date.now() }),
  invalidate: () =>
    getAdminDb().table<AdminKvCache<unknown>>('audit_cache').clear(),
};

// ── Unlock requests cache (manual sync, same convention as adminAuditCache) ─────

const UNLOCK_REQUESTS_KEY = 'unlock_requests';

export const adminUnlockRequestsCache = {
  get: () =>
    getAdminDb().table<AdminKvCache<unknown>>('unlock_requests_cache')
      .where('key').equals(UNLOCK_REQUESTS_KEY).toArray()
      .then((r) => {
        const entry = r[0];
        if (!entry) return null;
        return entry.data;
      }),
  set: (data: unknown) =>
    getAdminDb().table<AdminKvCache<unknown>>('unlock_requests_cache')
      .put({ key: UNLOCK_REQUESTS_KEY, data, fetchedAt: Date.now() }),
  invalidate: () =>
    getAdminDb().table<AdminKvCache<unknown>>('unlock_requests_cache').clear(),
};

// ── App settings cache (manual sync, same convention as adminUnlockRequestsCache) ──
// Backs the verification-phase toggle/progress card on the admin overview page.

const SETTINGS_KEY = 'app_settings';

export const adminSettingsCache = {
  get: () =>
    getAdminDb().table<AdminKvCache<unknown>>('settings_cache')
      .where('key').equals(SETTINGS_KEY).toArray()
      .then((r) => {
        const entry = r[0];
        if (!entry) return null;
        return entry.data;
      }),
  set: (data: unknown) =>
    getAdminDb().table<AdminKvCache<unknown>>('settings_cache')
      .put({ key: SETTINGS_KEY, data, fetchedAt: Date.now() }),
  invalidate: () =>
    getAdminDb().table<AdminKvCache<unknown>>('settings_cache').clear(),
};

// ── Global sync ──────────────────────────────────────────────────────────────
// One button (in the admin navbar) clears every admin cache table at once, instead of each
// page owning its own "Sync from Server" button. The caller still needs to force a refetch
// (e.g. window.location.reload()) — clearing IndexedDB alone doesn't re-run a mounted page's
// already-resolved state.
//
// adminExportCache is deliberately NOT included here. Every other cache below is cheap and
// gets silently repopulated by its own page's hook on the very next load (districts, map,
// audit, unlock requests all refetch lazily on a cache miss). The export cache holds the
// full ~30K-row state-wide dataset and is only ever refilled by an explicit action — the
// Export page's own "Refresh & Download", or the small "Refresh" buttons on the overview's
// statewide breakdown card and the Circle & Sector Master page (M-61). Clearing it here used
// to just mean the rarely-visited Export page had to re-sync once; now that two more
// everyday admin surfaces depend on it, "Sync All" silently nuking it made those surfaces
// show "not synced" right after the exact button an admin uses to keep everything fresh —
// clearing it should stay a deliberate, dataset-specific action, not a side effect of the
// generic sync-everything button.
export async function invalidateAllAdminCaches(): Promise<void> {
  await Promise.all([
    adminDistrictsCache.invalidate(),
    adminMapCache.invalidate(),
    adminShopsCache.invalidate(),
    adminAuditCache.invalidate(),
    adminUnlockRequestsCache.invalidate(),
    adminSettingsCache.invalidate(),
  ]);
}
