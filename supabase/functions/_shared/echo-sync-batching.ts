export interface EchoBatchPlanInput {
  eligibleNpdesIds: string[];
  targetNpdesIds?: string[];
  continuationNpdesIds?: string[];
  priorCoverageNpdesIds?: string[];
  limit: number;
  offset?: number;
}

export interface EchoBatchPlan {
  selectedNpdesIds: string[];
  remainingUnprocessedNpdesIds: string[];
  coverageNpdesIds: string[];
  unresolvedNpdesIds: string[];
  hasMore: boolean;
}

export interface EchoCoverageResultInput {
  coverageNpdesIds: string[];
  processedNpdesIds: string[];
  remainingUnprocessedNpdesIds: string[];
  failedNpdesIds: string[];
  unresolvedNpdesIds: string[];
  continuationDispatched: boolean;
  continuationRequestId?: number | null;
  continuationError?: string | null;
  batchNumber: number;
  rootJobRunId?: string | null;
}

export interface EchoCoverageResult {
  coverage_complete: boolean;
  coverage_total: number;
  processed_this_batch: number;
  remaining_count: number;
  remaining_npdes_ids: string[];
  failed_npdes_ids: string[];
  unresolved_npdes_ids: string[];
  continuation_dispatched: boolean;
  continuation_request_id: number | null;
  continuation_error: string | null;
  batch_number: number;
  root_job_run_id: string | null;
}

export function normalizeNpdesIds(values: string[] | undefined): string[] {
  const normalized = new Set<string>();
  for (const value of values ?? []) {
    const npdesId = value.trim().toUpperCase();
    if (npdesId) normalized.add(npdesId);
  }
  return [...normalized];
}

export function buildEchoBatchPlan(input: EchoBatchPlanInput): EchoBatchPlan {
  const eligibleNpdesIds = normalizeNpdesIds(input.eligibleNpdesIds);
  const eligibleSet = new Set(eligibleNpdesIds);
  const targetNpdesIds = normalizeNpdesIds(input.targetNpdesIds);
  const continuationNpdesIds = normalizeNpdesIds(input.continuationNpdesIds);
  const limit = input.limit > 0 ? Math.floor(input.limit) : 0;

  if (targetNpdesIds.length > 0) {
    const selectedNpdesIds = targetNpdesIds.filter((npdesId) =>
      eligibleSet.has(npdesId)
    );
    return {
      selectedNpdesIds,
      remainingUnprocessedNpdesIds: [],
      coverageNpdesIds: selectedNpdesIds,
      unresolvedNpdesIds: targetNpdesIds.filter((npdesId) =>
        !eligibleSet.has(npdesId)
      ),
      hasMore: false,
    };
  }

  if (continuationNpdesIds.length > 0) {
    const resumableNpdesIds = continuationNpdesIds.filter((npdesId) =>
      eligibleSet.has(npdesId)
    );
    const selectedNpdesIds = limit > 0
      ? resumableNpdesIds.slice(0, limit)
      : resumableNpdesIds;
    const remainingUnprocessedNpdesIds = resumableNpdesIds.slice(
      selectedNpdesIds.length,
    );

    return {
      selectedNpdesIds,
      remainingUnprocessedNpdesIds,
      coverageNpdesIds: normalizeNpdesIds(
        input.priorCoverageNpdesIds?.length
          ? input.priorCoverageNpdesIds
          : continuationNpdesIds,
      ),
      unresolvedNpdesIds: continuationNpdesIds.filter((npdesId) =>
        !eligibleSet.has(npdesId)
      ),
      hasMore: remainingUnprocessedNpdesIds.length > 0,
    };
  }

  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const resumableNpdesIds = eligibleNpdesIds.slice(offset);
  const selectedNpdesIds = limit > 0
    ? resumableNpdesIds.slice(0, limit)
    : resumableNpdesIds;
  const remainingUnprocessedNpdesIds = resumableNpdesIds.slice(
    selectedNpdesIds.length,
  );

  return {
    selectedNpdesIds,
    remainingUnprocessedNpdesIds,
    coverageNpdesIds: normalizeNpdesIds(
      input.priorCoverageNpdesIds?.length
        ? input.priorCoverageNpdesIds
        : resumableNpdesIds,
    ),
    unresolvedNpdesIds: [],
    hasMore: remainingUnprocessedNpdesIds.length > 0,
  };
}

export function buildEchoCoverageResult(
  input: EchoCoverageResultInput,
): EchoCoverageResult {
  const failedNpdesIds = normalizeNpdesIds(input.failedNpdesIds);
  const unresolvedNpdesIds = normalizeNpdesIds(input.unresolvedNpdesIds);
  const remainingNpdesIds = normalizeNpdesIds([
    ...input.remainingUnprocessedNpdesIds,
    ...failedNpdesIds,
    ...unresolvedNpdesIds,
  ]);

  return {
    coverage_complete: remainingNpdesIds.length === 0 &&
      !input.continuationError,
    coverage_total: normalizeNpdesIds(input.coverageNpdesIds).length,
    processed_this_batch: normalizeNpdesIds(input.processedNpdesIds).length,
    remaining_count: remainingNpdesIds.length,
    remaining_npdes_ids: remainingNpdesIds,
    failed_npdes_ids: failedNpdesIds,
    unresolved_npdes_ids: unresolvedNpdesIds,
    continuation_dispatched: input.continuationDispatched,
    continuation_request_id: input.continuationRequestId ?? null,
    continuation_error: input.continuationError ?? null,
    batch_number: Math.max(1, Math.floor(input.batchNumber)),
    root_job_run_id: input.rootJobRunId ?? null,
  };
}
