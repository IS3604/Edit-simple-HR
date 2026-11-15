# EditSimple HR — Phase 0: Design & Plan

Status: All phases (0–7) built. §5 defaults confirmed by owner (2026-11-15).

---

## 1. Requirements summary

Internal HR tool, three roles, three balances (CL, EL, WFH), monthly accrual by cron, approval flow, special grants, simple dashboards. Next.js + Tailwind front end, Supabase (Auth, Postgres, RLS, pg_cron) back end. No extra features.

## 2. Database schema (implemented in `supabase/migrations/0001_foundation.sql`)

| Table | Purpose | Key columns / constraints |
|---|---|---|
| `profiles` | One per login; holds the **role** | `id → auth.users`, `role` (superadmin/admin/employee), `is_active` |
| `employees` | HR record | `profile_id` (unique, nullable), `employee_code` unique, name, email (lowercase, unique), department, designation, `joining_date`, `category` (permanent_wfh/office/hybrid), `status` (active/inactive) |
| `leave_allocations` | Monthly allocation **config**, one row per employee | `casual_per_month`, `earned_per_month`, `wfh_per_month` (0–31, 0.5 steps allowed) |
| `leave_balances` | Current balances (cache of the ledger) | `casual`, `earned`, `wfh` (all ≥ 0), `casual_year`, `wfh_month` |
| `leave_requests` | CL / EL / WFH applications | type, start/end, `days` (working days), reason, status, `decided_by/at`. **Exclusion constraint blocks overlapping pending/approved requests.** WFH can't cross a month; CL can't cross a year. |
| `leave_transactions` | Ledger: every credit, debit, expiry, grant, adjustment | signed `amount`, `balance_after`, `period`, `request_id`, `grant_id`. **Unique indexes make cron + approvals idempotent** (one monthly credit per employee/type/month, one expiry per period, one debit per request, one line per grant). |
| `special_grants` | Extra CL/EL/WFH granted by Superadmin | type, days, **reason required**, `granted_by`, `granted_on` |
| `holidays` | Company holidays | `holiday_date` unique, name |
| `app_settings` | Single row | `weekend_days` (default Sat+Sun), `timezone` (Asia/Kolkata), `el_cap` (20) |

Helpers: `app_current_role()`, `is_superadmin()`, `is_staff()`, `my_employee_id()`, `today_local()`, `working_days(start, end)`.

Triggers: new auth user → profile (role **only** from server-set `app_metadata`); new employee → empty allocation + balance rows; guard keeps ≥ 1 active Superadmin and makes `id`/`email` immutable.

## 3. Role permissions (enforced by RLS, not the UI)

| Capability | Superadmin | Admin | Employee |
|---|:-:|:-:|:-:|
| View all employees, balances, requests, history | ✓ | ✓ | own only |
| Add / edit / deactivate employees | ✓ | – | – |
| Change roles, activate/deactivate logins | ✓ | – | – |
| Set monthly allocations | ✓ | – | – |
| Special grants | ✓ | – | – |
| Manage holidays & settings | ✓ | – | – |
| Approve / reject requests | ✓ | ✓ (not own) | – |
| Apply / cancel own pending request | ✓* | ✓* | ✓ |

\* if they also have an employee record.

How: tables are **read-only** from the API except employees/allocations/holidays/settings/profiles (Superadmin-only writes). Balances, requests, ledger and grants can only change through `SECURITY DEFINER` functions (Phases 3–6) that check the caller's role inside the database. Anonymous users have no access. Service-role key is used only server-side (Auth admin: create/ban users).

## 4. Leave calculation logic

**Working days** = dates in range minus `weekend_days` minus `holidays`. A request totalling 0 days is rejected.

**Available to apply** = balance − days already in *pending* requests of that type (prevents over-applying with several pending requests).

**Lifecycle**
- Apply → validate dates, type, category, overlap, available balance → `pending` (no deduction).
- Approve → re-check balance in the same transaction (row lock on `leave_balances`) → `debit` ledger line (unique per request) → balance updated.
- Reject / Cancel (pending only) → status change, no ledger line.

**Monthly job (1st, 00:05 IST)** — for each active employee, inside one transaction per employee:
1. *Jan only:* expire last year's remaining CL → `expiry` line (period = year start), CL → 0.
2. Credit CL: `+casual_per_month`.
3. Credit EL: `+min(earned_per_month, max(0, 20 − balance))` — partial credit up to the cap; 0 credited is still recorded so the month is marked done.
4. WFH: expire leftover from previous month (`expiry` line), then set to `wfh_per_month` (`monthly_credit` line).
Every step is `INSERT … ON CONFLICT DO NOTHING` on the unique indexes; the balance changes **only if the ledger row was inserted**, so running the job twice does nothing.

