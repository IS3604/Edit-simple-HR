import Link from 'next/link';
import { Search } from 'lucide-react';

/** GET-form filter bar (works without JS, keeps URLs shareable). */
export function FilterBar({
  q,
  placeholder,
  selects,
  clearHref,
  active,
}: {
  q: string;
  placeholder: string;
  selects: { name: string; value: string; label: string; options: { value: string; label: string }[] }[];
  clearHref: string;
  active: boolean;
}) {
  return (
    <form className="mb-4 flex flex-wrap items-center gap-2" role="search">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <input name="q" defaultValue={q} placeholder={placeholder} className="input pl-9" aria-label="Search" />
      </div>
      {selects.map((s) => (
        <select key={s.name} name={s.name} defaultValue={s.value} className="input w-auto" aria-label={s.label}>
          {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
      <button type="submit" className="h-9 rounded-lg border border-line bg-white px-3.5 text-sm font-medium shadow-xs hover:bg-canvas">Apply</button>
      {active && <Link href={clearHref} className="px-2 text-sm text-ink-500 hover:text-ink">Clear</Link>}
    </form>
  );
}
