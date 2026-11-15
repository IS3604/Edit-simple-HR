'use client';

import { useActionState } from 'react';
import { updateUserAccess } from './actions';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { FormMessage } from '@/components/ui/FormMessage';
import { ROLES, ROLE_LABEL, type Profile } from '@/lib/types';

export function UserRow({ user, isSelf }: { user: Profile; isSelf: boolean }) {
  const [state, action, pending] = useActionState(updateUserAccess, undefined);

  return (
    <tr className="align-middle">
      <td className="px-4 py-3">
        <p className="font-medium">{user.full_name || '—'}{isSelf && <span className="ml-2 text-xs text-ink-400">(you)</span>}</p>
        <p className="text-xs text-ink-500">{user.email}</p>
      </td>
      <td className="px-4 py-3">
        <Badge tone={user.is_active ? 'success' : 'muted'}>{user.is_active ? 'Active' : 'Inactive'}</Badge>
      </td>
      <td className="px-4 py-3" colSpan={2}>
        <form action={action} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={user.id} />
          <select
            name="role"
            defaultValue={user.role}
            disabled={isSelf || pending}
            className="input w-36 py-1.5"
            aria-label={`Role for ${user.email}`}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-ink-600">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={user.is_active}
              disabled={isSelf || pending}
              className="h-4 w-4 rounded border-line accent-brand"
            />
            Active
          </label>
          {!isSelf && (
            <Button type="submit" variant="secondary" disabled={pending} className="py-1.5">
              {pending ? 'Saving…' : 'Save'}
            </Button>
          )}
          <FormMessage state={state} />
        </form>
      </td>
    </tr>
  );
}
