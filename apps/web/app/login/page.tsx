import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import LoginForm from './_components/LoginForm';

export default async function LoginPage() {
  const { userId, sessionClaims } = await auth();
  if (userId) {
    const role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role;
    if (role === 'admin') redirect('/admin');
    if (role === 'deo') redirect('/home');
    // authenticated but no role provisioned — fall through and show form with notice
    return (
      <main className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="card bg-base-100 shadow-xl p-8 w-full max-w-md text-center">
          <p className="font-semibold mb-2">Account not provisioned</p>
          <p className="text-sm text-base-content/60">Contact your administrator to assign your role.</p>
        </div>
      </main>
    );
  }
  return <LoginForm />;
}
