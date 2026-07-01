import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  UPLOAD_DASHBOARD_SMOKE_CHECKS,
  type UploadSmokeCheckId,
} from '@/lib/uploadDashboardSmokeChecklist';
import {
  allUploadSmokeAssertionsPassed,
  runUploadDashboardRuntimeAssertions,
} from '@/lib/uploadDashboardSmokeAssertions';

const REPO_SRC = resolve(process.cwd(), 'src');

function readSrc(relativePath: string): string {
  return readFileSync(resolve(REPO_SRC, relativePath), 'utf8');
}

function assertSourceContains(
  relativePath: string,
  patterns: RegExp[],
): boolean {
  const source = readSrc(relativePath);
  return patterns.every((p) => p.test(source));
}

describe('uploadDashboardSmokeChecklist', () => {
  it('defines all 10 v6 §12 checks in order', () => {
    expect(UPLOAD_DASHBOARD_SMOKE_CHECKS).toHaveLength(10);
    expect(UPLOAD_DASHBOARD_SMOKE_CHECKS.map((c) => c.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(UPLOAD_DASHBOARD_SMOKE_CHECKS.every((c) => c.automatable)).toBe(true);
  });

  it('passes runtime assertions (dedup + file validation)', () => {
    const results = runUploadDashboardRuntimeAssertions();
    expect(allUploadSmokeAssertionsPassed(results)).toBe(true);
  });
});

describe('uploadDashboardSmokeAssertions — source wiring (v6 §12)', () => {
  const wiring: { id: UploadSmokeCheckId; path: string; patterns: RegExp[] }[] = [
    {
      id: 'non_admin_upload',
      path: 'hooks/useFileUpload.ts',
      patterns: [/getFreshToken\(\)/, /file_processing_queue/, /organization_id: userProfile\.organization_id/],
    },
    {
      id: 'realtime_rls',
      path: 'hooks/useRealtimeQueue.ts',
      patterns: [
        /filter:\s*`organization_id=eq\.\$\{profile\.organization_id\}`/,
        /queue-changes:\$\{profile\.organization_id\}/,
      ],
    },
    {
      id: 'cross_tenant_isolation',
      path: 'hooks/useFileUpload.ts',
      patterns: [/isOrgScopedDedupViolation/, /organization_id/],
    },
    {
      id: 'summary_stats_accuracy',
      path: 'hooks/useComplianceMatrix.ts',
      patterns: [/totalPermits/, /totalOutfalls/, /totalLimits/, /awaitingReview/],
    },
    {
      id: 'matrix_cell_filtering',
      path: 'components/dashboard/ComplianceMatrix.tsx',
      patterns: [/setFilters\(\{ stateCode, category: categoryKey/, /filter_change/],
    },
    {
      id: 'export_audit_trail',
      path: 'components/dashboard/ComplianceMatrix.tsx',
      patterns: [/matrix_export_csv/, /matrix_export_markdown/],
    },
    {
      id: 'failed_processing',
      path: 'components/dashboard/ProcessingQueue.tsx',
      patterns: [/ErrorForensics/, /status === 'failed'/],
    },
    {
      id: 'session_expiry',
      path: 'lib/supabase.ts',
      patterns: [/session_expired/, /redirectToLogin/],
    },
  ];

  it.each(wiring)('$id wiring in $path', ({ path, patterns }) => {
    expect(assertSourceContains(path, patterns)).toBe(true);
  });
});
