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

/** Groups likely-typo Thana name variants together (e.g. "Kotwali" / "Kotwal i" / "Kotwaali")
 * for human review — a person confirms whether they're really the same place before anything
 * gets merged, since an automatic merge could just as easily hide two genuinely different
 * Thanas that happen to look similar. Only within-name-length-appropriate edit distance counts
 * as "likely a typo": distance 1 for short names (<=6 chars, where even one stray letter is a
 * big fraction of the word) and distance <=2 for longer ones. Returns clusters of 2+ names,
 * each in original casing, sorted by cluster size descending. */
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
    const group = [norms[i]!];
    for (let j = i + 1; j < norms.length; j++) {
      if (seen.has(norms[j]!)) continue;
      const a = norms[i]!, b = norms[j]!;
      const maxLen = Math.max(a.length, b.length);
      const threshold = maxLen <= 6 ? 1 : 2;
      if (editDistance(a, b) <= threshold) group.push(norms[j]!);
    }
    if (group.length > 1) {
      group.forEach((g) => seen.add(g));
      clusters.push(group.map((g) => distinct.get(g)!));
    }
  }
  return clusters.sort((a, b) => b.length - a.length);
}
