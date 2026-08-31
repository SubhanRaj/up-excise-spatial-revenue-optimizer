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

import type { Phase1RowInput, StagedRow } from './types';
import type { ExportShopRow, StateExportUnit } from './excel';

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

// Fields that make two rows for the same shop_id actually different data — id/status/
// errorReason/coordinateWarning are bookkeeping, not content, and uploadedByDeo can
// legitimately differ (a different Inspector/DEO re-consolidated the file) without the row
// itself having changed. Used by putRows() below to skip re-staging a row that's byte-identical
// to what's already uploaded, so a data-correction re-upload only queues the shop(s) that
// actually changed instead of every shop in the district.
const CONTENT_FIELDS: (keyof Phase1RowInput)[] = [
  'circleSectorName', 'thanaName', 'adjacentThanasRaw', 'shopName', 'shopType', 'hasCl5cc',
  'latitudeDms', 'longitudeDms', 'latitudeDecimal', 'longitudeDecimal',
  'licenseFeeLf', 'basicLicenseFeeBlf', 'mgrAmount',
  'compositeLfFl', 'compositeLfBeer', 'compositeMgrFl', 'compositeMgrBeer',
  'mgqQuantity', 'considerationFee', 'specialBeerLf', 'specialBeerMgr', 'totalRevenue',
];

function rowContentEqual(a: StagedRow, b: StagedRow): boolean {
  return CONTENT_FIELDS.every((f) => a[f] === b[f]);
}

