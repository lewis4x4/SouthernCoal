import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cronMigration = readFileSync(
  resolve(import.meta.dirname, '../../../supabase/migrations/20260524120000_echo_weekly_sync_cron.sql'),
  'utf8',
);

describe('ECHO weekly sync cron closure (5.14 / 5.15)', () => {
  it('schedules weekly stale-only sync for permits older than 7 days', () => {
    expect(cronMigration).toContain("'sync-echo-weekly'");
    expect(cronMigration).toContain("'0 4 * * 0'");
    expect(cronMigration).toContain("'stale_days', 7");
    expect(cronMigration).toContain("'stale_only', true");
    expect(cronMigration).toContain("'run_tag', 'cron-weekly-echo'");
    expect(cronMigration).toContain('/functions/v1/sync-echo-data');
  });

  it('SyncHealthPanel surfaces last sync, failures, and stale permits (5.15)', () => {
    const panel = readFileSync(
      resolve(process.cwd(), 'src/components/external-data/SyncHealthPanel.tsx'),
      'utf8',
    );
    expect(panel).toContain('sync-health-heading');
    expect(panel).toContain('failedRuns30d');
    expect(panel).toContain('staleFacilities');
    expect(panel).toContain('lastCompleted');
    expect(panel).toContain('onSyncStale');
  });

  it('EchoCoveragePanel wires SyncHealthPanel with useSyncHealth', () => {
    const coverage = readFileSync(
      resolve(process.cwd(), 'src/components/external-data/EchoCoveragePanel.tsx'),
      'utf8',
    );
    expect(coverage).toContain('useSyncHealth');
    expect(coverage).toContain('<SyncHealthPanel');
  });
});
