import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// '/opengraph-image' has no file extension in its URL, so it doesn't match the matcher's
// static-asset exclusion (.*\..*) the way /icon.svg, /robots.txt, /manifest.json do — it must
// be listed explicitly or social/SEO crawlers get redirected to /login instead of the image.
const PUBLIC = new Set(['/login', '/auth/verify', '/opengraph-image']);

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public routes and Next.js internals
  if (PUBLIC.has(pathname) || pathname.startsWith('/api/') || pathname.startsWith('/_next/')) {
    return NextResponse.next();
  }

  const sessionCookie = req.cookies.get('excise-session')?.value;
  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Route group enforcement based on role cookie (security enforced in server layouts via requireAuth)
  const role = req.cookies.get('excise-role')?.value;
  if (pathname.match(/^\/admin/) && role !== 'admin' && role !== 'superadmin') {
    return NextResponse.redirect(new URL(role === 'deputy' ? '/deputy' : '/login', req.url));
  }
  // Deputy Excise Commissioner portal (M-102) — deputy-only, superadmin allowed for debugging.
  // The browser URL carries the division: /deputy-lucknow, /deputy-lucknow/districts. Those
  // are rewritten onto the single /deputy route group so the URL keeps the division without a
  // per-division route tree. Bare /deputy (manual entry / old link) still renders; the page
  // bounces to the division URL.
  if (pathname.match(/^\/deputy(-|\/|$)/i) && role !== 'deputy' && role !== 'superadmin') {
    return NextResponse.redirect(new URL(role === 'deo' ? '/home' : role === 'admin' ? '/admin' : '/login', req.url));
  }
  // Rewrite only the known deputy route shapes — /deputy-<div>, .../districts, .../districts/<name>.
  // The destination is asserted to stay under /deputy afterward: a crafted sub-path with
  // ../ dot-segments would otherwise let the URL setter normalise the rewrite target out of
  // the deputy tree (e.g. onto /admin) while keeping the deputy's own role gate satisfied.
  const deputyScoped = pathname.match(/^\/deputy-[a-z]+((?:\/districts(?:\/[^/]+)?)?)\/?$/i);
  if (deputyScoped) {
    const url = req.nextUrl.clone();
    url.pathname = '/deputy' + deputyScoped[1];
    // The tightened pattern above already bars multi-segment / dot-only sub-paths; this is a
    // final guard that the rewrite target never leaves the /deputy tree.
    if (url.pathname !== '/deputy' && !url.pathname.startsWith('/deputy/')) {
      return NextResponse.redirect(new URL('/deputy', req.url));
    }
    return NextResponse.rewrite(url);
  }
  // Any other /deputy-… path (traversal attempt, junk suffix) — never rewrite it; send the
  // deputy to their own dashboard.
  if (pathname.match(/^\/deputy-/i)) {
    return NextResponse.redirect(new URL('/deputy', req.url));
  }
  // DEO routes are deo-only now — an admin/superadmin session landing here (stale bookmark,
  // old tab) is sent to their own dashboard instead of rendering a broken "Unknown District"
  // DEO page. Previously admin/superadmin were let through as a bypass; that's what let it
  // render at all. See CLAUDE.md's "DEO Workflow" section.
  if (pathname.match(/^\/(home|upload|verify|units)/)) {
    if (role === 'admin' || role === 'superadmin') {
      return NextResponse.redirect(new URL('/admin', req.url));
    }
    if (role === 'deputy') {
      return NextResponse.redirect(new URL('/deputy', req.url));
    }
    if (role !== 'deo') {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }

  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next|.*\\..*).*)', '/'] };
