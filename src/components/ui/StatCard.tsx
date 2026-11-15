import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export function StatCard({
  label,
  value,
  href,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: number | string;
  href?: string;
  icon?: LucideIcon;
  accent?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-ink-500">{label}</p>
        {Icon && (
          <span className={`grid h-7 w-7 place-items-center rounded-md ${accent ? 'bg-brand-50 text-brand-700' : 'bg-zinc-100 text-ink-500'}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </div>
      <p className="mt-3 text-[26px] font-semibold leading-none  tabular-nums">{value}</p>
    </>
  );
  const cls = 'block rounded-lg border border-line bg-white p-4 shadow-soft transition-colors';
  return href ? (
    <Link href={href} className={`${cls} hover:border-ink-300`}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