**31 December** — a cron at 23:55 IST runs the CL expiry; the Jan-1 job also runs it first (idempotent), so a missed run can't leave stale CL.

**Special grants** → `special_grants` row + `special_grant` ledger line, added to the matching balance.

## 5. Policy conflicts & ambiguities — defaults chosen (please confirm)

| # | Issue | Default I'll implement |
|---|---|---|
| 1 | EL credit when balance is 19.5 and monthly EL is 1.5 | Credit **0.5** (fill to 20), not 0 |
| 2 | Special EL grant when at/near 20 | Grant **can exceed 20** (deliberate HR decision); monthly accrual stays paused while ≥ 20 |
| 3 | Special WFH grant | Adds to **current month only**, expires at month end like normal WFH |
| 4 | WFH for next month requested in advance | **Not allowed** — WFH requests only for the current month (balance doesn't exist yet). Alternative: allow, and check against next month's allocation |
| 5 | CL request spanning 31 Dec → Jan | **Blocked** — submit two requests |
| 6 | December CL request still pending after year-end expiry | Auto-**rejected** by the Jan job with note "CL year closed" |
| 7 | Permanent WFH employees and WFH requests | **Hidden/blocked** — they're always WFH; excluded from "WFH today" counts. Office employees: WFH allowed only if allocation > 0 |
| 8 | New joiner mid-month | Gets the **current month's** allocation when allocations are first saved; regular credits from next 1st |
| 9 | Allocation changed mid-month | Takes effect at the **next** monthly credit |
| 10 | Cancelling an *approved* leave | Not in scope (only pending can be cancelled). Superadmin can correct via a special grant |
| 11 | Holiday added after a leave was approved | Already-deducted days **not recalculated** |
| 12 | Admin approving own request | **Blocked**; another Admin/Superadmin must decide |
| 13 | Half-days | **Not supported** (whole working days); allocations may be fractional (e.g. 1.5 CL/month) |
| 14 | Deactivated employee | Login blocked, no further credits, pending requests auto-cancelled |
| 15 | "Today" and cron timing | **Asia/Kolkata** throughout |

## 6. Phases

1. ✅ Supabase setup, auth, roles — schema + RLS, login, role-aware shell, Users & roles page, Superadmin bootstrap
2. ✅ Employee management — add (creates login with temp password, or links an existing login), edit, deactivate/reactivate (blocks sign-in, cancels pending requests), reset password, search/filter, My account password change
3. ✅ Allocations & balance engine — ledger-backed engine (monthly CL/EL/WFH credit, EL cap with partial fill, WFH expiry/reset, CL year-end expiry + auto-reject, idempotent batch jobs), allocation editor on employee page, Leave balances page, balance cards + history on dashboard
4. ✅ Employee apply / cancel — My leave page, working-day preview, balance-aware validation, cancel pending
5. ✅ Admin approvals — Requests queue with filters, approve/reject with note (no self-approval), HR overview + who's out today on the dashboard
6. ✅ Special grants page, Holidays & weekend-days page, pg_cron jobs (daily idempotent accrual, 31-Dec CL expiry), stale-WFH auto-reject
7. ✅ 36 DB tests (PGlite) in CI, security headers, GitHub Actions, combined `setup_all.sql`, deploy guide (`docs/DEPLOY.md`)

## 7. Security review (Phase 7)

- RLS on every table; anon has no access; all writes to balances / requests / grants / ledger go through `SECURITY DEFINER` functions with role checks and `search_path` pinned.
- Internal engine functions (`_post_txn`, `credit_monthly`, batch jobs) are not executable by API users.
- Double deduction impossible: unique index on `(request_id) where kind = 'debit'` + row locks on `leave_balances`.
- Concurrent applications serialised by a row lock; overlapping live requests blocked by an exclusion constraint.
- Role escalation blocked: role only from `app_metadata` on sign-up; only Superadmin can update profiles; last active Superadmin can't be removed; no self-demotion/deactivation.
- Service-role key server-only; security headers (HSTS, frame-deny, nosniff) set in `next.config.mjs`.
- Known limits (by design, see §5): no half-days, approved leave can't be cancelled (use a grant to correct), WFH requests only for the current month.
