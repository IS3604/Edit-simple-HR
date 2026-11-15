import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { UserRow } from './UserRow';

export default async function UsersPage() {
  const me = await requireProfile(['superadmin']);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active')
    .order('role')
    .order('email');

  const users = (data ?? []) as Profile[];

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Set who is a Superadmin, Admin or Employee, and who can sign in."
      />
      <Card className="overflow-x-auto">
        {error ? (
          <p className="p-6 text-sm text-red-600">Could not load users. Refresh to try again.</p>
        ) : users.length === 0 ? (
          <p className="p-6 text-sm text-ink-500">No users yet.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" colSpan={2}>Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <UserRow key={u.id} user={u} isSelf={u.id === me.id} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="mt-4 text-xs text-ink-400">
        New users are added from Employees. Inactive users are blocked from signing in.
      </p>
    </>
  );
}
