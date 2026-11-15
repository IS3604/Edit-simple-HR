import type { ActionState } from '@/lib/types';

/** Inline error under a form (successes are shown as toasts). */
export function FormMessage({ state }: { state: ActionState }) {
  if (state?.error) return <p role="alert" className="text-[13px] text-red-600">{state.error}</p>;
  return null;
}
