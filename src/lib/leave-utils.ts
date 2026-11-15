/** Client-side preview of working days (the database recalculates authoritatively). */
export function countWorkingDays(start: string, end: string, weekendDays: number[], holidays: Set<string>): number {
  if (!start || !end || end < start) return 0;
  let n = 0;
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  for (let i = 0; d <= last && i < 400; i++) {
    const iso = d.toISOString().slice(0, 10);
    if (!weekendDays.includes(d.getUTCDay()) && !holidays.has(iso)) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

export function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}
