// URL prefix for a deputy's division portal, e.g. '/deputy-lucknow'. The 18 division names
// (Agra, Lucknow, Vindhyachal, …) are single words; the slug is just the lower-cased name.
// middleware.ts rewrites '/deputy-<slug>/*' onto the '/deputy/*' pages, so the browser keeps
// the division in the URL while the route tree stays a single '(deputy)' group.
export function deputyBasePath(division: string | null | undefined): string {
  const slug = deputyDivisionKey(division).replace(/\s+/g, '-');
  return slug ? `/deputy-${slug}` : '/deputy';
}

// Stable per-division key for the excise-deputy IndexedDB caches — lower-cased division name,
// so one browser used by two deputies of different divisions never gets a cross-division
// cache hit. Empty string when there is no division (nothing should be cached then).
export function deputyDivisionKey(division: string | null | undefined): string {
  return (division ?? '').trim().toLowerCase();
}
