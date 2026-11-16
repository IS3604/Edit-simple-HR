import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { todayIST } from '@/lib/leave-utils';
import { CalendarView, type Entry } from './CalendarView';

export const metadata = { title: 'Team calendar' };

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const me = await requireProfile();
  const staff = me.role !== 'employee';
  const sp = await searchParams;
  const today = todayIST();
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? '') ? sp.m! : today.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const gridStart = new Date(first); gridStart.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  const gridEnd = new Date(last); gridEnd.setUTCDate(last.getUTCDate() + (6 - ((last.getUTCDay() + 6) % 7)));

  const supabase = await createClient();
  const [{ data: entries }, { data: hols }, { data: settings }] = await Promise.all([
    supabase.rpc('team_calendar', { p_from: iso(gridStart), p_to: iso(gridEnd) }),
    supabase.from('holidays').select('holiday_date, name').gte('holiday_date', iso(gridStart)).lte('holiday_date', iso(gridEnd)),
    supabase.from('app_settings').select('weekend_days').eq('id', 1).single(),
  ]);

  const days: string[] = [];
  for (const d = new Date(gridStart); d <= gridEnd; d.setUTCDate(d.getUTCDate() + 1)) days.push(iso(d));

  const props = {
    month,
    today,
    days,
    entries: (entries ?? []) as Entry[],
    holidays: Object.fromEntries((hols ?? []).map((h) => [h.holiday_date as string, h.name as string])),
    weekend: (settings?.weekend_days as number[]) ?? [0, 6],
    staff,
    prevHref: `/calendar?m=${new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7)}`,
    nextHref: `/calendar?m=${new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7)}`,
    isCurrentMonth: month === today.slice(0, 7),
  };

  return (
    <CalendarView {...props} />
  );
}
