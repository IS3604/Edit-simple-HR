import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/lib/env';

/**
 * Service-role client. Bypasses RLS — server-only, used solely for Supabase Auth
 * admin operations (create / ban users). Never import from a client component.
 * Always verify the caller is a Superadmin before using it.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY');
  return createClient(SUPABASE_URL(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
