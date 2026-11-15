import type { ActionState } from '@/lib/types';

export function FormMessage({ state }: { state: ActionState }) {
  if (state?.error) return <p role="alert" className="text-xs text-red-600">{state.error}</p>;
  if (state?.success) return <p role="status" className="text-xs text-emerald-700">{state.success}</p>;
  return null;
}
