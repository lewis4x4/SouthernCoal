import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSrc(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src', relativePath), 'utf8');
}

describe('external data RBAC + realtime wiring (3.46 / 3.47)', () => {
  it('gates MSHA sync actions on bulk_process with disabled tooltips', () => {
    const source = readSrc('components/external-data/MshaCoveragePanel.tsx');
    expect(source).toMatch(/can\('bulk_process'\)/);
    expect(source).toMatch(/disabled=\{.*!canSync/);
    expect(source).toMatch(/Requires bulk_process permission/);
    expect(source).toMatch(/msha_sync_manual_trigger/);
  });

  it('shows ECHO sync buttons disabled (not hidden) when unauthorized', () => {
    const source = readSrc('components/external-data/SyncHealthPanel.tsx');
    expect(source).toMatch(/disabled=\{isSyncing \|\| !canSync\}/);
    expect(source).not.toMatch(/\{canSync && \(/);
  });

  it('consolidates external_sync_log realtime via shared hook', () => {
    expect(readSrc('hooks/useEchoCoverage.ts')).toContain('useExternalSyncLogRealtime');
    expect(readSrc('hooks/useEchoCoverage.ts')).not.toContain("channel(`sync-log:");
    expect(readSrc('hooks/useExternalSyncLogRealtime.ts')).toContain('external_sync_log');
  });

  it('surfaces external-data audit actions in AuditLogPage presets', () => {
    const source = readSrc('pages/AuditLogPage.tsx');
    expect(source).toContain('PRESET_EXTERNAL_DATA_AUDIT_ACTIONS');
    expect(source).toContain('npdes_federal_mapping_saved');
    expect(source).toContain('msha_sync_manual_trigger');
  });
});
