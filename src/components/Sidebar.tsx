'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { NavItem } from '@/lib/nav';
import { ROLE_LABEL, type Profile } from '@/lib/types';
import { signOut } from '@/app/login/actions';

export function Sidebar({ items, profile }: { items: NavItem[]; profile: Profile }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
        <Image src="/logo.png" alt="EditSimple" width={64} height={38} />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-line px-3 py-1.5 text-sm"
          aria-expanded={open}
          aria-controls="sidebar"
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </header>

      <aside
        id="sidebar"
        className={`${open ? 'block' : 'hidden'} fixed inset-x-0 top-[57px] z-20 border-b border-line bg-white lg:sticky lg:top-0 lg:block lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r`}
      >
        <div className="flex h-full flex-col">
          <div className="hidden px-6 pb-6 pt-7 lg:block">
            <Image src="/logo.png" alt="EditSimple" width={76} height={46} priority />
            <p className="mt-2 text-xs font-medium uppercase tracking-wider text-ink-400">HR Portal</p>
          </div>

          <nav className="flex-1 space-y-0.5 px-3 py-3 lg:py-0">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive(item.href)
                    ? 'bg-brand-50 font-medium text-brand-700'
                    : 'text-ink-600 hover:bg-canvas hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="border-t border-line px-4 py-4">
            <p className="truncate text-sm font-medium">{profile.full_name || profile.email}</p>
            <p className="truncate text-xs text-ink-500">{ROLE_LABEL[profile.role]}</p>
            <form action={signOut} className="mt-3">
              <button type="submit" className="text-xs font-medium text-ink-500 hover:text-brand-700">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
