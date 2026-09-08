import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { deputyBasePath } from '@/lib/deputy';
import LoginForm from './_components/LoginForm';

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect(
      session.role === 'admin' || session.role === 'superadmin' ? '/admin'
      : session.role === 'deputy' ? deputyBasePath(session.division)
      : '/home',
    );
  }
  return <LoginForm />;
}
