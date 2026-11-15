import Image from 'next/image';
import { redirect } from 'next/navigation';
import { CalendarCheck2, ShieldCheck, Sparkles } from 'lucide-react';
import { getCurrentProfile } from '@/lib/auth';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const profile = await getCurrentProfile();
  if (profile?.is_active) redirect('/');

  const { error } = await searchParams;
  const initialError = error === 'inactive' ? 'Your account is inactive. Please contact HR.' : undefined;

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand/25 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-brand/10 blur-3xl" aria-hidden />
        <Image src="/logo-light.png" alt="EditSimple" width={110} height={66} priority className="relative h-auto w-[110px]" />
        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Leave, WFH and approvals — in one simple place.</h2>
          <ul className="mt-8 space-y-4 text-sm text-white/75">
            <li className="flex items-center gap-3"><CalendarCheck2 className="h-4 w-4 text-brand" /> Apply and track leave in seconds</li>
            <li className="flex items-center gap-3"><Sparkles className="h-4 w-4 text-brand" /> Balances update automatically every month</li>
            <li className="flex items-center gap-3"><ShieldCheck className="h-4 w-4 text-brand" /> Private by default — you only see what you should</li>
          </ul>
          <p className="mt-12 text-xs text-white/40">© {new Date().getFullYear()} EditSimple · Internal use only</p>
        </div>
      </section>

      {/* Form */}
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[360px]">
          <Image src="/logo.png" alt="EditSimple" width={88} height={53} priority className="mb-10 h-auto w-[88px] lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1.5 text-sm text-ink-500">Sign in to the EditSimple HR portal.</p>
          <div className="mt-8"><LoginForm initialError={initialError} /></div>
          <p className="mt-8 text-xs text-ink-400">Accounts are created by HR. Forgot your password? Ask your Superadmin to reset it.</p>
        </div>
      </section>
    </main>
  );
}
