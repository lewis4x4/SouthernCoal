# Overnight goal — SCC Southern Coal

**Deadline:** Morning of 2026-07-01  
**Repo:** `/Users/brianlewis/Southern Coal/SouthernCoal`  
**Branch:** `overnight/20260701-goal-pack`

## Mission

Execute Goals 1–6 from Brain Guide overnight session. Ship clean, tested code.  
Read first: `BRAIN_GUIDE.md`, `Roadmap/LANE_A_MILESTONE_2.md`

## Pre-authorized (no human needed)

- Fix ESLint (tsconfigRootDir + ignore `.claude/worktrees`)
- Implement + test all items below
- Create git commits (conventional, one logical chunk per commit)
- Push branch and open PR(s) to main
- Run after every chunk: `npm run typecheck && npm test && npm run build`

## Forbidden without explicit approval

- Apply Supabase migrations to production
- Modify production data (RPC, deletes, NPDES `--apply`)
- Force push, amend pushed commits, change git config
- New DB tables/columns
- Deploy to Netlify (merge only; deploy follows main)

## Work packages (in order — do not skip gates)

1. [ ] Goal 1: ESLint fix — lint exits 0
2. [ ] Goal 2A: PR — Lane A offline (field cache, useFieldOps, field pages, M2 docs)
3. [ ] Goal 3: M2 unit tests mapping B1–B5 (document in `LANE_A_MILESTONE_2_QA.md`)
4. [ ] Goal 2B: PR — Upload queue routing (queueProcessorRouting, useQueueProcessing, dashboard queue)
5. [ ] Goal 2C: PR — Alerts (exceedance/compliance panels, dispatch functions, cron SQL files in repo only)
6. [ ] Goal 2D: PR — ECHO/review queue + SyncHealthPanel
7. [ ] Goal 6: Update `BRAIN_GUIDE.md` with shipped state
8. [ ] Goal 5 (if time): `npm run report:npdes-gaps` — commit report only, no `--apply`

## Definition of done (morning checklist)

- [ ] All PR links listed below under **Results**
- [ ] typecheck / test (298+) / build / lint all green on final branch
- [ ] No uncommitted changes except qa-artifacts if intentionally gitignored
- [ ] Short **Morning summary** at bottom: what merged, what's in PR, what's blocked

## If blocked

- Log blocker in **Blockers** below
- Skip to next package; do not stop the whole run for one failure
- After 2 failed fixes on same issue, document and move on

---

## Results

_(PR links added as work completes)_

## Blockers

_(None yet)_

## Morning summary

_(Pending — filled at end of run)_
