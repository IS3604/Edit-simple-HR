export type Role = 'superadmin' | 'admin' | 'employee';

export const ROLES: Role[] = ['superadmin', 'admin', 'employee'];

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  employee: 'Employee',
};

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
};

/** Signed-in user: profile + linked employee record (if any). */
export type Me = Profile & {
  employee: { id: string; status: 'active' | 'inactive'; category: 'permanent_wfh' | 'office' | 'hybrid' } | null;
};

export type ActionState = { error?: string; success?: string } | undefined;

export type EmployeeCategory = 'permanent_wfh' | 'office' | 'hybrid';
export type EmployeeStatus = 'active' | 'inactive';

export const CATEGORIES: EmployeeCategory[] = ['office', 'hybrid', 'permanent_wfh'];

export const CATEGORY_LABEL: Record<EmployeeCategory, string> = {
  permanent_wfh: 'Permanent WFH',
  office: 'Office',
  hybrid: 'Hybrid',
};

export type Employee = {
  id: string;
  profile_id: string | null;
  employee_code: string;
  full_name: string;
  email: string;
  department: string;
  designation: string;
  joining_date: string;
  category: EmployeeCategory;
  status: EmployeeStatus;
};

export const EMPLOYEE_COLUMNS =
  'id, profile_id, employee_code, full_name, email, department, designation, joining_date, category, status';

export type LeaveType = 'casual' | 'earned' | 'wfh';
export type TxnKind = 'monthly_credit' | 'special_grant' | 'debit' | 'expiry' | 'adjustment';

export const LEAVE_LABEL: Record<LeaveType, string> = { casual: 'Casual Leave', earned: 'Earned Leave', wfh: 'WFH' };
export const LEAVE_SHORT: Record<LeaveType, string> = { casual: 'CL', earned: 'EL', wfh: 'WFH' };
export const TXN_LABEL: Record<TxnKind, string> = {
  monthly_credit: 'Monthly credit',
  special_grant: 'Special grant',
  debit: 'Leave taken',
  expiry: 'Expired',
  adjustment: 'Adjustment',
};

export type LeaveOverview = {
  employee_id: string;
  full_name: string;
  employee_code: string;
  email: string;
  department: string;
  category: EmployeeCategory;
  status: EmployeeStatus;
  casual_per_month: number;
  earned_per_month: number;
  wfh_per_month: number;
  casual: number;
  earned: number;
  wfh: number;
  pending_casual: number;
  pending_earned: number;
  pending_wfh: number;
};

export type LeaveTxn = {
  id: number;
  leave_type: LeaveType;
  kind: TxnKind;
  amount: number;
  balance_after: number;
  note: string;
  created_at: string;
};

export const EL_CAP = 20;

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled',
};

export type LeaveRequest = {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: RequestStatus;
  decision_note: string;
  created_at: string;
  decided_at: string | null;
  employee?: { id: string; full_name: string; employee_code: string } | null;
  decider?: { full_name: string } | null;
};

export const REQUEST_COLUMNS =
  'id, employee_id, leave_type, start_date, end_date, days, reason, status, decision_note, created_at, decided_at, ' +
  'employee:employees!leave_requests_employee_id_fkey(id, full_name, employee_code), ' +
  'decider:profiles!leave_requests_decided_by_fkey(full_name)';

export type HrOverview = {
  total: number; permanent_wfh: number; office: number; hybrid: number;
  on_leave_today: number; wfh_today: number; pending_leave: number; pending_wfh: number; today: string;
};
