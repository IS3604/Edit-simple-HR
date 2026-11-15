import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmployeeForm } from '@/components/EmployeeForm';
import { createEmployee } from '../actions';

export const metadata = { title: 'Add employee' };

export default async function NewEmployeePage() {
  await requireProfile(['superadmin']);
  return (
    <>
      <Link href="/employees" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-500 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Employees
      </Link>
      <PageHeader title="Add employee" description="Creates the HR record and a sign-in for the employee." />
      <Card className="max-w-3xl overflow-hidden">
        <CardHeader title="Employee details" />
        <div className="p-5"><EmployeeForm action={createEmployee} /></div>
      </Card>
    </>
  );
}
