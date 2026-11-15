# EditSimple HR

Internal HR portal for EditSimple — employees, monthly leave allocations (CL / EL / WFH), requests & approvals, special grants and holidays.

**Stack:** Next.js 15 (App Router, Server Actions) · Tailwind CSS · Supabase (Auth, Postgres, Row Level Security, pg_cron)

- Design, policies and decisions → [`docs/PLAN.md`](docs/PLAN.md)
- Step-by-step go-live (Supabase + GitHub + Vercel) → [`docs/DEPLOY.md`](docs/DEPLOY.md)

## Features

| Role | Can do |
|---|---|
| **Superadmin** | Everything Admin can, plus: decide extra-day requests, cancel approved leave, add / edit / deactivate employees, set roles, monthly allocations, special grants, holidays & weekend days, reset passwords |
| **Admin** | HR overview, team calendar, view employees / balances / history and all requests, see who is out today |
| **Employee** | Own balances; apply for CL / EL / WFH (full or half day) — **auto-approved within balance**, or raise an extra-day request to the Superadmin; cancel pending or not-yet-started leave (refunded) |

Leave rules (enforced in the database):

| Type | Allocation | Accumulates | Reset / limit |
|---|---|---|---|
| Casual Leave | Monthly, per employee | Within the year | Remaining CL expires 31 Dec |
| Earned Leave | Monthly, per employee | Yes | Monthly credit stops at 20 days (partial fill) |
| WFH | Monthly, per employee | No | Resets on the 1st of every month |

Working days exclude configurable weekend days and company holidays. Each approval deducts exactly once; cancelling refunds exactly once. Optional email alerts via Resend.

## Project layout

```
src/app/(app)/         dashboard, leave, requests, employees, balances, grants, holidays, users, account
src/app/login/         sign-in
src/components/        shared UI (balance cards, tables, forms)
src/lib/               Supabase clients, auth guard, types, validation
supabase/migrations/   0001 → 0008 (schema, RLS, balance engine, requests, cron)
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
npm run test:db         # 40 checks on PGlite: RLS, role guards, constraints, accrual, approvals, grants
PGHOST=/tmp PGUSER=postgres npm run test:scenarios   # full-year AI-employee simulation on real Postgres (see docs/TEST-REPORT.md)
npm run build
```

GitHub Actions runs all three on every push / PR (`.github/workflows/ci.yml`).

## Performance

- Identity via `getClaims()` (local JWT verification with Supabase asymmetric keys) and one combined profile+employee query per request.
- Instant navigation feedback with route-level loading skeletons; prefetched sidebar links.
- **Set the Vercel Functions region to the same region as your Supabase project** (Vercel → Settings → Functions → Region, e.g. Mumbai `bom1` for Supabase `ap-south-1`). A cross-continent region is the #1 cause of slow pages.

## Security

- Every permission is enforced by Postgres RLS and `SECURITY DEFINER` functions that re-check the caller's role — the UI only hides what the database already blocks.
- Balances, requests, grants and the ledger cannot be written through the API directly; only through those functions.
- Roles are stored in `profiles.role`; a new user's role is read only from server-set `app_metadata`.
- The service-role key is server-only (`src/lib/supabase/admin.ts`, `server-only`), used solely for Auth admin calls after verifying the caller is a Superadmin. Never prefix it with `NEXT_PUBLIC_`.
- Deactivating an employee bans their Auth user, so existing sessions can't refresh.
