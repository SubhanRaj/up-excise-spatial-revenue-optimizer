import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import LoginForm from './_components/LoginForm';

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect(session.role === 'admin' ? '/admin' : '/home');
  }
  return <LoginForm />;
}
