import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth';
import { Card } from '@/components/ui/Card';
import { LoginForm } from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const profile = await getCurrentProfile();
  if (profile?.is_active) redirect('/');

  const { error } = await searchParams;
  const initialError = error === 'inactive' ? 'Your account is inactive. Please contact HR.' : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image src="/logo.png" alt="EditSimple" width={120} height={72} priority />
          <p className="text-sm text-ink-500">HR Portal</p>
        </div>
        <Card className="p-6">
          <h1 className="mb-5 text-base font-semibold">Sign in</h1>
          <LoginForm initialError={initialError} />
        </Card>
        <p className="mt-6 text-center text-xs text-ink-400">
          Accounts are created by HR. Forgot your password? Contact your Superadmin.
        </p>
      </div>
    </main>
  );
}
