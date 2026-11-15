'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Loader2, Search } from 'lucide-react';

/** Filters update the URL as you type/select (shareable, back-button friendly). */
export function FilterBar({
  q, placeholder, selects, clearHref, active,
}: {
  q: string;
  placeholder: string;
  selects: { name: string; value: string; label: string; options: { value: string; label: string }[] }[];
  clearHref: string;
  active: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [text, setText] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false }));
  };

  useEffect(() => setText(q), [q]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" role="search">
      <div className="relative w-full sm:w-72">
        {pending
          ? <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-400" aria-hidden />
          : <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />}
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            clearTimeout(timer.current);
            const v = e.target.value.trim();
            timer.current = setTimeout(() => update('q', v), 250);
          }}
          placeholder={placeholder}
          className="input pl-9"
          aria-label="Search"
        />
      </div>
      {selects.map((s) => (
        <select key={s.name} value={s.value} onChange={(e) => update(s.name, e.target.value)} className="input w-auto" aria-label={s.label}>
          {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
      {active && <Link href={clearHref} className="px-2 text-sm text-ink-500 hover:text-ink">Clear filters</Link>}
    </div>
  );
}
