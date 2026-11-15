import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Me, Role } from '@/lib/types';

/**
 * The signed-in user's profile + employee link, in ONE query.
 * Identity comes from getClaims(), which verifies the JWT locally when the
 * project uses asymmetric signing keys (no Auth round trip), and falls back
 * to the Auth server otherwise. Cached per request.
 */
export const getCurrentProfile = cache(async (): Promise<Me | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const uid = claimsData?.claims?.sub;
  if (!uid) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active, employee:employees!employees_profile_id_fkey(id, status, category)')
    .eq('id', uid)
    .maybeSingle();
  if (!data) return null;

  const emp = Array.isArray(data.employee) ? data.employee[0] ?? null : data.employee ?? null;
  return { ...(data as unknown as Me), employee: emp };
});

/** Use at the top of every protected page / server action. */
export async function requireProfile(allowed?: Role[]): Promise<Me> {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (!profile.is_active) redirect('/login?error=inactive');
  if (allowed && !allowed.includes(profile.role)) redirect('/');
  return profile;
}

export const isStaff = (role: Role) => role === 'superadmin' || role === 'admin';
