import { requireProfile } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { PasswordChangeForm } from './PasswordChangeForm';

export default async function AccountPage() {
  const me = await requireProfile();
  return (
    <>
      <PageHeader title="My account" description={`${me.email} · ${ROLE_LABEL[me.role]}`} />
      <Card className="max-w-md p-6">
        <h2 className="mb-4 text-sm font-semibold">Change password</h2>
        <PasswordChangeForm />
      </Card>
    </>
  );
}
