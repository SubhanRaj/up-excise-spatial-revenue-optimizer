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
  putRows: (rows: StagedRow[]) =>
    getDb().table<StagedRow>('phase1_staging').bulkPut(rows),

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

let _adminDb: DexieInstance | null = null;

function getAdminDb(): DexieInstance {
  if (!_adminDb) {
    _adminDb = makeDexie('excise-admin');
    _adminDb.version(1).stores({ export_cache: 'key' });
  }
  return _adminDb;
}

const EXPORT_CACHE_KEY = 'all_shops';

export const adminExportCache = {
  get: () =>
    getAdminDb().table<AdminExportCache>('export_cache')
      .where('key').equals(EXPORT_CACHE_KEY).toArray()
      .then((r) => r[0] ?? null),

  set: (rows: unknown[]) =>
    getAdminDb().table<AdminExportCache>('export_cache')
      .put({ key: EXPORT_CACHE_KEY, rows, fetchedAt: Date.now() }),

  clear: () =>
    getAdminDb().table<AdminExportCache>('export_cache').clear(),
};
