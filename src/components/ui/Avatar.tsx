import Link from 'next/link';

const palette = ['bg-orange-100 text-orange-800', 'bg-sky-100 text-sky-800', 'bg-emerald-100 text-emerald-800',
  'bg-violet-100 text-violet-800', 'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-800'];

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
  const color = palette[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length];
  const dims = size === 'sm' ? 'h-7 w-7 text-[11px]' : size === 'lg' ? 'h-12 w-12 text-base' : 'h-8 w-8 text-xs';
  return (
    <span className={`inline-grid shrink-0 place-items-center rounded-full font-semibold ${dims} ${color}`} aria-hidden>
      {initials}
    </span>
  );
}

/** Avatar + name + secondary line, for table cells. */
export function PersonCell({ name, sub, href }: { name: string; sub?: string; href?: string }) {
  const nameEl = href ? (
    <Link href={href} className="truncate font-medium text-ink hover:text-brand-700">{name}</Link>
  ) : (
    <span className="truncate font-medium text-ink">{name}</span>
  );
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={name} size="sm" />
      <div className="min-w-0 leading-tight">
        {nameEl}
        {sub && <p className="mt-0.5 truncate text-xs text-ink-500">{sub}</p>}
      </div>
    </div>
  );
}
