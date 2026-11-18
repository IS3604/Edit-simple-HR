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

## Push notifications (16 Nov 2026)

- `tests/push.sim.mts` runs the real server code (`src/lib/push.ts`, `web-push`) against a mock Supabase API and a mock HTTPS push service: extra-day request reaches every Superadmin device (VAPID-signed, aes128gcm-encrypted), not admins/employees; decisions reach only the employee; expired (410) subscriptions are deleted; users without devices are reported.
- Browser check (Chromium, DevTools `deliverPushMessage`) on the built app: the service worker shows the notification (correct title/body/link, sticky for action-needed requests) and the open tab receives the message to play the chime and refresh.
- **Bug fixed:** if the browser refused to display the notification, the open tab was never told either (no chime, no refresh). The tab is now notified first and display errors are caught.
- **Improved:** Superadmins are now also notified when leave/WFH is auto-approved or cancelled; “Send test notification” now reports exactly what's wrong (missing key, no device registered, push service error).

---

## Policy v2 — 18 Nov 2026

**Changes tested:** CL/EL never negative · WFH floor −10 (shortfall off next month) · new Unpaid leave (approval, salary deducted) · two categories (Office/Hybrid, Permanent WFH) · grants can add or deduct · revoke takes back only unused days, with claw-back if booked leave is later cancelled.

| Suite | Result |
|---|---|
| `test:db` (PGlite, 42 checks) | ✅ pass |
| `test:scenarios` seed 42 + 3 stress seeds (APPLY 0.2, CANCEL 0.08, GRANT 0.3; ~80 grant/deduct/edit/revoke ops each, full year) | ✅ 26 scripted checks, 18 invariant sweeps clean per seed |
| `test:upgrade` (existing data on 0012 → 0013+0014) | ✅ negative CL/EL cleared with ledger note, WFH −2 kept, hybrid→office, re-runnable |
| `next build` / `tsc` | ✅ |
| UI render check (dashboards, apply popup, grants, revoke dialog, phone) | ✅ screenshots reviewed |

**New invariants:** no CL/EL balance or ledger line below 0; WFH ≥ −10; unpaid never touches the ledger; revoked-grant ledger lines = days − taken back; no "hybrid" employees.

**Bugs found & fixed during testing**
1. Revoke-then-cancel loophole — revoking a grant whose days were booked, then cancelling that leave, refunded the grant days. Fixed: `revoke_owed` + claw-back in `cancel_request`.
2. 31-Dec grant after year-end close pinned CL to the closed year, so 1 Jan credit was skipped. Fixed in `grant_special`.

**Not covered here:** clicking through the live app against real Supabase Auth (needs your Supabase project). Do a quick manual pass after running the SQL.
