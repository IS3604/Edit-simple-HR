/**
 * Bootstrap the first Superadmin.
 * Usage: npm run create-superadmin -- <email> <password> "<Full Name>"
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */
import { createClient } from '@supabase/supabase-js';

try { process.loadEnvFile('.env.local'); } catch { /* env may already be set */ }

const [email, password, fullName = ''] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: npm run create-superadmin -- <email> <password> "<Full Name>"');
  process.exit(1);
}
if (password.length < 10) {
  console.error('Use a password of at least 10 characters.');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await supabase.auth.admin.createUser({
  email: email.toLowerCase(),
  password,
  email_confirm: true,
  app_metadata: { role: 'superadmin' },   // server-controlled; read by the handle_new_user trigger
  user_metadata: { full_name: fullName },
});

if (error) {
  console.error('Failed:', error.message);
  process.exit(1);
}
console.log(`Superadmin created: ${data.user.email}`);
