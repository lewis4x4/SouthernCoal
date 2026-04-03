import { describe, expect, it } from 'vitest';
import {
  buildRetentionExportRows,
  getSnapshotAgeHours,
  getSystemHealthSignalPosture,
} from '@/lib/systemHealth';
import type { DataIntegrityCheck, RetentionPolicy, SystemHealthLog } from '@/types/database';

const baseCheck: DataIntegrityCheck = {
  id: 'check-1',
  organization_id: 'org-1',
  run_type: 'manual',
  status: 'passed',
  checks_total: 8,
  checks_passed: 8,
  checks_warned: 0,
  checks_failed: 0,
  results: [],
  started_at: '2026-04-05T10:00:00.000Z',
  completed_at: '2026-04-05T10:01:00.000Z',
  duration_ms: 60000,
  run_by: 'user-1',
  created_at: '2026-04-05T10:01:00.000Z',
};

const baseHealth: SystemHealthLog = {
  id: 'health-1',
  organization_id: 'org-1',
  db_size_mb: 100,
  table_counts: null,
  storage_usage_mb: 20,
  active_users_24h: 3,
  error_count_24h: 0,
  avg_response_ms: 450,
  snapshot_at: '2026-04-05T12:00:00.000Z',
  created_at: '2026-04-05T12:00:00.000Z',
};

describe('systemHealth helpers', () => {
  it('computes snapshot age in hours', () => {
    expect(getSnapshotAgeHours(baseHealth, new Date('2026-04-05T15:00:00.000Z').getTime())).toBe(3);
    expect(getSnapshotAgeHours(null)).toBeNull();
  });

  it('returns unavailable posture when fetch failed', () => {
    expect(getSystemHealthSignalPosture({
      fetchError: 'db failed',
      latestCheck: null,
      latestHealth: null,
      snapshotAgeHours: null,
    }).label).toBe('Unavailable');
  });

  it('returns bootstrapping posture when no telemetry exists yet', () => {
    expect(getSystemHealthSignalPosture({
      fetchError: null,
      latestCheck: null,
      latestHealth: null,
      snapshotAgeHours: null,
    }).label).toBe('Bootstrapping');
  });

  it('returns critical posture for failed checks or high error counts', () => {
    expect(getSystemHealthSignalPosture({
      fetchError: null,
      latestCheck: { ...baseCheck, status: 'failed' },
      latestHealth: baseHealth,
      snapshotAgeHours: 1,
    }).label).toBe('Critical');

    expect(getSystemHealthSignalPosture({
      fetchError: null,
      latestCheck: baseCheck,
      latestHealth: { ...baseHealth, error_count_24h: 3 },
      snapshotAgeHours: 1,
    }).label).toBe('Critical');
  });

  it('returns watch posture for warning checks or stale snapshots', () => {
    expect(getSystemHealthSignalPosture({
      fetchError: null,
      latestCheck: { ...baseCheck, status: 'warnings' },
      latestHealth: baseHealth,
      snapshotAgeHours: 1,
    }).label).toBe('Watch');

    expect(getSystemHealthSignalPosture({
      fetchError: null,
      latestCheck: baseCheck,
      latestHealth: baseHealth,
      snapshotAgeHours: 30,
    }).label).toBe('Watch');
  });

  it('returns healthy posture when recent telemetry is clean', () => {
    expect(getSystemHealthSignalPosture({
      fetchError: null,
      latestCheck: baseCheck,
      latestHealth: baseHealth,
      snapshotAgeHours: 2,
    }).label).toBe('Healthy');
  });

  it('builds retention export rows with legal hold and audit fields', () => {
    const policies: RetentionPolicy[] = [{
      id: 'policy-1',
      organization_id: 'org-1',
      record_type: 'compliance_violations',
      display_name: 'Violations',
      description: null,
      retention_years: 10,
      regulatory_basis: 'Consent Decree',
      is_enforced: true,
      last_audit_at: '2026-04-05T13:00:00.000Z',
      records_within_policy: 12,
      records_outside_policy: 2,
      records_on_hold: 1,
      created_at: '2026-04-05T12:00:00.000Z',
      updated_at: '2026-04-05T12:30:00.000Z',
    }];

    const [row] = buildRetentionExportRows(policies);
    expect(row).toBeDefined();
    if (!row) {
      throw new Error('Expected one retention export row');
    }
    expect(row.slice(0, 8)).toEqual([
      'compliance_violations',
      'Violations',
      '10',
      'Consent Decree',
      'Yes',
      '12',
      '2',
      '1',
    ]);
    expect(row[8]).toContain('2026');
  });
});
