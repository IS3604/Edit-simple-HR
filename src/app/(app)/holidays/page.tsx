import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { CardHeader } from '@/components/ui/Card';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { todayIST } from '@/lib/leave-utils';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { AddHolidayForm, DeleteHolidayButton, WeekendForm } from './HolidayForms';

export const metadata = { title: 'Holidays' };

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
        <Card className={`overflow-hidden ${isSuper ? 'lg:col-span-3' : 'lg:col-span-5 lg:max-w-2xl'}`}>
          <CardHeader
            title={`${year} holidays`}
            description={`${(hols ?? []).length} day${(hols ?? []).length === 1 ? '' : 's'}`}
            action={
              <div className="flex gap-1">
                <Link href={`/holidays?year=${year - 1}`} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-500 hover:bg-canvas" aria-label="Previous year"><ChevronLeft className="h-4 w-4" /></Link>
                <Link href={`/holidays?year=${year + 1}`} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-500 hover:bg-canvas" aria-label="Next year"><ChevronRight className="h-4 w-4" /></Link>
              </div>
            }
          />
          {(hols ?? []).length === 0 ? (
            <EmptyState icon={CalendarDays} title={`No holidays added for ${year}`} />
          ) : (
            <ul className="divide-y divide-line">
              {(hols ?? []).map((h) => {
                const d = new Date(`${h.holiday_date}T00:00:00Z`);
                const past = h.holiday_date < todayIST();
                return (
                <li key={h.id} className={`flex items-center justify-between gap-4 px-5 py-3 text-sm ${past ? 'opacity-55' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className="grid w-11 shrink-0 overflow-hidden rounded-lg border border-line text-center leading-none">
                      <span className="bg-brand-50 py-0.5 text-2xs font-semibold uppercase text-brand-700">{d.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' })}</span>
                      <span className="py-1.5 text-base font-semibold">{d.getUTCDate()}</span>
                    </div>
                    <div>
                      <p className="font-medium">{h.name}</p>
                      <p className="text-xs text-ink-500">{d.toLocaleString('en-IN', { weekday: 'long', timeZone: 'UTC' })}</p>
                    </div>
                  </div>
                  {isSuper && <DeleteHolidayButton id={h.id} />}
                </li>
              );})}
            </ul>
          )}
        </Card>
        {isSuper && (
          <div className="space-y-6 lg:sticky lg:top-6 lg:col-span-2">
            <Card className="overflow-hidden">
              <CardHeader title="Add holiday" />
              <div className="p-5"><AddHolidayForm /></div>
            </Card>
            <Card className="overflow-hidden">
              <CardHeader title="Weekend days" description="Not counted as leave. Doesn’t change approved requests." />
              <div className="p-5"><WeekendForm current={weekend} /></div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
