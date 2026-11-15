import { CATEGORIES, ROLES, type EmployeeCategory, type Role } from '@/lib/types';

export type EmployeeInput = {
  full_name: string;
  employee_code: string;
  department: string;
  designation: string;
  joining_date: string;
  category: EmployeeCategory;
};

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

function isValidDate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function parseEmployeeFields(fd: FormData): { data?: EmployeeInput; error?: string } {
  const data = {
    full_name: str(fd, 'full_name').replace(/\s+/g, ' '),
    employee_code: str(fd, 'employee_code').toUpperCase(),
    department: str(fd, 'department'),
    designation: str(fd, 'designation'),
    joining_date: str(fd, 'joining_date'),
    category: str(fd, 'category') as EmployeeCategory,
  };
  if (data.full_name.length < 2 || data.full_name.length > 100) return { error: 'Enter the full name (2–100 characters).' };
  if (!/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(data.employee_code))
    return { error: 'Employee ID: up to 20 letters, numbers, - or _.' };
  if (data.department.length > 80 || data.designation.length > 80) return { error: 'Department and designation must be under 80 characters.' };
  if (!isValidDate(data.joining_date)) return { error: 'Enter a valid joining date.' };
  if (!CATEGORIES.includes(data.category)) return { error: 'Choose a category.' };
  return { data };
}

export function parseNewEmployee(fd: FormData) {
  const base = parseEmployeeFields(fd);
  if (base.error) return { error: base.error };
  const email = str(fd, 'email').toLowerCase();
  const role = str(fd, 'role') as Role;
  const password = String(fd.get('password') ?? '');
  if (!EMAIL_RE.test(email) || email.length > 254) return { error: 'Enter a valid email address.' };
  if (!ROLES.includes(role)) return { error: 'Choose a role.' };
  return { data: { ...base.data!, email, role, password } };
}

export function validatePassword(pw: string): string | undefined {
  if (pw.length < 10) return 'Password must be at least 10 characters.';
  if (pw.length > 72) return 'Password must be 72 characters or fewer.';
  return undefined;
}

/** Maps Postgres unique-violation messages to friendly text. */
export function friendlyDbError(err: { code?: string; message?: string } | null): string {
  if (!err) return 'Something went wrong. Please try again.';
  // Business-rule errors raised by our database functions carry a user-ready message.
  if ((err.code === 'P0001' || err.code === '22023' || err.code === 'P0002') && err.message) return err.message;
  if (err.code === '23505') {
    if (err.message?.includes('employee_code')) return 'That Employee ID is already in use.';
    if (err.message?.includes('email')) return 'An employee with that email already exists.';
    if (err.message?.includes('profile_id')) return 'That login is already linked to another employee.';
    return 'That record already exists.';
  }
  if (err.code === '42501') return err.message?.replace(/^.*?:\s*/, '') || 'You are not allowed to do that.';
  if (err.message?.includes('Superadmin')) return 'At least one active Superadmin is required.';
  return 'Something went wrong. Please try again.';
}
