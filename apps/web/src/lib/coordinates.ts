import { UP_BBOX } from '@excise/schema';

export interface CoordResult {
  latitudeDecimal: number;
  longitudeDecimal: number;
  warning?: string;
}

/**
 * DMS string → Decimal Degrees.
 * Handles: "26°50'48.12"N", "26 50 48.12 N", "26/50/48.12 N"
 */
function dmsToDecimal(dms: string): number | null {
  // Normalise separators
  const s = dms.trim().toUpperCase();

  // Signed DD passthrough (e.g. "-26.845")
  const ddOnly = /^-?\d+(\.\d+)?$/.exec(s);
  if (ddOnly) return parseFloat(s);

  // Full DMS with hemisphere
  const m = /(\d+)[°\s/](\d+)['\s/](\d+\.?\d*)["\s]*([NSEW])/.exec(s);
  if (!m) return null;

  const deg = parseFloat(m[1]!);
  const min = parseFloat(m[2]!);
  const sec = parseFloat(m[3]!);
  const hem = m[4]!;
  const dd = deg + min / 60 + sec / 3600;
  return ['S', 'W'].includes(hem) ? -dd : dd;
}

/** Accepts DD or DMS input, returns validated decimal coords. */
export function normalizeCoordinates(
  rawLat: string | number | null | undefined,
  rawLon: string | number | null | undefined,
): CoordResult | null {
  if (rawLat == null || rawLon == null || rawLat === '' || rawLon === '') return null;

  const lat = typeof rawLat === 'number' ? rawLat : dmsToDecimal(String(rawLat));
  const lon = typeof rawLon === 'number' ? rawLon : dmsToDecimal(String(rawLon));

  if (lat == null || lon == null || !isFinite(lat) || !isFinite(lon)) return null;

  const outOfBounds =
    lat < UP_BBOX.minLat || lat > UP_BBOX.maxLat ||
    lon < UP_BBOX.minLon || lon > UP_BBOX.maxLon;

  return {
    latitudeDecimal: Math.round(lat * 1e6) / 1e6,
    longitudeDecimal: Math.round(lon * 1e6) / 1e6,
    ...(outOfBounds ? { warning: 'Coordinates outside UP bounding box' } : {}),
  };
}

// Self-check — runs in Node for quick verification
if (process.env.NODE_ENV === 'test') {
  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(`FAIL: ${msg}`); };
  const r1 = normalizeCoordinates("26°50'48.12\"N", "80°56'46.3\"E");
  assert(r1 !== null, 'DMS parse returned null');
  assert(Math.abs(r1!.latitudeDecimal - 26.8467) < 0.001, 'DMS lat wrong');
  assert(r1!.warning === undefined, 'Valid UP coord flagged as out-of-bounds');
  const r2 = normalizeCoordinates(26.8467, 80.9462);
  assert(r2 !== null, 'DD parse returned null');
  const r3 = normalizeCoordinates(10.0, 70.0);
  assert(r3?.warning !== undefined, 'Out-of-bounds not flagged');
}
