export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-xl border border-line bg-white shadow-soft ${className}`}>{children}</div>;
}
