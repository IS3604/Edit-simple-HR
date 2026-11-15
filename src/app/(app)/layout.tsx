import { requireProfile } from '@/lib/auth';
import { NAV_ITEMS } from '@/lib/nav';
import { Sidebar } from '@/components/Sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const items = NAV_ITEMS.filter((i) => i.roles.includes(profile.role));

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar items={items} profile={profile} />
      <main className="flex-1 px-4 py-6 sm:px-8 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
