import { ShieldCheck } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TableScroll, Th } from '@/components/ui/Table';
import { UserRow } from './UserRow';

export const metadata = { title: 'Users & roles' };

export default async function UsersPage() {
  const me = await requireProfile(['superadmin']);
  const supabase = await createClient();
  const { data, error } = await supabase.from('profiles').select('id, email, full_name, role, is_active').order('role').order('email');
  const users = (data ?? []) as Profile[];

  return (
    <>
      <PageHeader title="Users & roles" description="Control who is a Superadmin, Admin or Employee, and who can sign in. New users are added from Employees." />
      <Card className="overflow-hidden">
        {error ? (
          <p className="p-6 text-sm text-red-600">Could not load users. Refresh to try again.</p>
        ) : users.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No users yet" />
        ) : (
          <TableScroll>
            <Table minWidth={680}>
              <thead><tr><Th>User</Th><Th>Role</Th><Th>Sign-in</Th><Th /></tr></thead>
              <tbody>{users.map((u) => <UserRow key={u.id} user={u} isSelf={u.id === me.id} />)}</tbody>
            </Table>
          </TableScroll>
        )}
      </Card>
      <div className="mt-4 grid gap-3 text-xs text-ink-500 sm:grid-cols-3">
        <p><span className="font-medium text-ink-700">Superadmin</span> — full control, allocations, grants, settings.</p>
        <p><span className="font-medium text-ink-700">Admin</span> — approves requests, views employees and balances.</p>
        <p><span className="font-medium text-ink-700">Employee</span> — own balances and requests only.</p>
      </div>
    </>
  );
}
