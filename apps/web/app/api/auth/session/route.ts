import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { withErrorHandling } from '@/lib/with-error-handling';


async function GET_(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({
    deoId:        session.deoId,
    name:         session.name,
    role:         session.role,
    districtName: session.districtName,
  });
}

export const GET = withErrorHandling('auth/session:GET', GET_);
