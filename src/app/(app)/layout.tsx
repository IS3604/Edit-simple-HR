import { isStaff, requireProfile } from '@/lib/auth';
import { navFor } from '@/lib/nav';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/Sidebar';
import { NotificationCenter } from '@/components/NotificationCenter';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireProfile();

  let pendingCount = 0;
  if (isStaff(me.role)) {
    const supabase = await createClient();
    const { count } = await supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    pendingCount = count ?? 0;
  }

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar
        groups={navFor(me.role)}
        user={{ name: me.full_name || me.email, email: me.email, role: me.role }}
        pendingCount={pendingCount}
      />
      <main className="min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <NotificationCenter />
    </div>
  );
}
