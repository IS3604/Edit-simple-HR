import { isStaff, requireProfile } from '@/lib/auth';
import { navFor } from '@/lib/nav';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/Sidebar';
import { NotificationCenter } from '@/components/NotificationCenter';
import { LiveUpdates } from '@/components/LiveUpdates';

async function pendingCount() {
  const supabase = await createClient();
  const { count } = await supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  return count ?? 0;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Run in parallel (RLS limits employees to their own rows; the count is only shown to staff).
  const [me, pending] = await Promise.all([requireProfile(), pendingCount()]);

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar
        groups={navFor(me.role)}
        user={{ name: me.full_name || me.email, email: me.email, role: me.role }}
        pendingCount={isStaff(me.role) ? pending : 0}
      />
      <main className="relative min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-10">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-72 bg-[radial-gradient(60%_100%_at_70%_0%,rgba(232,98,47,0.07),transparent_70%),radial-gradient(40%_80%_at_10%_0%,rgba(56,189,248,0.05),transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl">{children}</div>
      </main>
      <NotificationCenter />
      <LiveUpdates />
    </div>
  );
}
