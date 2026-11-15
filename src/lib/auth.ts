import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile, Role } from '@/lib/types';

/** The signed-in user's profile (role read from the database, never from the client). */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active')
    .eq('id', user.id)
    .single();
  return (data as Profile) ?? null;
});

/** Use at the top of every protected page / server action. */
export async function requireProfile(allowed?: Role[]): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!profile.is_active) redirect('/login?error=inactive');
  if (allowed && !allowed.includes(profile.role)) redirect('/');
  return profile;
}
