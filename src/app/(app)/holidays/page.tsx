import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format';
import { todayIST } from '@/lib/leave-utils';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { AddHolidayForm, DeleteHolidayButton, WeekendForm } from './HolidayForms';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default async function HolidaysPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const me = await requireProfile();
  const sp = await searchParams;
  const thisYear = Number(todayIST().slice(0, 4));
  const year = Number(sp.year) >= 2000 && Number(sp.year) <= 2100 ? Number(sp.year) : thisYear;

  const supabase = await createClient();
  const [{ data: hols }, { data: settings }] = await Promise.all([
    supabase.from('holidays').select('id, holiday_date, name')
      .gte('holiday_date', `${year}-01-01`).lte('holiday_date', `${year}-12-31`).order('holiday_date'),
    supabase.from('app_settings').select('weekend_days').eq('id', 1).single(),
  ]);
  const weekend = ((settings?.weekend_days as number[]) ?? [0, 6]);
  const isSuper = me.role === 'superadmin';

  return (
    <>
      <PageHeader title="Holidays" description={`Non-working days: ${weekend.map((d) => DAY_NAMES[d]).join(', ') || 'none'}, plus the holidays below.`} />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="overflow-hidden lg:col-span-3">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="text-sm font-semibold">{year}</h2>
            <div className="flex gap-3 text-sm">
              <Link href={`/holidays?year=${year - 1}`} className="text-ink-500 hover:text-ink">← {year - 1}</Link>
              <Link href={`/holidays?year=${year + 1}`} className="text-ink-500 hover:text-ink">{year + 1} →</Link>
            </div>
          </div>
          {(hols ?? []).length === 0 ? (
            <p className="p-6 text-sm text-ink-500">No holidays added for {year}.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {(hols ?? []).map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{h.name}</p>
                    <p className="text-xs text-ink-500">{formatDate(h.holiday_date)}</p>
                  </div>
                  {isSuper && <DeleteHolidayButton id={h.id} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {isSuper && (
          <div className="space-y-6 lg:col-span-2">
            <Card className="p-6">
              <h2 className="mb-4 text-sm font-semibold">Add holiday</h2>
              <AddHolidayForm />
            </Card>
            <Card className="p-6">
              <h2 className="mb-1 text-sm font-semibold">Weekend days</h2>
              <p className="mb-4 text-xs text-ink-500">Not counted as leave days. Changes don’t alter already-approved requests.</p>
              <WeekendForm current={weekend} />
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
