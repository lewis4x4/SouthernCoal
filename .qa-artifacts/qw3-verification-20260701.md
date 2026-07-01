# Lane C QW3 — Defensible-miss packet verification (2026-07-01)

**Spec:** `docs/QUICK_WINS.md` §QW3, `docs/UNIFIED_MASTER_ROADMAP.md` §3  
**Route:** `/compliance/defensible-miss`  
**Automated gate:** `npm run qa:qw3` — pass (3 tests)

## Already shipped (migration `20260701150000`)

| Layer | Artifact |
|-------|----------|
| DB | `get_flanking_samples_for_gap`, `get_collector_access_anomalies` RPCs |
| Storage | `20260701160000` — `defensible_miss_packets` table + bucket |
| UI | `DefensibleMissPage` — miss picker, packet preview, collector table, export |
| Nav | Compliance → **Defensible Miss** (`COUNSEL_EVIDENCE_ROLES`) |
| PDF | `generate-defensible-miss-pdf` Edge Function |
| Link | QW1 miss panel → `/compliance/defensible-miss?gapId=…` |
| Audit | `defensible_miss_packet_generated` / `_exported` / `_pdf_generated` |

## Activation slice (this session)

| Step | Result |
|------|--------|
| UAT seed | `scripts/seed-qw3-uat-defensible-miss.sql` |
| Flanking lab data | Clean pH **7.1** (2026-06-03) + **7.3** (2026-06-17) bracketing miss **2026-06-10** |
| Collector fingerprint | 4 completed `access_issue` visits + 1 `sample_collected` (rate denominator) |
| Seed note | Field-visit completion requires `access_issues` + photo evidence (trigger-safe insert order) |

### Miss gap for demo (UAT org `f0000001…`)

| Field | Value |
|-------|-------|
| Gap ID | `d946e0a3-b8b4-425c-a4b3-00c1e11d8bb8` |
| Scheduled | 2026-06-10 (21 days late) |
| Parameter | pH |
| Deep link | `/compliance/defensible-miss?gapId=d946e0a3-b8b4-425c-a4b3-00c1e11d8bb8` |

### Flanking samples (RPC logic verified)

| Side | Sample date | Result |
|------|-------------|--------|
| Before | 2026-06-03 | 7.1 SU |
| After | 2026-06-17 | 7.3 SU |

### Collector anomaly (365-day lookback)

| Collector | Access issues | Completed visits | Rate |
|-----------|---------------|------------------|------|
| UAT Sampler | 4 | 6 | 66.7% |

## Manual smoke

1. Log in as `wv-uat-admin@invalid.scc.local` on Netlify.
2. Open deep link above — packet auto-generates with before + after blocks.
3. **Export Markdown** — disclaimer one-liner appended.
4. **Generate PDF** (optional) — stores to `defensible-miss-packets` bucket.
5. Collector table shows UAT Sampler row.

## Empty-state behavior (production SCC)

No missed gaps until Sampling Matrix + calendar land — page shows empty miss list. Packets are DRAFT counsel aids only; no legal conclusions or penalty dollars.

## Lane C quick wins — complete

QW1 ✓ · QW2 ✓ · QW4 ✓ · QW3 ✓

## Next (Lane C backlog)

MSHA pipeline body, VA/TN/AL lab parsers, draft-labeled penalty ledger (detection-only until verified data).
