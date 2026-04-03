import type {
  DataIntegrityCheck,
  RetentionPolicy,
  SystemHealthLog,
} from '@/types/database';

export interface SystemHealthSignalPosture {
  label: string;
  tone: string;
  detail: string;
}

export function getSnapshotAgeHours(
  latestHealth: SystemHealthLog | null,
  nowMs = Date.now(),
): number | null {
  if (!latestHealth) {
    return null;
  }

  return Math.max(0, (nowMs - new Date(latestHealth.snapshot_at).getTime()) / (1000 * 60 * 60));
}

export function getSystemHealthSignalPosture(input: {
  fetchError: string | null;
  latestCheck: DataIntegrityCheck | null;
  latestHealth: SystemHealthLog | null;
  snapshotAgeHours: number | null;
}): SystemHealthSignalPosture {
  if (input.fetchError) {
    return {
      label: 'Unavailable',
      tone: 'text-red-300',
      detail: 'Telemetry feed is not available.',
    };
  }

  if (!input.latestHealth && !input.latestCheck) {
    return {
      label: 'Bootstrapping',
      tone: 'text-amber-300',
      detail: 'Capture the first snapshot to establish live telemetry.',
    };
  }

  if (input.latestCheck?.status === 'failed' || (input.latestHealth?.error_count_24h ?? 0) >= 3) {
    return {
      label: 'Critical',
      tone: 'text-red-300',
      detail: 'Integrity or error signals need immediate review.',
    };
  }

  if (input.latestCheck?.status === 'warnings' || (input.snapshotAgeHours != null && input.snapshotAgeHours > 24)) {
    return {
      label: 'Watch',
      tone: 'text-amber-300',
      detail: 'Telemetry is present, but signal freshness or warnings need attention.',
    };
  }

  return {
    label: 'Healthy',
    tone: 'text-emerald-300',
    detail: 'Recent telemetry and integrity signals are within expected bounds.',
  };
}

export function buildIntegrityExportRows(checks: DataIntegrityCheck[]) {
  return checks.map((check) => [
    new Date(check.created_at).toLocaleString(),
    check.run_type,
    check.status,
    String(check.checks_total),
    String(check.checks_passed),
    String(check.checks_warned),
    String(check.checks_failed),
    String(check.duration_ms ?? ''),
  ]);
}

export function buildRetentionExportRows(policies: RetentionPolicy[]) {
  return policies.map((policy) => [
    policy.record_type,
    policy.display_name,
    String(policy.retention_years),
    policy.regulatory_basis,
    policy.is_enforced ? 'Yes' : 'No',
    String(policy.records_within_policy ?? 0),
    String(policy.records_outside_policy ?? 0),
    String(policy.records_on_hold ?? 0),
    policy.last_audit_at ? new Date(policy.last_audit_at).toLocaleString() : '',
  ]);
}

export function buildHealthExportRows(logs: SystemHealthLog[]) {
  return logs.map((log) => [
    new Date(log.snapshot_at).toLocaleString(),
    String(log.db_size_mb ?? ''),
    String(log.storage_usage_mb ?? ''),
    String(log.active_users_24h ?? ''),
    String(log.error_count_24h ?? ''),
    String(log.avg_response_ms ?? ''),
  ]);
}
