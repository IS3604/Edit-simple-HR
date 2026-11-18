import type { Proposal } from './tools';

/** In "smart auto", these still need a confirmation card. Everything else runs automatically. */
export function isRisky(p: Proposal): boolean {
  const f = p.fields;
  switch (p.kind) {
    case 'add_employee': return true;                                   // creates a login
    case 'balance_change': return f.direction === 'deduct';
    case 'decide_request': return f.decision === 'reject';
    case 'cancel_request': return true;
    case 'revoke_grant': return true;
    case 'edit_grant': return Math.abs(Number(f.new_days)) < Math.abs(Number(f.days)); // takes days back
    case 'set_status': return f.status === 'inactive';
    case 'remove_holiday': return true;
    case 'set_allocation': return ((f.rows as unknown[]) ?? []).length > 1;          // bulk change
    default: return false;                                             // edit employee, add days, approve, add holiday, one allocation
  }
}

export type AiMode = 'manual' | 'smart' | 'auto';
export const shouldAutoRun = (mode: AiMode, p: Proposal) => mode === 'auto' || (mode === 'smart' && !isRisky(p));
