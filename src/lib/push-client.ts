'use client';

import { removePushSubscription, savePushSubscription } from '@/app/(app)/account/push-actions';

export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on';

// Public VAPID key (safe to ship in client code). The env var overrides it if set.
const VAPID =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  'BDo5bdjYrOGIfPrjIhMAX-NHg1JPpG7yQaRQoQEq1JjqNsFIaajAO_7Z16374CTO-39yz8ltCm5D5j2KD8Zda4g';

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function registration() {
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (!VAPID) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (!VAPID) return 'unconfigured';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID) }));
  const res = await savePushSubscription(JSON.parse(JSON.stringify(sub)), navigator.userAgent);
  if ('error' in res && res.error) throw new Error(res.error);
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await removePushSubscription(sub.endpoint);
    await sub.unsubscribe();
  }
  return 'off';
}

/** Re-sync an existing subscription (e.g. after the browser rotated it). */
export async function syncPush() {
  if (!pushSupported() || !VAPID || Notification.permission !== 'granted') return;
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  if (sub) await savePushSubscription(JSON.parse(JSON.stringify(sub)), navigator.userAgent);
}

let audio: HTMLAudioElement | null = null;
export function playChime() {
  try {
    audio ??= new Audio('/sounds/notify.wav');
    audio.volume = 0.7;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch { /* ignore */ }
}
