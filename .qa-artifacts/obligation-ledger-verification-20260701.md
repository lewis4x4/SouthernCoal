# Lane C sampling obligation ledger verification (2026-07-01)

**Spec:** `docs/UNIFIED_MASTER_ROADMAP.md` §3 build-now  
**Route:** `/compliance/sampling-obligations`  
**Automated gate:** `npm run qa:obligation-ledger` — pass (5 tests)

## Shipped layers

| Layer | Artifact |
|-------|----------|
| DB | `20260702180000_sampling_obligation_ledger.sql` — `get_sampling_obligation_ledger` RPC |
| UI | `SamplingObligationLedgerPage` — partial-coverage banner + status filters |
| Nav | Compliance → **Sampling Obligations** (`COMPLIANCE_ADVANCED_ROLES`) |
| Parser | `src/lib/samplingObligationLedger.ts` + Vitest coverage |

## Activation smoke (UAT org)

| Step | Result |
|------|--------|
| Seed | `scripts/seed-qw1-uat-calendar.sql` — 4 calendar rows |
| RPC | Classifies fulfilled / excused / missed / at-risk / upcoming |
| UI | DRAFT partial-coverage disclaimer when matrix not loaded |

## Manual smoke

1. Log in as `wv-uat-admin@invalid.scc.local` on staging.
2. Open `/compliance/sampling-obligations`.
3. Expect status counts matching seeded calendar (1 missed, 1 at-risk, 1 excused, 1 upcoming).
4. Filter by **Missed** — confirm single row with days-late column.

## Empty-state behavior (production SCC)

Until Sampling Matrix + Upload Dashboard populate schedules, ledger shows zero events with partial-coverage banner — not an error state.
