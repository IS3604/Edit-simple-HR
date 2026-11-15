import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white shadow-xs hover:bg-brand-600 active:bg-brand-700',
  secondary: 'bg-white text-ink border border-line shadow-xs hover:bg-canvas hover:border-ink-300',
  ghost: 'text-ink-600 hover:bg-black/[0.04] hover:text-ink',
  danger: 'bg-white text-red-600 border border-red-200 shadow-xs hover:bg-red-50',
  success: 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700',
};
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-9 px-3.5 text-sm gap-2' };

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, className = '', children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-[background-color,border-color,color,transform] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

/** Link styled as a button (for navigation). */
export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = '') {
  return `inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors active:translate-y-px ${variants[variant]} ${sizes[size]} ${extra}`;
}
