# Agent Gates Runbook

## Purpose

Every approved segment must pass deterministic gates before commit and push.

## Standard Flow

1. Implement one bounded segment
2. Run segment gate command
3. Run required review agents
4. Fix blockers
5. Re-run gates
6. Commit atomically
7. Push
8. Start next segment immediately

## Standard Commands

```bash
bun run migrations:check
bun run build
bun run build:web
bun run stress:test
bun run design:review
bun run segment:gates --segment "<segment-id>"
