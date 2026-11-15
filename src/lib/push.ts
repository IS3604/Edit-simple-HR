import 'server-only';
import * as webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';

const PUBLIC_KEY = 'BDo5bdjYrOGIfPrjIhMAX-NHg1JPpG7yQaRQoQEq1JjqNsFIaajAO_7Z16374CTO-39yz8ltCm5D5j2KD8Zda4g';

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

let configured: boolean | null = null;
function ready() {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv || !process.env.SUPABASE_SERVICE_ROLE_KEY) return (configured = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hr@editsimple.in', pub, priv);
  return (configured = true);
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

export type DeliveryReport = { devices: number; sent: number; expired: number; failed: { status?: number; message: string }[] };

async function deliver(subs: Sub[], payload: PushPayload): Promise<DeliveryReport> {
  const report: DeliveryReport = { devices: subs.length, sent: 0, expired: 0, failed: [] };
  if (!subs.length) return report;
  const admin = createAdminClient();
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 12, urgency: 'high' });
        report.sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) { report.expired++; await admin.from('push_subscriptions').delete().eq('id', s.id); }
        else { report.failed.push({ status: code, message: (err as Error).message }); console.error('[push] send failed', code, (err as Error).message); }
      }
    }),
  );
  return report;
}

/** Push to every active user with one of these roles. */
export async function pushToRoles(roles: ('superadmin' | 'admin' | 'employee')[], payload: PushPayload) {
  if (!ready()) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, profile:profiles!inner(role, is_active)')
    .in('profile.role', roles)
    .eq('profile.is_active', true);
  if (error) console.error('[push] subscription lookup failed', error.message);
  return deliver((data ?? []) as unknown as Sub[], payload);
}

/** Push to one user's devices. */
export async function pushToProfile(profileId: string, payload: PushPayload) {
  if (!ready()) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('profile_id', profileId);
  if (error) console.error('[push] subscription lookup failed', error.message);
  return deliver((data ?? []) as Sub[], payload);
}

export const pushEnabled = () => Boolean(process.env.VAPID_PRIVATE_KEY);
