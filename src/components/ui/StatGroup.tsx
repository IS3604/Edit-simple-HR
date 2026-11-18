import Link from 'next/link';

type Stat = { label: string; value: number | string; href?: string; tone?: 'default' | 'attention' };

const ACCENTS = ['bg-brand', 'bg-sky-500', 'bg-violet-500', 'bg-rose-500', 'bg-emerald-500', 'bg-amber-500'];

/** A row of stat tiles, each with a small colour accent. */
export function StatGroup({ title, stats }: { title?: string; stats: Stat[] }) {
  return (
    <section>
      {title && <h2 className="mb-2 text-[13px] font-medium text-ink-500">{title}</h2>}
      <div className={`grid grid-cols-2 gap-3 ${stats.length >= 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
        {stats.map((s, i) => {
          const body = (
            <>
              <span aria-hidden className={`absolute left-0 top-4 h-6 w-[3px] rounded-r ${ACCENTS[i % ACCENTS.length]}`} />
              <p className="text-[13px] text-ink-500">{s.label}</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${s.tone === 'attention' && Number(s.value) > 0 ? 'text-brand-700' : 'text-ink'}`}>{s.value}</p>
            </>
          );
          const cls = 'relative block rounded-xl border border-line bg-white px-4 py-3.5 shadow-card';
          return s.href ? (
            <Link key={s.label} href={s.href} className={`${cls} transition-all hover:-translate-y-px hover:border-ink-300`}>{body}</Link>
          ) : (
            <div key={s.label} className={cls}>{body}</div>
          );
        })}
      </div>
    </section>
  );
}
