import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { days as fmtDays, formatDate } from '@/lib/format';
import { LEAVE_LABEL, type LeaveType } from '@/lib/types';

/**
 * Transactional email via Resend (https://resend.com). Optional:
 * if RESEND_API_KEY or EMAIL_FROM is missing, emails are skipped silently.
 * Called from next/server `after()` so it never slows down the UI.
 */
async function send(to: string[], subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const recipients = [...new Set(to.filter(Boolean))];
  if (!key || !from || recipients.length === 0) return;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: recipients, subject, html }),
    });
    if (!res.ok) console.error('[email] send failed', res.status, await res.text());
  } catch (err) {
    console.error('[email] send error', err);
  }
}

const appUrl = () => (process.env.APP_URL ?? '').replace(/\/$/, '');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function layout(title: string, rows: [string, string][], cta?: { label: string; path: string }, note?: string) {
  const url = appUrl();
  return `<!doctype html><html><body style="margin:0;background:#F7F6F4;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1C1917">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #E9E6E2;border-radius:12px">
    <tr><td style="padding:24px 28px 8px"><span style="font-weight:800;color:#EE6A3F">EDIT</span><span style="font-weight:800"> SIMPLE</span>
      <span style="color:#A8A29E;font-size:13px"> · HR</span></td></tr>
    <tr><td style="padding:8px 28px 4px;font-size:18px;font-weight:600">${esc(title)}</td></tr>
    <tr><td style="padding:12px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
        ${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#78716C;width:120px">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`).join('')}
      </table>
      ${note ? `<p style="font-size:13px;color:#57514C;margin:12px 0 0">${esc(note)}</p>` : ''}
    </td></tr>
    ${cta && url ? `<tr><td style="padding:12px 28px 28px"><a href="${url}${cta.path}" style="display:inline-block;background:#EE6A3F;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">${esc(cta.label)}</a></td></tr>` : '<tr><td style="padding:8px"></td></tr>'}
  </table>
  <p style="font-size:12px;color:#A8A29E">Automated message from EditSimple HR.</p>
  </td></tr></table></body></html>`;
}

type RequestInfo = {
  id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  half_day: boolean;
  half_day_session: 'first' | 'second' | null;
  extra_days: number;
  decision_note: string;
  employee: { full_name: string; email: string } | null;
};

async function loadRequest(id: string): Promise<RequestInfo | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('leave_requests')
    .select('id, leave_type, start_date, end_date, days, reason, half_day, half_day_session, extra_days, decision_note, employee:employees!leave_requests_employee_id_fkey(full_name, email)')
    .eq('id', id)
    .maybeSingle();
  return (data as unknown as RequestInfo) ?? null;
}

async function staffEmails(roles: ('superadmin' | 'admin')[]) {
  const admin = createAdminClient();
  const { data } = await admin.from('profiles').select('email').in('role', roles).eq('is_active', true);
  return (data ?? []).map((p) => p.email as string);
}

function dateText(r: RequestInfo) {
  if (r.half_day) return `${formatDate(r.start_date)} (${r.half_day_session === 'first' ? 'first' : 'second'} half)`;
  return r.start_date === r.end_date ? formatDate(r.start_date) : `${formatDate(r.start_date)} – ${formatDate(r.end_date)}`;
}
const baseRows = (r: RequestInfo): [string, string][] => [
  ['Employee', r.employee?.full_name ?? '—'],
  ['Type', LEAVE_LABEL[r.leave_type]],
  ['Dates', dateText(r)],
  ['Days', fmtDays(r.days)],
  ...(r.reason ? [['Reason', r.reason] as [string, string]] : []),
];

export type NotifyEvent = 'auto_approved' | 'extra_requested' | 'approved' | 'rejected' | 'cancelled';

export async function notifyRequest(id: string, event: NotifyEvent, refunded = 0) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const r = await loadRequest(id);
  if (!r) return;
  const emp = r.employee?.email ? [r.employee.email] : [];
  const who = r.employee?.full_name ?? 'An employee';

  switch (event) {
    case 'auto_approved':
      await send(emp, `Confirmed: ${LEAVE_LABEL[r.leave_type]} on ${dateText(r)}`,
        layout('Your request is confirmed', baseRows(r), { label: 'View my leave', path: '/leave' }, 'It was within your balance, so it was approved automatically.'));
      await send(await staffEmails(['superadmin', 'admin']), `${who} · ${LEAVE_LABEL[r.leave_type]} on ${dateText(r)}`,
        layout(`${who} will be ${r.leave_type === 'wfh' ? 'working from home' : 'on leave'}`, baseRows(r), { label: 'Open dashboard', path: '/' }, 'Auto-approved (within balance). No action needed.'));
      break;
    case 'extra_requested':
      await send(await staffEmails(['superadmin']), `Action needed: ${who} requested extra ${LEAVE_LABEL[r.leave_type]}`,
        layout('Extra-day request needs your decision', baseRows(r), { label: 'Review request', path: '/requests' }, 'This request goes beyond the employee’s available balance.'));
      break;
    case 'approved':
      await send(emp, `Approved: ${LEAVE_LABEL[r.leave_type]} on ${dateText(r)}`,
        layout('Your request was approved', [...baseRows(r),
          ...(Number(r.extra_days) > 0 ? [['Extra days', fmtDays(r.extra_days)] as [string, string]] : []),
          ...(r.decision_note ? [['Note', r.decision_note] as [string, string]] : [])], { label: 'View my leave', path: '/leave' }));
      break;
    case 'rejected':
      await send(emp, `Not approved: ${LEAVE_LABEL[r.leave_type]} on ${dateText(r)}`,
        layout('Your request was not approved', [...baseRows(r), ...(r.decision_note ? [['Note', r.decision_note] as [string, string]] : [])], { label: 'View my leave', path: '/leave' }));
      break;
    case 'cancelled':
      await send([...emp, ...(await staffEmails(['superadmin', 'admin']))], `Cancelled: ${who} · ${LEAVE_LABEL[r.leave_type]} on ${dateText(r)}`,
        layout('Leave cancelled', [...baseRows(r), ...(refunded > 0 ? [['Refunded', `${fmtDays(refunded)} day(s)`] as [string, string]] : [])]));
      break;
  }
}
