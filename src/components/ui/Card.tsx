export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-xl border border-line bg-white shadow-soft ${className}`}>{children}</div>;
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
