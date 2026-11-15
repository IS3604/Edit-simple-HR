type Tone = 'neutral' | 'brand' | 'success' | 'muted';

const tones: Record<Tone, string> = {
  neutral: 'bg-canvas text-ink-600 border-line',
  brand: 'bg-brand-50 text-brand-700 border-brand-100',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  muted: 'bg-zinc-50 text-zinc-500 border-zinc-200',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
