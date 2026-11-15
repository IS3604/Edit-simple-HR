type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'muted' | 'info';

const tones: Record<Tone, string> = {
  neutral: 'bg-stone-100 text-ink-600 ring-stone-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-100',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  warning: 'bg-amber-50 text-amber-700 ring-amber-100',
  danger: 'bg-red-50 text-red-700 ring-red-100',
  muted: 'bg-stone-50 text-ink-400 ring-stone-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-100',
};

export function Badge({ tone = 'neutral', dot = false, children }: { tone?: Tone; dot?: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />}
      {children}
    </span>
  );
}
