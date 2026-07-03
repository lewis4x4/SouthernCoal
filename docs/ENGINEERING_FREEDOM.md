# Engineering Freedom Amendment

**Version:** 1.3  
**Date:** 2026-07-03 (v1.2 added the two SCC-OS keystone gates — Roadmap §7.3; v1.3 adds the interaction-ledger auto-capture gate — Roadmap §8)  
**Status:** Active — governs all agent and contractor build behavior in this repo  
**Orchestrator:** `.cursor/skills/orchestrator/SKILL.md` + `.cursor/rules/orchestrator-autonomous.mdc` — agents run in continuous build mode; never pause to ask “should I continue?”  
**Authority:** This document resolves conflicts between legacy “wait / approve / block” language and current build policy. When docs disagree on **whether you may build**, this file wins.

**Sequencing (what to build next):** [UNIFIED_MASTER_ROADMAP.md](UNIFIED_MASTER_ROADMAP.md)  
**Architecture and pitfalls:** [BRAIN_GUIDE.md](../BRAIN_GUIDE.md)

---

## Core rule

**Build by default. Orchestrate continuously. Stop only at strict human hard gates.**

- **Orchestrator mode is on.** The agent is the conductor: decompose roadmap work, delegate to sub-agents, integrate, verify, commit, push, merge, migrate, and deploy — then **immediately** take the next item. Never ask Brian if you should keep going.
- **Data is additive, not a gate.** Missing client files, empty tables, unanswered discovery questions, and unconfigured env values mean **draft / empty / not-configured UI** — not “do not implement.”
- **Schema is additive, not a gate.** Create migrations, tables, RPCs, Edge Functions, and cron jobs whenever the feature needs them. No pre-approval step.
- **Lanes run in parallel.** Lane A (QA sign-off), Lane B (Upload Dashboard), and Lane C (Sovereign detection/parsers/ledgers) advance simultaneously unless Brian explicitly narrows scope for a session.

Synthetic and seed data for development/testing is encouraged when production data is absent. Label it clearly; never mix test seed into production without a migration/script name that makes intent obvious.

---

## Autonomous — agents build without stopping to ask

Unless a row in **Hard human gates** applies, proceed through explore → implement → verify in one flow. Do **not** pause for permission.

### Backend and data plane

| Action | Notes |
|--------|--------|
| New SQL migrations (additive) | RLS + org-scoped policies on every new table |
| New RPCs, triggers, generated columns | Follow existing naming and `set_updated_at` patterns |
| New Edge Functions | Shared logic in `supabase/functions/_shared/` |
| `pg_cron` / scheduled jobs | Clone patterns from existing cron migrations |
| Extend existing tables with nullable columns | Prefer additive; avoid destructive DDL |
| Complete pipeline bodies (MSHA sync, VA/TN/AL parsers, gap detector, ledgers) | Test with synthetic/public fixtures; “not configured” state when config missing |
| Seed/dev fixtures for empty domains | Separate from production seed data |

### Frontend and product

| Action | Notes |
|--------|--------|
| New routes, pages, queues, dashboards | RBAC three-file checklist: `rbac.ts`, `App.tsx`, `navGroups.ts` |
| New role groups | Infer from nearest existing group when obvious; document choice in PR |
| Detection UI with **DRAFT / UNVERIFIED / internal estimate** badges | Always on dollar exposure and legal-adjacent totals |
| Export CSV/markdown/PDF | Append standard disclaimer one-liner |
| `useAuditLog` for client-only actions | Fire-and-forget |
| Living Crystal UI | Match existing components; no design approval gate |

### Compliance-domain features (still build autonomously)

| Feature type | Build | Label / behavior |
|--------------|-------|------------------|
| Missed-sampling / calendar-gap detector | Yes | Severity for review; never auto-priced as final liability |
| ¶49 EDD clock, exceedance-only flags | Yes | Advisory flags + audit log |
| Defensible-miss packets | Yes | Evidence for counsel; not a legal conclusion |
| Stipulated-penalty / exposure ledger | Yes | **DRAFT — internal estimate, not verified for external/legal use** until sign-off |
| MSHA sync + abatement countdown UI | Yes | Not-configured until mine-ID map loaded |
| Upload Dashboard, ECHO, DMR pipeline (Lane B) | Yes | Per v5 + v6 handoff specs |

### Process (relaxed)

| Old friction | New rule |
|--------------|----------|
| “Plan → wait for approval” on every compliance touch | Plan briefly inline or in PR description; **implement** |
| “Lane A first — don’t start B/C” | **Superseded** — parallel lanes per Master Roadmap |
| “Blocked until Sampling Matrix / sample file / Mine IDs” | Build now; data populates later |
| “When in doubt about RBAC, ask” | Default to existing role group; note in PR |
| Sub-agent review (security, QA, design) | Before merge/production, not before first implementation |
| “Should I continue / proceed / start the next item?” | **Never ask** — continue per `UNIFIED_MASTER_ROADMAP.md` |

### Ship autonomously (orchestrator — not human gates)

| Action | Notes |
|--------|--------|
| `git commit` on feature branches | After verify passes; one logical slice per commit when practical |
| `git push` | After every commit on the working branch |
| Open PR + merge to `main` | When verify green; prefer squash merge; no permission prompt |
| `supabase db push --linked` | Additive migrations only; use MCP if CLI unauthenticated |
| `supabase functions deploy` | After Edge Function changes |
| Spawn sub-agents (`Task` tool) | Parallel explore/implement/shell without asking |

### Verify before calling done (not a human gate — agent responsibility)

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

---

