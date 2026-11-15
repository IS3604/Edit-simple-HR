'use server';

import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { pushEnabled, pushToProfile } from '@/lib/push';

type SubJson = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

export async function savePushSubscription(sub: SubJson, userAgent: string) {
  await requireProfile();
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return { error: 'Invalid subscription' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint, p_p256dh: sub.keys.p256dh, p_auth: sub.keys.auth, p_user_agent: userAgent.slice(0, 300),
  });
  return error ? { error: 'Could not save notification settings.' } : { ok: true };
}

export async function removePushSubscription(endpoint: string) {
  await requireProfile();
  const supabase = await createClient();
  await supabase.rpc('delete_push_subscription', { p_endpoint: endpoint });
  return { ok: true };
}

export async function sendTestPush(): Promise<{ ok?: string; error?: string }> {
  const me = await requireProfile();
  if (!pushEnabled()) return { error: 'Server is missing VAPID_PRIVATE_KEY. Add it in Vercel and redeploy.' };
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY.' };
  const r = await pushToProfile(me.id, { title: 'Notifications are on', body: 'You’ll hear this chime when something needs you.', url: '/', tag: 'test' });
  if (!r) return { error: 'Push is not configured on the server.' };
  if (r.devices === 0) return { error: 'No device is registered for you yet. Turn notifications off and on again on this device.' };
  if (r.sent === 0) {
    const f = r.failed[0];
    return { error: r.expired ? 'This device’s subscription had expired — turn notifications on again.' : `Push service rejected the message${f?.status ? ` (${f.status})` : ''}: ${f?.message ?? 'unknown error'}` };
  }
  return { ok: `Sent to ${r.sent} device${r.sent === 1 ? '' : 's'}. It should appear in a few seconds.` };
}
