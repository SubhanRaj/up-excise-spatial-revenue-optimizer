import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublic = createRouteMatcher(['/login(.*)', '/api/webhooks/clerk(.*)']);

const MAX_SESSION_MS = 24 * 60 * 60 * 1000; // ponytail: 24h enforced app-side; Clerk free tier caps at 7d

export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return NextResponse.next();

  await auth.protect();

  const { sessionClaims } = await auth();
  const loginUrl = new URL('/login', req.url);

  // Enforce 24-hour session window at application level
  if (sessionClaims?.iat) {
    const age = Date.now() - sessionClaims.iat * 1000;
    if (age > MAX_SESSION_MS) {
      loginUrl.searchParams.set('redirect_url', req.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  const role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role;
  const path = req.nextUrl.pathname;

  // Route group enforcement
  if (path.startsWith('/(deo)') || path.match(/^\/(upload|verify|units)/)) {
    if (role !== 'deo') return NextResponse.redirect(loginUrl);
  }
  if (path.startsWith('/(admin)') || path.match(/^\/(admin)/)) {
    if (role !== 'admin') return NextResponse.redirect(loginUrl);
  }
});

export const config = { matcher: ['/((?!_next|.*\\..*).*)', '/'] };
