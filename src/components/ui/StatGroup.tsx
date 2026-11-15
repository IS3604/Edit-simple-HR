import Link from 'next/link';

type Stat = { label: string; value: number | string; href?: string; tone?: 'default' | 'attention' };

/** A row of stats in one bordered panel, separated by dividers. */
export function StatGroup({ title, stats }: { title?: string; stats: Stat[] }) {
  return (
    <section>
      {title && <h2 className="mb-2 text-[13px] font-medium text-ink-500">{title}</h2>}
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-white sm:grid-cols-4">
        {stats.map((s, i) => {
          const body = (
            <>
              <p className="text-[13px] text-ink-500">{s.label}</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${s.tone === 'attention' && Number(s.value) > 0 ? 'text-brand-700' : 'text-ink'}`}>{s.value}</p>
            </>
          );
          const cls = `block px-4 py-3.5 ${i % 2 === 1 ? 'border-l' : ''} ${i >= 2 ? 'border-t sm:border-t-0' : ''} ${i > 0 ? 'sm:border-l' : ''} border-line`;
          return s.href ? (
            <Link key={s.label} href={s.href} className={`${cls} transition-colors hover:bg-zinc-50`}>{body}</Link>
          ) : (
            <div key={s.label} className={cls}>{body}</div>
          );
        })}
      </div>
    </section>
  );
}