## Hard human gates — stop and get a person

These are the **only** categories where an agent must **not** proceed autonomously. Everything else is in the autonomous table above.

### External and regulatory action

| Gate | Why |
|------|-----|
| **Submit** a DMR, HMR, certification, or filing to any state/federal portal | Regulatory act under penalty of law |
| **File** Force Majeure or other CD notices with EPA/DEP/DOJ | Legal act; counsel-owned |
| **Send** email/SMS/letter to regulators, counsel, or clients presenting compliance status as fact | External communication |
| **Certify** quarterly CD compliance or signatory-attested reports in-product | Criminal exposure if wrong |
| Remove **DRAFT** badge or mark penalty/exposure figures **verified for external use** | Requires Steve Ball / Bill Johnson sign-off (task 3.17 pattern) **and** the compiled CD stipulated-penalty appendix as verified `penalty_regimes` rows (Roadmap §7.3 decree-compilation gate) |

Agents may build **draft → review → approve → submit** workflows; the **submit/certify/verify-external** step is human-only.

### Production infrastructure (destructive or irreversible only)

| Gate | Why |
|------|-----|
| **Drop, rename, or truncate** production tables/columns | Data loss risk |
| **Alter storage bucket RLS policies** on the 8 shared buckets | Shared upload infrastructure |
| **Delete or overwrite seeded** org/obligations/roles data | Litigation-grade baseline |
| **`supabase migration repair` / baseline adoption** | Ledger surgery — read `supabase/BASELINE_ADOPTION.md` first; human sign-off |
| **`npm run import:npdes-mappings --apply`** (or any prod bulk data mutation script) | Explicit prod data mutation |
| **Force push, hard reset, amend pushed commits** | Git safety |

**Autonomous (orchestrator):** additive `supabase db push`, Edge Function deploy, git commit/push/merge to `main`. Local dev and migrations committed to repo are **not** gated.

### Secrets and credentials

| Gate | Why |
|------|-----|
| Commit `.env`, keys, tokens, service role keys | Security |
| Hardcode Supabase URL/anon key in source | Use env vars only |

### Legal and privilege (content, not code)

| Gate | Why |
|------|-----|
| Quote **specific penalty dollar amounts** to DOJ/EPA/counsel or in client-facing copy as **authoritative** | Figures in Sovereign docs are DRAFT until Bill/Steve reconcile |
| Present agent output as **legal advice** or **EMS certification** | Product is compliance reporting tool only |
| Waive or narrow **attorney-client privilege** scope | GC (Steve Ball) / counsel |
| Start any **SCC-OS keystone Phase 2** feature (exposure positions, self-assessment or disclosure drafting, completeness certification) | Counsel must settle the privilege architecture first — Roadmap §7.3/§7.4 |
| Enable **interaction-ledger auto-capture** (`email_sync`/`portal_scrape`/`field_voice`) or elevate any interaction to attorney-client/work-product by machine | Counsel-signed privilege + retention + FOIA policy row must exist first; machines set `pending_review` only — Roadmap §8, `HANDOFF_COUNTERPARTY_GRAPH.md` §4–5. (Slice A party spine + manual capture are ungated.) |

Building UI that **shows** DRAFT figures internally is allowed. **Citing** them externally is gated.

### Scope kill-switch (human redirect only)

Brian may narrow a session (“Lane A only”, “no Upload Dashboard this week”). That overrides parallel lane policy **for that session only** — not a default agent stop.

---

## What this supersedes

When older text says “wait for approval,” “blocked until client data,” “Lane B after Lane A,” or “do not create migrations without approval,” **ignore it for build authority** unless the action falls under **Hard human gates** above.

Documents to read with this amendment in mind:

| Document | Still valid for |
|----------|-----------------|
| [UNIFIED_MASTER_ROADMAP.md](UNIFIED_MASTER_ROADMAP.md) | Order, lanes, Lane C scope |
| [BRAIN_GUIDE.md](../BRAIN_GUIDE.md) | Stack, RBAC map, Edge Functions, pitfalls |
| [../CLAUDE.md](../CLAUDE.md) | Audit, RLS, RBAC mechanics, disclaimers, category constants — **not** legacy schema-approval lines |
| [plans/LANE_A_FIRST.md](../plans/LANE_A_FIRST.md) | Definition of when Lane A QA is “done” — **not** a block on parallel B/C engineering |
| [PROJECT_SOVEREIGN_UltraCode_System_Prompt.md](PROJECT_SOVEREIGN_UltraCode_System_Prompt.md) | Vision and sovereignty — **not** “Phase 0 before any code” (Phase 0 delivered) |

---

## Quick decision tree

```
About to do work
  ├─ Submit/certify/file/send to regulator or counsel as fact?  → STOP (human)
  ├─ Drop/truncate prod DDL / bucket policy change / seed overwrite / migration repair? → STOP (human)
  ├─ Mark dollars verified for external use?                     → STOP (human)
  ├─ SCC-OS keystone Phase 2 (exposure positions / disclosure drafting)? → STOP (counsel gate, Roadmap §7)
  ├─ Commit secrets / force push / hard reset?                   → STOP (never)
  └─ Anything else → BUILD (orchestrator loop)
        ├─ sub-agents for parallel explore/implement
        ├─ RLS + audit + RBAC + DRAFT labels where applicable
        ├─ typecheck + lint + test + build
        ├─ commit + push + merge + db push + functions deploy
        └─ next roadmap item — do not ask to continue
```

---

*Generated for SCC Compliance Monitor. Not legal advice. Not an EMS. Internal engineering policy only.*
