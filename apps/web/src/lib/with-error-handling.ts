import { NextRequest, NextResponse } from 'next/server';

type Handler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<NextResponse>;

// Wraps a route handler so an unexpected error (a D1 blip, a thrown exception) comes back as
// this app's own `{ error }` JSON 500 (per CLAUDE.md's error format contract) instead of
// bubbling up to Next's default handler, which doesn't return JSON and breaks every client-side
// `res.json()` caller. Doesn't replace a route's own validation/expected-error responses (400,
// 401, 403, 404, 409, ...) — those are ordinary early `return`s from inside the handler and pass
// through untouched; this only catches what nothing anticipated. `routeName` is just a label for
// the server log line, not shown to the client.
export function withErrorHandling<Ctx = unknown>(routeName: string, handler: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      console.error(`${routeName} failed:`, err);
      return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 });
    }
  };
}
