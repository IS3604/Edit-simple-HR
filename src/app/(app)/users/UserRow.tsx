'use client';

import { useActionState, useState } from 'react';
import { updateUserAccess } from './actions';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PersonCell } from '@/components/ui/Avatar';
import { Td, Tr } from '@/components/ui/Table';
import { useActionToast } from '@/components/ui/Toaster';
import { ROLES, ROLE_LABEL, type Profile, type Role } from '@/lib/types';

export function UserRow({ user, isSelf }: { user: Profile; isSelf: boolean }) {
  const [state, action, pending] = useActionState(updateUserAccess, undefined);
  useActionToast(state);
  const [role, setRole] = useState<Role>(user.role);
  const [active, setActive] = useState(user.is_active);
  const dirty = role !== user.role || active !== user.is_active;
  const formId = `user-${user.id}`;

  return (
    <Tr>
      <Td><PersonCell name={user.full_name || user.email} sub={isSelf ? `${user.email} · you` : user.email} /></Td>
      <Td>
        <select form={formId} name="role" value={role} onChange={(e) => setRole(e.target.value as Role)}
          disabled={isSelf || pending} className="input h-8 w-36 text-[13px]" aria-label={`Role for ${user.email}`}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </Td>
      <Td>
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input form={formId} type="checkbox" name="is_active" checked={active} onChange={(e) => setActive(e.target.checked)}
            disabled={isSelf || pending} className="peer sr-only" />
          <span className="relative h-5 w-9 rounded-full bg-zinc-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-emerald-500 peer-checked:after:translate-x-4 peer-focus-visible:ring-[3px] peer-focus-visible:ring-brand/25 peer-disabled:opacity-50" />
          <Badge tone={active ? 'success' : 'muted'}>{active ? 'Active' : 'Inactive'}</Badge>
        </label>
      </Td>
      <Td align="right">
        <form id={formId} action={action}>
          <input type="hidden" name="id" value={user.id} />
          {!isSelf && (
            <Button type="submit" size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty} loading={pending}>Save</Button>
          )}
        </form>
      </Td>
    </Tr>
  );
}
