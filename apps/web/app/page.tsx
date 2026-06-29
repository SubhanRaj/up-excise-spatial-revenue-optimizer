export const dynamic = 'force-dynamic';

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function RootPage() {
  // auth() parses the JWT locally — no Clerk backend API call, works on CF edge
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect('/login');

  const role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role;
  if (role === 'admin') redirect('/admin');
  redirect('/home');
}
