# Test report — AI-employee scenario simulation (16 Nov 2026)

**How:** `tests/scenarios.test.mjs` runs every migration on a real PostgreSQL 16 server with Supabase's default privileges, then plays 8 "AI employees" (Superadmin, Admin, office / hybrid / Permanent-WFH staff, a mid-March joiner, a deactivated employee) through scripted cases and a day-by-day simulation from 1 Jan 2026 to 20 Jan 2027 with the daily cron, 31-Dec expiry and the owner's 2026 holiday list.

**Volume (5 seeds, high activity):** ~1,350 leave/WFH applications, ~1,200 auto-approved, ~130 extra-day requests (Superadmin approved/rejected), ~240 half-days, ~80 cancellations with refunds, special grants, mid-year allocation change, concurrent-application race.

**Invariants checked 17× per run (all clean):** cached balance = ledger sum; ledger running balance never breaks; every approved request has exactly one debit equal to days − extra days; at most one debit/refund per request; refunds only on cancelled requests; monthly EL credit never exceeds 20; WFH never carries forward; Permanent-WFH staff never have WFH requests; day counts exclude weekends/holidays; no overlaps; nothing before joining date; CL expired exactly once on 31 Dec and the 2027 year starts fresh; deactivated staff get no credits; new joiner credited for their joining month.

## Issues found & fixed (migration `0007_scenario_fixes.sql`)

| # | Issue | Fix |
|---|---|---|
| 1 | Applying for dates that overlap an existing request showed "Only 0.0 day(s) available…" instead of the overlap message, pushing employees to raise a pointless extra-day request | Overlap is now checked before balance |
| 2 | Numbers in messages showed as "0.0" / "1.0" | Trimmed (`0`, `1.5`) |

Test-harness issues (not app bugs) were also corrected.

## Not covered here

- Browser end-to-end (login → apply → approve on screen) against a live Supabase; run these manually on the Vercel site or add Playwright once a staging Supabase project exists.
- Email delivery (Resend not configured yet).

## Known limitations (by design)

- First and second half of the same date can't both be booked.
- Admins/Superadmins have no "My leave" page, so they can't apply for their own leave in the app.
- Extra days beyond balance are recorded on the request; whether they're unpaid is a payroll decision.
