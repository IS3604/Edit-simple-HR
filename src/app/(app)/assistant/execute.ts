'use server';

import { requireProfile } from '@/lib/auth';
import type { ActionState } from '@/lib/types';
import { decideRequest } from '../requests/actions';
import { cancelRequest } from '../leave/actions';
import { editGrant, grantSpecial, revokeGrant } from '../grants/actions';
import { createEmployeeFromChat, saveAllocation, setEmployeeStatus, updateEmployee } from '../employees/actions';
import { randomInt } from 'node:crypto';
import { addHoliday, deleteHoliday } from '../holidays/actions';

/**
 * Runs a change the Superadmin confirmed in an Ask HR AI card, through the SAME server
 * actions the app's pages use — so every validation, permission check and DB rule applies.
 */
export async function executeProposal(kind: string, fields: Record<string, unknown>): Promise<{ ok: boolean; message: string; password?: string; link?: string }> {
  await requireProfile(['superadmin']);
  const fd = new FormData();
  const put = (o: Record<string, unknown>) => { for (const [k, v] of Object.entries(o)) fd.set(k, String(v ?? '')); };
  const f = fields;
  let r: ActionState;
  switch (kind) {
    case 'balance_change':
      put({ employee_id: f.employee_id, leave_type: f.leave_type, direction: f.direction, days: f.days, reason: f.reason });
      r = await grantSpecial(undefined, fd); break;
    case 'decide_request':
      put({ id: f.request_id, decision: f.decision, note: f.note });
      r = await decideRequest(undefined, fd); break;
    case 'cancel_request':
      put({ id: f.request_id });
      r = await cancelRequest(undefined, fd); break;
    case 'revoke_grant':
      put({ id: f.grant_id });
      r = await revokeGrant(undefined, fd); break;
    case 'edit_grant':
      put({ id: f.grant_id, sign: Number(f.days) < 0 ? '-' : '+', days: f.new_days, reason: f.reason });
      r = await editGrant(undefined, fd); break;
    case 'edit_employee':
      put({ id: f.employee_id, full_name: f.full_name, employee_code: f.employee_code, department: f.department, designation: f.designation, joining_date: f.joining_date, category: f.category });
      r = await updateEmployee(undefined, fd); break;
    case 'set_status':
      put({ id: f.employee_id, status: f.status });
      r = await setEmployeeStatus(undefined, fd); break;
    case 'set_allocation': {
      const rows = (f.rows as { employee_id: string; employee: string; permanent_wfh: boolean }[]) ?? [];
      const failed: string[] = []; let credited = 0;
      for (const row of rows) {
        const one = new FormData();
        one.set('id', row.employee_id); one.set('casual', String(f.casual)); one.set('earned', String(f.earned)); one.set('wfh', row.permanent_wfh ? '0' : String(f.wfh)); // card edits apply to every row
        const res = await saveAllocation(undefined, one);
        if (res?.error) failed.push(`${row.employee}: ${res.error}`);
        else if (res?.success?.includes('credited')) credited++;
      }
      if (failed.length === rows.length) return { ok: false, message: failed.join(' · ') };
      const done = rows.length - failed.length;
      return { ok: failed.length === 0, message: `Allocation set for ${done} employee${done === 1 ? '' : 's'}${credited ? ` (${credited} credited for this month)` : ''}.${failed.length ? ` Failed: ${failed.join(' · ')}` : ''}` };
    }
    case 'add_employee': {
      // Automatic run: generate a strong one-time password (shown once to the Superadmin, never to the AI).
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
      const password = String(f.password ?? '') || Array.from({ length: 14 }, () => chars[randomInt(chars.length)]).join('');
      put({ ...f, password });
      const res = await createEmployeeFromChat(fd);
      if (res.error || !res.id) return { ok: false, message: res.error ?? 'Could not add the employee.' };
      return {
        ok: true, link: `/employees/${res.id}`,
        message: `${res.name} (${res.code}) added${res.linked ? ' and linked to their existing login' : ''}.`,
        password: res.linked ? undefined : password,
      };
    }
    case 'add_holiday':
      put({ holiday_date: f.date, name: f.name });
      r = await addHoliday(undefined, fd); break;
    case 'remove_holiday':
      put({ id: f.holiday_id });
      r = await deleteHoliday(undefined, fd); break;
    default:
      return { ok: false, message: 'Unknown action.' };
  }
  if (r?.error) return { ok: false, message: r.error };
  return { ok: true, message: r?.success ?? 'Done.' };
}
