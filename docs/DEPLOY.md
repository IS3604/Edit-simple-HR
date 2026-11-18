# Go-live checklist

## 1. Supabase

1. Create a project at supabase.com (region: Mumbai `ap-south-1` is closest).
2. **SQL Editor → New query** → paste all of `supabase/setup_all.sql` → **Run**.
   - Already ran some migrations earlier? Run only the missing files from `supabase/migrations/` in order
     (e.g. `0004_requests_grants_overview.sql`, `0005_cron.sql`, `0006_auto_approve_halfday_cancel.sql`, `0007_scenario_fixes.sql`, `0008_push_subscriptions.sql`, `0009_grant_edit_revoke.sql`).
   - If `0005` fails with a pg_cron error: **Database → Extensions → enable `pg_cron`**, then run `0005_cron.sql` again.
3. **Authentication → Sign In / Providers → Email**: keep Email enabled, turn **off "Allow new users to sign up"**. HR creates every account.
4. **Authentication → URL Configuration → Site URL**: set to your production URL (after step 3 below).
5. **Project Settings → API**: copy the Project URL, `anon` key and `service_role` key.
6. Check the scheduled jobs (SQL Editor):
   ```sql
   select jobname, schedule, active from cron.job;
   -- es-hr-monthly-accrual     35 18 * * *    (00:05 IST daily; credits once per month)
   -- es-hr-year-end-cl-expiry  20 18 31 12 *  (23:50 IST on 31 Dec)
   ```

## 2. GitHub

```bash
cd editsimple-hr
git init && git add . && git commit -m "EditSimple HR"
git branch -M main
git remote add origin https://github.com/<you>/editsimple-hr.git
git push -u origin main
```

`.env.local` is git-ignored — never commit keys. CI runs automatically on push.

## 3. Vercel (hosting)

1. vercel.com → **Add New → Project** → import the GitHub repo (framework auto-detected: Next.js).
2. **Environment Variables** (Production + Preview):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (**server only**) |
   | `APP_URL` | your site URL, e.g. `https://editsimple-hr.vercel.app` (links in emails) |
   | `RESEND_API_KEY` | *optional* — enables email alerts (resend.com, free tier) |
   | `EMAIL_FROM` | *optional* — e.g. `EditSimple HR <hr@editsimple.in>` (domain verified in Resend) |

3. Server code is pinned to Mumbai (`bom1`) in `vercel.json`, next to Supabase `ap-south-1`. If you ever move Supabase, change it there. **Settings → Functions → Function Region**: pick the region closest to your Supabase project (Supabase → Project Settings → General shows it). Mumbai `ap-south-1` → Vercel `bom1`.
4. Deploy. Put the resulting URL into Supabase **Site URL** (step 1.4).

## Email alerts (optional)

1. Sign up at resend.com → **Domains** → add `editsimple.in` → add the DNS records it shows → wait for "Verified".
2. **API Keys** → create a key → put it in Vercel as `RESEND_API_KEY`, plus `EMAIL_FROM` and `APP_URL`. Redeploy.

Emails sent: auto-approved leave (employee + HR FYI), extra-day request (Superadmins), approved / rejected (employee), cancellation (employee + HR). Without these variables the app works normally and simply doesn't email.

## Push notifications (recommended)

1. On your computer: `npx web-push generate-vapid-keys`
2. Vercel → Environment Variables:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = Public Key
   - `VAPID_PRIVATE_KEY` = Private Key (server only)
   - `VAPID_SUBJECT` = `mailto:hr@editsimple.in`
   - `OPENAI_API_KEY` = your OpenAI key (Ask AI). Optional: `OPENAI_MODEL` (default `gpt-5.6-terra`)
3. Redeploy. Superadmins: Dashboard → **Turn on** (or My account → Notifications → Send test).

Superadmins are notified of every extra-day request; employees are notified when theirs is decided. While the portal is open, the custom EditSimple chime plays; when it's closed, the device's normal notification sound is used (browsers don't allow custom sounds for background notifications). iPhone: add the portal to the Home Screen first (iOS 16.4+).

## 4. First login

On your machine, with `.env.local` filled in:

```bash
npm install
npm run create-superadmin -- you@editsimple.com 'a-strong-password' "Your Name"
```

Sign in → **Employees → Add employee** using your own email (links your login to an HR record) → set your **Monthly allocation**.

## 5. Day-one setup (as Superadmin)

1. **Holidays** — add this year's company holidays; confirm weekend days.
2. **Employees → Add employee** for each person (temporary password; they change it under **My account**).
3. Open each employee → **Monthly allocation** → save CL / EL / WFH. The first save credits the current month.
4. Opening balances from before go-live: use **Special grants** (e.g. "Opening EL balance") — it's recorded separately in the ledger.
5. Promote HR staff to **Admin** under **Users & roles**.

## Manual jobs (rarely needed)

```sql
select public.run_monthly_accrual();          -- current month, safe to re-run
select public.run_monthly_accrual('2027-01-01');
select public.run_year_end_expiry(2026);      -- safe to re-run
```
