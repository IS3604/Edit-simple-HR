'use client';

import { useRouter } from 'next/navigation';

/** Table row that navigates on click (links/buttons inside keep their own behaviour). */
export function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className="group cursor-pointer transition-colors hover:bg-zinc-50"
      onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button,input,select,textarea')) router.push(href); }}
      onMouseEnter={() => router.prefetch(href)}
    >
      {children}
    </tr>
  );
}
