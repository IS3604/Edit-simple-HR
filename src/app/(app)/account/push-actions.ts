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

export async function sendTestPush() {
  const me = await requireProfile();
  if (!pushEnabled()) return { error: 'Push isn’t configured on the server yet (VAPID keys missing).' };
  await pushToProfile(me.id, { title: 'Notifications are on', body: 'You’ll hear this chime when something needs you.', url: '/', tag: 'test' });
  return { ok: true };
}
