/** Case/whitespace differences ("Kotwali" vs "kotwali " vs "Kotwali  ") are the same Thana,
 * not distinct ones — used wherever a Thana count is derived from a Set of raw thanaName
 * values (Circle/Sector Breakdown, the circle-sector export sheet), so a single real Thana
 * entered inconsistently across shop rows doesn't inflate the count. */
export function normalizeThanaName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Levenshtein edit distance — small strings only (Thana names), no need for a dependency. */
function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[a.length]![b.length]!;
}

/** The digit sequence(s) in a name, joined — "Sector 62" and "Sec-62" both give "62"; "Sector
 * 113" gives "113". Empty string for a name with no digits. */
function digitKey(s: string): string {
  return (s.match(/\d+/g) ?? []).join(',');
}

/** Groups likely-typo Thana name variants together (e.g. "Kotwali" / "Kotwal i" / "Kotwaali")
 * for human review — a person confirms whether they're really the same place before anything
 * gets merged, since an automatic merge could just as easily hide two genuinely different
 * Thanas that happen to look similar.
 *
 * A name carrying a number (Noida's sector-numbered stations, e.g. "Sector 62") is handled
 * separately from a plain-word name: the number is the part that actually distinguishes one
 * real station from another, so "Sector 62" and "Sector 113" must never cluster no matter how
 * close their spelling looks to plain edit distance — two different sector numbers are two
 * different police stations. Formatting noise around a matching number ("Sector 62" / "Sec-62"
 * / "Sector-62 Noida" / "62, Noida") is exactly the same-station variation this function exists
 * to catch, so names sharing the same digit sequence cluster together directly, regardless of
 * how different the surrounding text looks.
 *
 * A name with no digits falls back to edit distance: distance 1 for short names (<=6 chars,
 * where even one stray letter is a big fraction of the word) and distance <=2 for longer ones.
 *
 * Returns clusters of 2+ names, each in original casing, sorted by cluster size descending. */
export function findThanaNameVariants(rawNames: Iterable<string>): string[][] {
  const distinct = new Map<string, string>(); // normalized -> first-seen original casing
  for (const raw of rawNames) {
    const norm = normalizeThanaName(raw);
    if (norm && !distinct.has(norm)) distinct.set(norm, raw.trim());
  }
  const norms = Array.from(distinct.keys());
  const seen = new Set<string>();
  const clusters: string[][] = [];
  for (let i = 0; i < norms.length; i++) {
    if (seen.has(norms[i]!)) continue;
    const a = norms[i]!;
    const aDigits = digitKey(a);
    const group = [a];
    for (let j = i + 1; j < norms.length; j++) {
      if (seen.has(norms[j]!)) continue;
      const b = norms[j]!;
      const bDigits = digitKey(b);
      if (aDigits || bDigits) {
        if (aDigits && aDigits === bDigits) group.push(b);
        continue; // never fall through to edit distance when either name carries a number
      }
      const maxLen = Math.max(a.length, b.length);
      const threshold = maxLen <= 6 ? 1 : 2;
      if (editDistance(a, b) <= threshold) group.push(b);
    }
    if (group.length > 1) {
      group.forEach((g) => seen.add(g));
      clusters.push(group.map((g) => distinct.get(g)!));
    }
  }
  return clusters.sort((a, b) => b.length - a.length);
}
