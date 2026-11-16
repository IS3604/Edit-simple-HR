import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { todayIST } from '@/lib/leave-utils';
import type { LeaveOverview } from '@/lib/types';
import type { ApplyContext } from '@/app/(app)/leave/ApplyForm';

export type ApplyBasics = { weekendDays: number[]; holidays: string[]; today: string };

/** Settings + holidays for the apply popup. Start it inside the page's Promise.all. */
export async function fetchApplyBasics(): Promise<ApplyBasics> {
  const today = todayIST();
  const year = Number(today.slice(0, 4));
  const supabase = await createClient();
  const [{ data: settings }, { data: hols }] = await Promise.all([
    supabase.from('app_settings').select('weekend_days').eq('id', 1).single(),
    supabase.from('holidays').select('holiday_date').gte('holiday_date', `${year}-01-01`).lte('holiday_date', `${year + 1}-12-31`),
  ]);
  return {
    weekendDays: (settings?.weekend_days as number[]) ?? [0, 6],
    holidays: (hols ?? []).map((h) => h.holiday_date as string),
    today,
  };
}

export function buildApplyContext(overview: LeaveOverview | null, basics: ApplyBasics): ApplyContext {
  const options = overview
    ? [
        { value: 'casual' as const, label: 'Casual Leave', available: Number(overview.casual) },
        { value: 'earned' as const, label: 'Earned Leave', available: Number(overview.earned) },
        ...(overview.category === 'permanent_wfh' ? [] : [{ value: 'wfh' as const, label: 'WFH', available: Number(overview.wfh) }]),
      ]
    : [];
  return { options, ...basics };
}
