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
    return NextResponse.redirect(new URL('/login', req.url));
  }
  // DEO routes are deo-only now — an admin/superadmin session landing here (stale bookmark,
  // old tab) is sent to their own dashboard instead of rendering a broken "Unknown District"
  // DEO page. Previously admin/superadmin were let through as a bypass; that's what let it
  // render at all. See CLAUDE.md's "DEO Workflow" section.
  if (pathname.match(/^\/(home|upload|verify|units)/)) {
    if (role === 'admin' || role === 'superadmin') {
      return NextResponse.redirect(new URL('/admin', req.url));
    }
    if (role !== 'deo') {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }

  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next|.*\\..*).*)', '/'] };
