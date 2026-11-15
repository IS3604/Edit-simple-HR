const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Formats a YYYY-MM-DD date string without timezone drift. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

/** 1 → "1", 1.5 → "1.5", "2.0" → "2" */
export function days(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

const dtFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
export function formatTimestamp(ts: string): string {
  return dtFmt.format(new Date(ts));
}
