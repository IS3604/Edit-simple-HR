export function StatCard({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
    </>
  );
  const cls = 'block rounded-xl border border-line bg-white p-4 shadow-soft';
  return href ? <a href={href} className={`${cls} hover:border-brand-100`}>{body}</a> : <div className={cls}>{body}</div>;
}