export const stagingDb = {
  // Replaces a district's staged (non-uploaded) rows with a fresh parse — this was
  // documented ("re-uploading replaces staged data, uploaded rows are preserved") but never
  // actually implemented: bulkPut only upserts by Dexie's auto-increment id, and a fresh
  // parseExcelFile() call always produces id-less row objects, so every re-upload silently
  // added a second (or third...) copy on top of the old staged rows instead of replacing
  // them — the real cause of /verify appearing to show "old data" after a corrected re-upload.
  //
  // Also skips re-staging any row that's byte-identical to its already-uploaded copy (see
  // rowContentEqual above) — without this, re-uploading a whole corrected district file to fix
  // one shop queued every shop in the district as 'pending', and Submit District would then
  // re-send and re-write all of them (idempotent at the D1 row level via onConflictDoUpdate,
  // but still every row's worth of network + D1 write cost for a one-shop fix).
  putRows: async (rows: StagedRow[]) => {
    if (rows.length > 0) {
      const district = rows[0]!.districtName;
      const existing = await getDb().table<StagedRow>('phase1_staging').where('districtName').equals(district).toArray();
      await Promise.all(
        existing.filter((r) => r.status !== 'uploaded' && r.id != null)
          .map((r) => getDb().table<StagedRow>('phase1_staging').delete(r.id!))
      );
      const uploadedByShopId = new Map(existing.filter((r) => r.status === 'uploaded').map((r) => [r.shopId, r]));
      rows = rows.filter((r) => {
        const prev = uploadedByShopId.get(r.shopId);
        return !prev || !rowContentEqual(r, prev);
      });
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

/** Ensures this device's local staging cache matches D1 for `district`, reusing the same
 * `verify-synced-{district}` flag the final-verification screen sets after its own one-time
 * sync (apps/web/app/(deo)/verify/page.tsx). A data-correction unlock never touches any
 * phase1_raw_collection row — it only flips districts.status — so a cache already synced from
 * an earlier visit (including the final-verification screen's own sync, or a prior call to
 * this same function) is still accurate and this is a no-op D1-wise. Used by /upload's
 * "Download District Data" so the downloaded file can be pre-filled with current data
 * without a redundant D1 read every time it's clicked. */
export async function ensureDistrictSynced(district: string): Promise<StagedRow[]> {
  const key = `verify-synced-${district}`;
  if (localStorage.getItem(key) !== 'true') {
    await stagingDb.clearAll();
    try {
      const res = await fetch(`/api/districts/${encodeURIComponent(district)}/shops`);
      if (res.ok) {
        const body = await res.json() as { rows: StagedRow[] };
        await stagingDb.putRows(body.rows.map((r) => ({ ...r, status: 'uploaded' as const })));
      }
      localStorage.setItem(key, 'true');
    } catch {
      // Best-effort — flag stays unset, next call retries the D1 fetch.
    }
  }
  return stagingDb.getByDistrict(district);
}

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

// ── Full-state export cache ─────────────────────────────────────────────────
// Holds { rows, units } from GET /api/admin/export/all — shop rows plus every
// district_circles_sectors row, used together to build the multi-sheet workbook.

const EXPORT_CACHE_KEY = 'all_shops';

// Pages through GET /api/admin/export/all (2000 rows/request server-side, see that route's
// PAGE_SIZE comment) and assembles the full { rows, units } payload — replaces the single
// unbounded fetch every caller used to do, which serialized the whole ~25K-row table in one
// Worker invocation and exceeded the free-tier CPU budget once real data landed.
export async function fetchFullExportData(): Promise<{ rows: unknown[]; units: unknown[] }> {
  const rows: unknown[] = [];
  let units: unknown[] = [];
  let offset = 0;
  for (;;) {
    const res = await fetch(`/api/admin/export/all?offset=${offset}`);
    if (!res.ok) throw new Error('export fetch failed');
    const page = await res.json() as { rows: unknown[]; units: unknown[]; hasMore: boolean };
    rows.push(...page.rows);
    if (offset === 0) units = page.units;
    if (!page.hasMore) break;
    offset += page.rows.length;
  }
  return { rows, units };
}

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

// Shared 5-min freshness window for the small per-page caches below — none of them actually
// checked fetchedAt against this until a real bug surfaced (a cache populated once could be
// served indefinitely until an explicit Sync All, which itself has its own 15-min cooldown
// that can silently no-op). makeKvCache below is the one place this check now lives, so a
// future cache added the same way can't independently forget it.
const CACHE_TTL_MS = 5 * 60 * 1000;

// One Dexie table, one key shape (key + data + fetchedAt), one TTL check — every small
// admin cache below (districts/map/shops/audit/unlock-requests/settings) is this same shape,
// so they're generated from one factory instead of six copy-pasted objects. `fixedKey` caches
// are page-wide singletons (`.get()`/`.set(data)`); omitting it makes a cache keyed by whatever
// string the caller passes (`.get(k)`/`.set(k, data)`), used by shops (per-district) and audit
// (per-page). export_cache stays separate — it's a different shape ({rows, units}, ~25K rows,
// patched incrementally rather than replaced wholesale) so a shared KV factory doesn't fit it.
function makeKvCache<T>(table: string, opts: { fixedKey?: string; ttlMs?: number } = {}) {
  const { fixedKey, ttlMs } = opts;
  return {
    get: (key: string = fixedKey!) =>
      getAdminDb().table<AdminKvCache<T>>(table)
        .where('key').equals(key).toArray()
        .then((r) => {
          const entry = r[0];
          if (!entry) return null;
          if (ttlMs && Date.now() - entry.fetchedAt > ttlMs) return null;
          return entry.data;
        }),
    set: (keyOrData: string | T, data?: T) => {
      const [key, value] = fixedKey !== undefined ? [fixedKey, keyOrData as T] : [keyOrData as string, data as T];
      return getAdminDb().table<AdminKvCache<T>>(table).put({ key, data: value, fetchedAt: Date.now() });
    },
    invalidate: () => getAdminDb().table<AdminKvCache<T>>(table).clear(),
  };
}

// ── Districts aggregate cache (TTL: 5 min) ──────────────────────────────────
export const adminDistrictsCache = makeKvCache<unknown>('districts_cache', { fixedKey: 'districts', ttlMs: CACHE_TTL_MS });

// ── Map cache (TTL: 5 min) ─────────────────────────────────────────────────
export const adminMapCache = makeKvCache<unknown>('map_cache', { fixedKey: 'map_data', ttlMs: CACHE_TTL_MS });

// ── Shops cache (keyed by district name, no time-based TTL) ────────────────
// A district's shop rows only ever change on a submit/verify/unlock event — a fixed 5-min
// TTL like the other caches would force a full ~pageSize=all re-fetch on every visit past
// that window regardless of whether anything actually changed, which is real D1-read cost
// for 75 districts an admin might revisit all day. The district detail page instead checks
// `GET /api/admin/changed-districts?since=<this entry's fetchedAt>` — the same cheap single
// indexed audit_log scan Sync All's export sync already uses (M-64) — and only re-fetches
// this district's shop rows when its own name comes back in that list.
export const adminShopsCache = makeKvCache<unknown>('shops_cache');

// ── Audit cache (keyed by page number; never actually read — the audit page always
// fetches fresh by design, this exists only for a possible future consumer) ────────────────
export const adminAuditCache = makeKvCache<unknown>('audit_cache', { ttlMs: 60 * 1000 });

// ── Unlock requests cache (TTL: 5 min, plus manual sync via Sync All) ──
// A stale entry here isn't just cosmetic — it could show a request as still pending after
// another admin (a different device/session) already resolved it, or hide a genuinely new
// request until Sync All runs. TTL bounds how long that can persist without user action.
export const adminUnlockRequestsCache = makeKvCache<unknown>('unlock_requests_cache', { fixedKey: 'unlock_requests', ttlMs: CACHE_TTL_MS });

// ── App settings cache (TTL: 5 min, plus manual sync via Sync All) ──
// Backs the verification-phase toggle/progress card on the admin overview page. A stale
// entry here could show "verification not open" to one admin/device while it's actually
// open — worse than most staleness since admins relay this state to DEOs verbally.
export const adminSettingsCache = makeKvCache<unknown>('settings_cache', { fixedKey: 'app_settings', ttlMs: CACHE_TTL_MS });

// ── Global sync ──────────────────────────────────────────────────────────────
// One button (in the admin navbar) refreshes every admin cache table at once, instead of
// each page owning its own "Sync from Server" button — this is the one gesture admins
// actually reach for to get fresh data, so every cache needs to actually end up fresh after
// it, not just cleared and left to whichever page happens to load next. The caller still
// needs to force a refetch of the current page's own state afterward (e.g.
// window.location.reload()) — clearing/repopulating IndexedDB alone doesn't re-run a
// mounted page's already-resolved React state.
//
// The export cache (~30K shop rows + every circle/sector, state-wide) is the one exception
// to "just clear it, the next page load refetches lazily" — nothing refetches it lazily, so
// clearing it here without also refetching left the overview's statewide breakdown card and
// the Circle & Sector Master page (M-61) permanently stuck on "not synced" the moment an
// admin did the one thing they already do to refresh everything. Since Sync All is always an
// explicit, user-clicked action — never automatic or on a timer — actually fetching the full
// dataset here is the appropriate place for that cost, not a second dedicated button nobody
// would remember to click. Each of those two pages still keeps its own small "Refresh"
// button for refreshing just this one dataset without redoing everything else.
//
// M-63 first tried gating the *whole* export_cache refetch behind "did any district lock
// recently" — still an all-or-nothing ~25K-row repull the moment one of 75 districts changed.
// M-64 replaced that with per-district patching: GET /api/admin/changed-districts (single
// indexed audit_log scan) reports exactly which district names changed since this device's
// last export sync; only those districts' rows/units get re-fetched (via the existing
// single-district shops/detail routes) and spliced into the cached dataset in place. A Sync
// All click where nothing relevant changed touches zero shop-row D1 reads. Two independent
// guards remain, both silent (the button itself is unchanged — no disabled state, no
// "already synced" message):
//   1. A 15-minute client-side cooldown (`SYNC_COOLDOWN_KEY` in localStorage) — a click inside
//      the cooldown window is a no-op, zero D1 reads of any kind.
//   2. Past the cooldown, the cheap/small caches (audit, unlock requests, districts, map,
//      settings) always refresh as before; export_cache only touches D1 for districts that
//      actually appear in the changed-districts response.
const SYNC_COOLDOWN_KEY = 'admin-last-full-sync-at';
const SYNC_COOLDOWN_MS = 15 * 60 * 1000;

// If localStorage's watermark and IndexedDB's export_cache ever fall out of sync (e.g. site
// data cleared selectively), changed-districts could report most/all 75 districts at once —
// fetching each individually would be more requests than just re-pulling everything in
// PAGE_SIZE-sized pages. Past this many changed districts, fall back to one full refetch.
const MAX_INCREMENTAL_DISTRICTS = 15;
const EXPORT_WATERMARK_KEY = 'admin-export-sync-watermark';

// Re-fetches only the given districts' shop rows and units, and splices them into the
// existing export_cache in place — never touches any district not in `names`, so data for
// every other district is left exactly as it was, not deleted or blanked while its own fetch
// is pending.
async function patchExportCacheForDistricts(names: string[]): Promise<void> {
  const cached = await adminExportCache.get();
  const existing = (cached?.data as { rows: ExportShopRow[]; units: StateExportUnit[] } | undefined)
    ?? { rows: [], units: [] };

  const fetched = await Promise.all(names.map(async (name) => {
    const [shopsRes, detailRes] = await Promise.all([
      fetch(`/api/admin/districts/${encodeURIComponent(name)}/shops?pageSize=all`),
      fetch(`/api/admin/districts/${encodeURIComponent(name)}`),
    ]);
    const shopsRows = shopsRes.ok ? ((await shopsRes.json()) as { rows: ExportShopRow[] }).rows : null;
    const units = detailRes.ok ? ((await detailRes.json()) as { units: StateExportUnit[] }).units : null;
    return { name, shopsRows, units };
  }));

  // A district whose fetch failed keeps its old cached rows/units rather than being wiped —
  // "no error reaches the portal" means a bad response here must never delete good local data.
  const failed = new Set(fetched.filter((f) => f.shopsRows === null || f.units === null).map((f) => f.name));
  const toReplace = new Set(names.filter((n) => !failed.has(n)));

  const rows = existing.rows.filter((r) => !toReplace.has(r.districtName ?? ''));
  const units = existing.units.filter((u) => !toReplace.has(u.districtName));
  for (const f of fetched) {
    if (failed.has(f.name)) continue;
    rows.push(...(f.shopsRows as ExportShopRow[]));
    units.push(...(f.units as StateExportUnit[]));
  }
  await adminExportCache.set({ rows, units });
}

async function syncExportCache(): Promise<void> {
  const cached = await adminExportCache.get();
  if (!cached) {
    // Never synced on this device yet — one full paginated pull, same as before M-64.
    try {
      const data = await fetchFullExportData();
      await adminExportCache.set(data);
      localStorage.setItem(EXPORT_WATERMARK_KEY, String(Date.now()));
    } catch {
      // Best-effort — falls back to the per-page Sync/Refresh prompts.
    }
    return;
  }

  const watermark = Number(localStorage.getItem(EXPORT_WATERMARK_KEY) ?? 0);
  try {
    const res = await fetch(`/api/admin/changed-districts?since=${watermark}`);
    if (!res.ok) return;
    const { districts: changed, at } = (await res.json()) as { districts: string[]; at: number };
    if (changed.length === 0) return;

    if (changed.length > MAX_INCREMENTAL_DISTRICTS) {
      const data = await fetchFullExportData();
      await adminExportCache.set(data);
    } else {
      await patchExportCacheForDistricts(changed);
    }
    localStorage.setItem(EXPORT_WATERMARK_KEY, String(at));
  } catch {
    // Best-effort — export_cache just stays at its last-known-good state; nothing is deleted.
  }
}

export async function invalidateAllAdminCaches(): Promise<void> {
  const lastSync = Number(localStorage.getItem(SYNC_COOLDOWN_KEY) ?? 0);
  if (Date.now() - lastSync < SYNC_COOLDOWN_MS) return;
  localStorage.setItem(SYNC_COOLDOWN_KEY, String(Date.now()));

  await Promise.all([
    adminDistrictsCache.invalidate(),
    adminMapCache.invalidate(),
    adminShopsCache.invalidate(),
    adminAuditCache.invalidate(),
    adminUnlockRequestsCache.invalidate(),
    adminSettingsCache.invalidate(),
  ]);

  await syncExportCache();
}
