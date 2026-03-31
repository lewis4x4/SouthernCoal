#!/usr/bin/env zsh
# =============================================================================
# Full ECHO Sync — Batch Script
# Syncs all eligible NPDES permits one-at-a-time to avoid gateway timeouts.
# Each permit takes 30-120s. Gateway kills at ~150s.
#
# Usage:
#   chmod +x scripts/full-echo-sync.sh
#   export SUPABASE_ANON_KEY="..."
#   export SYNC_ECHO_INTERNAL_SECRET="..."
#   ./scripts/full-echo-sync.sh
#
# Resumes from where it left off if re-run (uses progress file).
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
URL="${SUPABASE_URL:-https://zymenlnwyzpnohljwifx.supabase.co}"
ANON_KEY="${SUPABASE_ANON_KEY:-}"
SECRET="${SYNC_ECHO_INTERNAL_SECRET:-}"
RUN_TAG="full-sync-$(date +%Y%m%d-%H%M%S)"
DONE_FILE="/tmp/echo-sync-done.txt"
FAIL_FILE="/tmp/echo-sync-failed.txt"
LOG_FILE="/tmp/echo-sync-${RUN_TAG}.log"

if [[ -z "$ANON_KEY" ]]; then
  echo "SUPABASE_ANON_KEY is required."
  exit 1
fi

if [[ -z "$SECRET" ]]; then
  echo "SYNC_ECHO_INTERNAL_SECRET is required."
  exit 1
fi

# Create tracking files if missing
touch "$DONE_FILE" "$FAIL_FILE"

# ---------------------------------------------------------------------------
# Step 1: Dry run to get eligible permit list
# ---------------------------------------------------------------------------
echo "[$RUN_TAG] Fetching eligible permits via dry_run..."
DRY_RUN=$(curl -s "$URL/functions/v1/sync-echo-data" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "x-internal-secret: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}')

TOTAL=$(echo "$DRY_RUN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('permits_eligible',0))")
PERMITS=("${(@f)$(echo "$DRY_RUN" | python3 -c "import sys,json; d=json.load(sys.stdin); print('\n'.join(d.get('selected_npdes_ids',[])))")}")

if [[ ${#PERMITS[@]} -eq 0 ]] || [[ "$TOTAL" == "0" ]]; then
  echo "No eligible permits found. Exiting."
  exit 0
fi

echo "[$RUN_TAG] Found $TOTAL eligible permits"
echo "$DRY_RUN" | python3 -m json.tool > "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Count already done
ALREADY_DONE=$(wc -l < "$DONE_FILE" | tr -d ' ')
if [[ "$ALREADY_DONE" -gt 0 ]]; then
  echo "[$RUN_TAG] Resuming — $ALREADY_DONE permits already synced"
fi

# ---------------------------------------------------------------------------
# Step 2: Sync one permit at a time
# ---------------------------------------------------------------------------
SYNCED=0
FAILED=0
SKIPPED=0
TOTAL_DMRS=0
IDX=0

for NPDES_ID in "${PERMITS[@]}"; do
  IDX=$((IDX + 1))

  # Skip empty lines
  [[ -z "$NPDES_ID" ]] && continue

  # Skip if already completed
  if grep -qx "$NPDES_ID" "$DONE_FILE" 2>/dev/null; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  REMAINING=$((TOTAL - IDX + 1))
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "[$IDX/$TOTAL] Syncing $NPDES_ID  (remaining: ~$REMAINING)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  START_TIME=$(date +%s)

  RESULT=$(curl -s --max-time 180 "$URL/functions/v1/sync-echo-data" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "x-internal-secret: $SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"target_npdes_ids\": [\"$NPDES_ID\"], \"run_tag\": \"$RUN_TAG\"}" 2>&1) || RESULT='{"success":false,"error":"curl timeout or network error"}'

  END_TIME=$(date +%s)
  ELAPSED=$((END_TIME - START_TIME))

  # Parse result
  SUCCESS=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(str(d.get('success',False)).lower())" 2>/dev/null || echo "false")
  PERMITS_SYNCED=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('permitsSynced',0))" 2>/dev/null || echo "0")
  DMRS=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('dmrsInserted',0))" 2>/dev/null || echo "0")
  ERRORS=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); errs=d.get('errors',[]); print('; '.join(errs[:2]) if errs else 'none')" 2>/dev/null || echo "parse error")

  if [[ "$SUCCESS" == "true" ]]; then
    SYNCED=$((SYNCED + 1))
    TOTAL_DMRS=$((TOTAL_DMRS + DMRS))
    echo "  ✓ OK  facilities=$PERMITS_SYNCED  dmrs=$DMRS  time=${ELAPSED}s"
    echo "$NPDES_ID" >> "$DONE_FILE"
  else
    FAILED=$((FAILED + 1))
    echo "  ✗ FAILED  time=${ELAPSED}s  errors=$ERRORS"
    echo "$NPDES_ID|$ERRORS" >> "$FAIL_FILE"
  fi

  # Log to file
  echo "[$IDX/$TOTAL] $NPDES_ID success=$SUCCESS facilities=$PERMITS_SYNCED dmrs=$DMRS elapsed=${ELAPSED}s" >> "$LOG_FILE"

  # Rate limit — 2s between permits (EPA courtesy)
  sleep 2

done

# ---------------------------------------------------------------------------
# Step 3: Summary
# ---------------------------------------------------------------------------
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  FULL ECHO SYNC COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Run tag:    $RUN_TAG"
echo "  Total:      $TOTAL permits"
echo "  Synced:     $SYNCED"
echo "  Failed:     $FAILED"
echo "  Skipped:    $SKIPPED (already done)"
echo "  Total DMRs: $TOTAL_DMRS"
echo "  Log:        $LOG_FILE"
echo "  Done list:  $DONE_FILE"
echo "  Fail list:  $FAIL_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
