import { describe, it, expect } from 'vitest';

/** Inline DMS converter (mirrors apps/web/src/lib/coordinates.ts) */
function dmsToDecimal(dms: string): number | null {
  const s = dms.trim().toUpperCase();
  const ddOnly = /^-?\d+(\.\d+)?$/.exec(s);
  if (ddOnly) return parseFloat(s);
  const m = /(\d+)[°\s/](\d+)['\s/](\d+\.?\d*)["\s]*([NSEW])/.exec(s);
  if (!m) return null;
  const dd = parseFloat(m[1]!) + parseFloat(m[2]!) / 60 + parseFloat(m[3]!) / 3600;
  return ['S', 'W'].includes(m[4]!) ? -dd : dd;
}

describe('DMS to Decimal Degrees', () => {
  it('parses degree-minute-second with N', () => {
    const r = dmsToDecimal("26°50'48.12\"N");
    expect(r).not.toBeNull();
    expect(Math.abs(r! - 26.8467)).toBeLessThan(0.001);
  });

  it('parses with E hemisphere', () => {
    const r = dmsToDecimal("80°56'46.3\"E");
    expect(r).not.toBeNull();
    expect(Math.abs(r! - 80.9462)).toBeLessThan(0.001);
  });

  it('returns negative for S hemisphere', () => {
    const r = dmsToDecimal("10°30'0\"S");
    expect(r).not.toBeNull();
    expect(r!).toBeLessThan(0);
  });

  it('passes through plain decimal degrees', () => {
    expect(dmsToDecimal('26.8467')).toBeCloseTo(26.8467);
  });

  it('returns null for unparseable input', () => {
    expect(dmsToDecimal('not a coordinate')).toBeNull();
  });
});
