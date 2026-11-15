import { requireProfile } from '@/lib/auth';
import { CATEGORY_LABEL, ROLE_LABEL } from '@/lib/types';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { PasswordChangeForm } from './PasswordChangeForm';
import { NotificationSettings } from './NotificationSettings';

export const metadata = { title: 'My account' };

export default async function AccountPage() {
  const me = await requireProfile();
  const name = me.full_name || me.email;
  return (
    <>
      <PageHeader title="My account" />
      <div className="grid max-w-4xl items-start gap-6 md:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <Avatar name={name} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{name}</p>
              <p className="truncate text-sm text-ink-500">{me.email}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="brand">{ROLE_LABEL[me.role]}</Badge>
                {me.employee && <Badge>{CATEGORY_LABEL[me.employee.category]}</Badge>}
              </div>
            </div>
          </div>
          <p className="mt-5 border-t border-line pt-4 text-xs text-ink-500">Need to change your name or email? Ask a Superadmin.</p>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Change password" description="At least 10 characters" />
          <div className="p-5"><PasswordChangeForm /></div>
        </Card>
        <Card className="overflow-hidden md:col-span-2">
          <CardHeader title="Notifications" description="Browser push notifications for this device" />
          <div className="p-5"><NotificationSettings superadmin={me.role === 'superadmin'} /></div>
        </Card>
      </div>
    </>
  );
}
