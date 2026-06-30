import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export const runtime = 'edge';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({
    deoId:        session.deoId,
    name:         session.name,
    role:         session.role,
    districtName: session.districtName,
  });
}
