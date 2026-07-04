# Gold Handoff - Roadmap End-to-End

**Date:** 2026-07-04
**Branch at creation:** `cc/counterparty-graph-slice-a`
**Purpose:** Give the next builder one executable handoff for finishing the current branch, then continuing the roadmap without re-litigating lane order.

This repo is a compliance reporting tool, not an EMS and not legal/environmental advice. Any external regulatory submission, verified dollar figure, legal conclusion, secret, or destructive production DDL remains a human gate.

## Authority Order

When documents disagree, use this order:

1. `docs/UNIFIED_MASTER_ROADMAP.md` - build order across Lanes A/B/C.
2. `docs/ENGINEERING_FREEDOM.md` - autonomous build authority and hard gates.
3. `BRAIN_GUIDE.md` - current architecture, pitfalls, commands, and shipped status.
4. `UNIFIED_ROADMAP.md` - numbered task IDs and Phase 1-5 task mapping.
5. `Roadmap/LANE_A_MILESTONE_2.md` and its QA doc - Lane A staging closure.
6. `SCC_Upload_Dashboard_Handoff_v6_DELTA.md` - Upload Dashboard details until a v5 source is restored or replaced.

## Current Branch Closeout

Finish this branch before opening a new roadmap slice.

Branch intent:
- Keep Counterparty Slice A committed history intact.
- Close the dirty follow-on work around ECHO DMR backfill resilience, Slice 1 activation batch tooling, Slice 2 DMR UI smoke coverage, and Slice 4 status-mismatch semantic triage.
- Commit the final handoff artifact with the branch so the roadmap state is durable.

Dirty-branch work to preserve:
- `sync-echo-data` now reports DMR request attempts, bad EPA windows, per-window results, and bisects retryable failed DMR date windows.
- `scripts/slice3-wv1024078-sync.mjs` writes window-level DMR sync artifacts.
- `scripts/slice4-status-mismatch-export.mjs` splits status mismatches into safe semantic dismisses, one-click align candidates, and human-judgment rows.
- Review Queue exposes a guarded "Dismiss semantic" action backed by `bulk_dismiss_semantic_status_mismatches`.
- `scripts/slice1-activation-batch.mjs` runs ranked permit activation chains and emits one summary artifact.
- Tests cover the new automation surfaces.

Do not revert uncommitted artifacts unless they are proven accidental. The `.qa-artifacts/` files are evidence from this branch's QA runs.

## Verification For This Branch

Run these before claiming the branch is finished:

```bash
npm test -- slice3EchoDiscrepancyRerun statusMismatchAutomation slice1ActivationBatch DmrDetailPage.slice2-smoke
npm run typecheck
npm run lint
npm test
npm run build
```

If the full `npm test` suite is too slow to complete inside the current execution window, run the targeted test command plus `typecheck`, `lint`, and `build`, then record the gap explicitly in the commit trailers and final handoff.

## Migration Audit

Before deploy or merge, run:

```bash
supabase migration list
```

Expected local-only migrations from the current branch family include the Counterparty Slice A `2026070402*` files plus any later unpushed migration such as:

```text
20260704030000_status_mismatch_semantic_dismiss_rpc
```

Apply migrations only through the approved Supabase cloud/MCP or CLI path for the target environment. If the remote ledger has unexplained drift, stop and capture the exact mismatch.

## Edge Functions To Deploy

This branch touches:

```bash
supabase functions deploy sync-echo-data
```

Deploy any additional function only if `git diff --name-only` shows changes under that function's directory or shared code it imports.

## End-to-End Roadmap Sequence After This Branch

Run A/B/C in parallel, but keep each lane's internal order.

### Lane A - QA Track, Not New Build

No new Lane A code until staging QA closes:

```bash
npm run qa:lane-a
```

Then run manual staging sign-off:
- A1-A6 for M1 online field execution.
- B1-B5 for M2 offline sync slice.

Close Lane A only after staging evidence is attached. M2 is a vertical slice, not full all-day airplane-mode certification.

### Lane B - Upload Dashboard Critical Path

Next buildable Lane B work:

1. Finish Upload Dashboard UI and trust-badge flow (`3.01`).
2. Wire existing parsers into Upload Dashboard (`3.34`).
3. Preserve canonical categories from `src/lib/constants.ts`.
4. Enforce RBAC in `src/lib/rbac.ts`, `src/App.tsx`, and `src/lib/navGroups.ts`.
5. Log user-visible actions through `useAuditLog`.

Upload Dashboard rules:
- Trust states: Unreviewed, In Review, Verified, Disputed.
- No executables or archives in the `other` bucket.
- Every export carries the standard disclaimer.
- No storage-bucket policy changes without explicit review.

### Lane C - Project Sovereign Quick Wins

Build in this order:

1. QW1 - missed-sampling / calendar-gap detector.
2. QW2 - paragraph 49 48-hour EDD-arrival clock and exceedance-only-data flag.
3. QW4 - overdue preventive-maintenance detector for field-sampling equipment.
4. QW3 - defensible-miss packet generator.

Also build, in draft or not-configured mode rather than stubs:
- MSHA inspection/citation sync pipeline body and abatement clocks.
- VA/TN/AL parser paths against best available public or representative formats.
- Missed-sampling obligation ledger.
- Draft stipulated-penalty ledger with DRAFT / UNVERIFIED labels and audit-logged verification gates.

Lane C schema rules:
- New detector rows must not be orphan alerts; couple them to work orders when the roadmap requires it.
- New ledger/fact tables need bitemporal columns unless there is a documented reason not to.
- Penalty rows need `citation` and `verification_status`.
- Nightly jobs must log degraded-mode failures as facts.
- Statutory-clock alerts need acknowledgment tracking, not just send attempts.

## Hard Gates

Stop for a human decision before:
- External submit/certify actions.
- Verified dollar figures or DRAFT to VERIFIED penalty flips.
- Secrets, API keys, or dashboard-only credentials.
- Destructive production DDL or storage policy changes.
- Counsel-gated privilege architecture or auto-capture for interaction ledgers.

Additive migrations, Edge Functions, UI, tests, and audit logging are normal engineering work.

## Commit And Handoff Protocol

Use Lore commit trailers. Minimum useful shape:

```text
<why this branch is being finished>

<short narrative of the branch closeout>

Confidence: medium|high
Scope-risk: narrow|moderate|broad
Tested: <commands that passed>
Not-tested: <honest gaps>
Directive: <future warning if needed>
```

After commit, report:
- Changed files summary.
- Verification evidence.
- Migrations/functions that still need apply/deploy.
- Manual tasks that remain.

## Recommended Next First Slice

After this branch is clean, start Lane C QW1 unless Brian narrows the scope. QW1 is high-value, bounded, and explicitly allowed to ship with empty/draft states until the Sampling Matrix arrives.
