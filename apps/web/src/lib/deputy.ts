// URL prefix for a deputy's division portal, e.g. '/deputy-lucknow'. The 18 division names
// (Agra, Lucknow, Vindhyachal, …) are single words; the slug is just the lower-cased name.
// middleware.ts rewrites '/deputy-<slug>/*' onto the '/deputy/*' pages, so the browser keeps
// the division in the URL while the route tree stays a single '(deputy)' group.
export function deputyBasePath(division: string | null | undefined): string {
  const slug = (division ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  return slug ? `/deputy-${slug}` : '/deputy';
}
