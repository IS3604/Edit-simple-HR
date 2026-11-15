'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { CATEGORIES, CATEGORY_LABEL, ROLES, ROLE_LABEL, type ActionState, type Employee } from '@/lib/types';

type Props = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  employee?: Employee; // present = edit mode
};

export function EmployeeForm({ action, employee }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const isNew = !employee;

  return (
    <form action={formAction} className="space-y-6">
      {employee && <input type="hidden" name="id" value={employee.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" name="full_name" defaultValue={employee?.full_name} required />
        <Field label="Employee ID" name="employee_code" defaultValue={employee?.employee_code} required placeholder="ES-014" />
        {isNew ? (
          <Field label="Work email" name="email" type="email" required placeholder="name@editsimple.com" />
        ) : (
          <div>
            <span className="label">Work email</span>
            <p className="input bg-canvas text-ink-500">{employee.email}</p>
          </div>
        )}
        <Field label="Joining date" name="joining_date" type="date" defaultValue={employee?.joining_date} required />
        <Field label="Department" name="department" defaultValue={employee?.department} placeholder="Design" />
        <Field label="Designation" name="designation" defaultValue={employee?.designation} placeholder="Video Editor" />
        <div>
          <label htmlFor="category" className="label">Category</label>
          <select id="category" name="category" defaultValue={employee?.category ?? ''} required className="input">
            <option value="" disabled>Select…</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </select>
        </div>
        {isNew && (
          <div>
            <label htmlFor="role" className="label">Portal role</label>
            <select id="role" name="role" defaultValue="employee" className="input">
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {isNew && (
        <div className="rounded-lg border border-line bg-canvas p-4">
          <Field
            label="Temporary password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 10 characters"
          />
          <p className="mt-2 text-xs text-ink-500">
            Share it securely; the employee can change it under My account. Leave blank only if this email already has a login.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : isNew ? 'Add employee' : 'Save changes'}
        </Button>
        {isNew && (
          <Link href="/employees" className="text-sm text-ink-500 hover:text-ink">Cancel</Link>
        )}
        <FormMessage state={state} />
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  ...rest
}: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <input id={name} name={name} className="input" {...rest} />
    </div>
  );
}
