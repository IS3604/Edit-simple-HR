import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmployeeForm } from '@/components/EmployeeForm';
import { createEmployee } from '../actions';

export default async function NewEmployeePage() {
  await requireProfile(['superadmin']);
  return (
    <>
      <Link href="/employees" className="mb-4 inline-block text-sm text-ink-500 hover:text-ink">← Employees</Link>
      <PageHeader title="Add employee" description="Creates the HR record and a sign-in for the employee." />
      <Card className="max-w-3xl p-6">
        <EmployeeForm action={createEmployee} />
      </Card>
    </>
  );
}
