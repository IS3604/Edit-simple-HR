# EditSimple HR

Internal HR portal for EditSimple — employees, monthly leave allocations (CL / EL / WFH), requests & approvals, special grants and holidays.

**Stack:** Next.js 15 (App Router, Server Actions) · Tailwind CSS · Supabase (Auth, Postgres, Row Level Security, pg_cron)

- Design, policies and decisions → [`docs/PLAN.md`](docs/PLAN.md)
- Step-by-step go-live (Supabase + GitHub + Vercel) → [`docs/DEPLOY.md`](docs/DEPLOY.md)

## Features

| Role | Can do |
|---|---|
| **Superadmin** | Everything below, plus: add / edit / deactivate employees, set roles, monthly allocations, special grants, holidays & weekend days, reset passwords |
| **Admin** | HR overview, view employees / balances / history, approve or reject leave & WFH (not their own), see who is out today |
| **Employee** | Own balances, apply for CL / EL / WFH, see history, cancel pending requests |

Leave rules (enforced in the database):

| Type | Allocation | Accumulates | Reset / limit |
|---|---|---|---|
| Casual Leave | Monthly, per employee | Within the year | Remaining CL expires 31 Dec |
| Earned Leave | Monthly, per employee | Yes | Monthly credit stops at 20 days (partial fill) |
| WFH | Monthly, per employee | No | Resets on the 1st of every month |

Working days exclude configurable weekend days and company holidays. Balances are deducted only on approval, exactly once.

## Project layout

```
src/app/(app)/         dashboard, leave, requests, employees, balances, grants, holidays, users, account
src/app/login/         sign-in
src/components/        shared UI (balance cards, tables, forms)
src/lib/               Supabase clients, auth guard, types, validation
supabase/migrations/   0001 → 0005 (schema, RLS, balance engine, requests, cron)
supabase/setup_all.sql all migrations in one file for a new project
tests/                 database tests (PGlite) — RLS, constraints, balance engine
scripts/               create-superadmin
```

## Local development

```bash
cp .env.example .env.local      # fill in Supabase URL + keys
npm install
npm run create-superadmin -- you@editsimple.com 'a-strong-password' "Your Name"
npm run dev                     # http://localhost:3000
```

Database setup: see [`docs/DEPLOY.md`](docs/DEPLOY.md) step 1.

## Checks

```bash
npm run typecheck
npm run test:db     # 36 checks: RLS, role guards, constraints, idempotent accrual, approvals, grants
npm run build
```

GitHub Actions runs all three on every push / PR (`.github/workflows/ci.yml`).

## Security

- Every permission is enforced by Postgres RLS and `SECURITY DEFINER` functions that re-check the caller's role — the UI only hides what the database already blocks.
- Balances, requests, grants and the ledger cannot be written through the API directly; only through those functions.
- Roles are stored in `profiles.role`; a new user's role is read only from server-set `app_metadata`.
- The service-role key is server-only (`src/lib/supabase/admin.ts`, `server-only`), used solely for Auth admin calls after verifying the caller is a Superadmin. Never prefix it with `NEXT_PUBLIC_`.
- Deactivating an employee bans their Auth user, so existing sessions can't refresh.
