import 'server-only';
import * as webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

let configured: boolean | null = null;
function ready() {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv || !process.env.SUPABASE_SERVICE_ROLE_KEY) return (configured = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hr@editsimple.in', pub, priv);
  return (configured = true);
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

async function deliver(subs: Sub[], payload: PushPayload) {
  if (!subs.length) return;
  const admin = createAdminClient();
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 12, urgency: 'high' });
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id); // expired
        else console.error('[push] send failed', code, (err as Error).message);
      }
    }),
  );
}

/** Push to every active user with one of these roles. */
export async function pushToRoles(roles: ('superadmin' | 'admin' | 'employee')[], payload: PushPayload) {
  if (!ready()) return;
  const admin = createAdminClient();
  const { data } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, profile:profiles!inner(role, is_active)')
    .in('profile.role', roles)
    .eq('profile.is_active', true);
  await deliver((data ?? []) as unknown as Sub[], payload);
}

/** Push to one user's devices. */
export async function pushToProfile(profileId: string, payload: PushPayload) {
  if (!ready()) return;
  const admin = createAdminClient();
  const { data } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('profile_id', profileId);
  await deliver((data ?? []) as Sub[], payload);
}

export const pushEnabled = () => Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
