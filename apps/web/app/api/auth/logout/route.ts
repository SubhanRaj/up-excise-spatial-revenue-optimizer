import { NextResponse } from 'next/server';
import { deleteSession } from '@/lib/auth';
import { withErrorHandling } from '@/lib/with-error-handling';


async function POST_(): Promise<NextResponse> {
  await deleteSession();
  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandling('auth/logout:POST', POST_);
