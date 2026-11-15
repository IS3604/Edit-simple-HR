'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  CalendarCheck2, CalendarDays, CalendarRange, ClipboardCheck, Gift, LayoutDashboard, LogOut, Menu, Scale, Settings2,
  ShieldCheck, Users, X, type LucideIcon,
} from 'lucide-react';
import type { NavGroup, NavIcon } from '@/lib/nav';
import { ROLE_LABEL, type Role } from '@/lib/types';
import { Avatar } from '@/components/ui/Avatar';
import { signOut } from '@/app/login/actions';

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard, leave: CalendarCheck2, requests: ClipboardCheck, calendar: CalendarRange, employees: Users,
  balances: Scale, grants: Gift, holidays: CalendarDays, users: ShieldCheck, account: Settings2,
};

type Props = {
  groups: NavGroup[];
  user: { name: string; email: string; role: Role };
  pendingCount: number;
};

export function Sidebar({ groups, user, pendingCount }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

  const nav = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2" aria-label="Main">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.label && <p className="mb-1 px-3 text-xs font-medium text-ink-400">{g.label}</p>}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    prefetch
                    aria-current={active ? 'page' : undefined}
                    className={`group relative flex h-9 items-center gap-2.5 rounded-md px-3 text-sm transition-colors ${
                      active ? 'bg-brand-50 font-medium text-ink' : 'text-ink-600 hover:bg-zinc-100 hover:text-ink'
                    }`}
                  >
                    {active && <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r bg-brand" aria-hidden />}
                    <Icon className={`h-4 w-4 ${active ? 'text-brand-700' : 'text-ink-400 group-hover:text-ink-600'}`} strokeWidth={1.75} aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    {item.href === '/requests' && pendingCount > 0 && (
                      <span className="rounded-full bg-brand px-1.5 text-2xs font-semibold leading-[18px] text-white">{pendingCount}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const userBlock = (
    <div className="border-t border-line p-3">
      <Link href="/account" className={`flex items-center gap-2.5 rounded-lg p-2 transition-colors hover:bg-zinc-100 ${isActive('/account') ? 'bg-black/[0.04]' : ''}`}>
        <Avatar name={user.name} size="sm" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>
          <p className="truncate text-2xs text-ink-500">{ROLE_LABEL[user.role]}</p>
        </div>
        <Settings2 className="h-4 w-4 text-ink-400" aria-label="Account settings" />
      </Link>
      <form action={signOut}>
        <button type="submit" className="mt-1 flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-ink-500 transition-colors hover:bg-zinc-100 hover:text-ink">
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </button>
      </form>
    </div>
  );

  const brand = (
    <Link href="/" className="flex h-16 items-center px-5" aria-label="EditSimple HR — home">
      <Image src="/logo.png" alt="EditSimple" width={72} height={43} priority className="h-auto w-[72px]" />
    </Link>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
        <Image src="/logo.png" alt="EditSimple" width={60} height={36} className="h-auto w-[60px]" />
        <button type="button" onClick={() => setOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg text-ink-600 hover:bg-zinc-100" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 animate-pop-in flex-col bg-sidebar shadow-pop">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-zinc-100" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            {userBlock}
          </aside>
        </div>
      )}

      {/* Desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-sidebar lg:flex">
        {brand}
        {nav}
        {userBlock}
      </aside>
    </>
  );
}
