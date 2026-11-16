import Image from 'next/image';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getCurrentProfile } from '@/lib/auth';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const profile = await getCurrentProfile();
  // Don't redirect while the sign-in action is responding — the form shows the success tick first.
  const fromAction = (await headers()).has('next-action');
  if (profile?.is_active && !fromAction) redirect('/');

  const { error } = await searchParams;
  const initialError = error === 'inactive' ? 'Your account is inactive. Please contact HR.' : undefined;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex justify-center">
          <Image src="/logo.png" alt="EditSimple" width={96} height={58} priority className="h-auto w-24" />
        </div>
        <div className="rounded-lg border border-line bg-white p-7 shadow-soft">
          <h1 className="text-lg font-semibold text-ink">Sign in to HR Portal</h1>
          <p className="mt-1 text-sm text-ink-500">Use your EditSimple work account.</p>
          <div className="mt-6"><LoginForm initialError={initialError} /></div>
        </div>
        <p className="mt-6 text-center text-xs text-ink-500">
          Trouble signing in? Contact your HR administrator.
        </p>
      </div>
    </main>
  );
}
