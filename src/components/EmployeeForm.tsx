'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { useActionToast } from '@/components/ui/Toaster';
import { CATEGORIES, CATEGORY_LABEL, ROLES, ROLE_LABEL, type ActionState, type Employee } from '@/lib/types';

type Props = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  employee?: Employee; // present = edit mode
};

export function EmployeeForm({ action, employee }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const isNew = !employee;
  useActionToast(state);

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
            <p className="input flex items-center bg-canvas text-ink-500">{employee.email}</p>
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
        <div className="rounded-lg border border-dashed border-line bg-zinc-50/60 p-4">
          <Field
            label="Temporary password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 10 characters"
          />
          <p className="hint">
            Share it securely; the employee can change it under My account. Leave blank only if this email already has a login.
          </p>
        </div>
      )}

      <FormMessage state={state} />
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
        <Button type="submit" loading={pending}>
          {isNew ? 'Add employee' : 'Save changes'}
        </Button>
        {isNew && (
          <Link href="/employees" className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-ink-500 hover:bg-black/[0.04] hover:text-ink">Cancel</Link>
        )}
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
