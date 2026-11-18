'use server';

import { requireProfile } from '@/lib/auth';
import type { ActionState } from '@/lib/types';
import { decideRequest } from '../requests/actions';
import { cancelRequest } from '../leave/actions';
import { editGrant, grantSpecial, revokeGrant } from '../grants/actions';
import { setEmployeeStatus, updateEmployee } from '../employees/actions';
import { addHoliday, deleteHoliday } from '../holidays/actions';

/**
 * Runs a change the Superadmin confirmed in an Ask HR AI card, through the SAME server
 * actions the app's pages use — so every validation, permission check and DB rule applies.
 */
export async function executeProposal(kind: string, fields: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
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
