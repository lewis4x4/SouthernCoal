import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('StatusMismatchTriageBanner', () => {
  const page = readFileSync(resolve(process.cwd(), 'src/pages/ReviewQueuePage.tsx'), 'utf8');
  const hook = readFileSync(resolve(process.cwd(), 'src/hooks/useDiscrepancies.ts'), 'utf8');
  const banner = readFileSync(
    resolve(process.cwd(), 'src/components/review-queue/StatusMismatchTriageBanner.tsx'),
    'utf8',
  );

  it('counts pending status_mismatch server-side', () => {
    expect(hook).toContain('statusMismatchPendingCount');
    expect(hook).toContain("eq('discrepancy_type', 'status_mismatch')");
  });

  it('wires banner with filter toggle on Review Queue', () => {
    expect(page).toContain('StatusMismatchTriageBanner');
    expect(page).toContain('toggleStatusMismatchFilter');
    expect(page).toContain("type: active ? undefined : 'status_mismatch'");
  });

  it('warns against bulk dismiss', () => {
    expect(banner).toContain('do not bulk-mark reviewed');
    expect(banner).toContain('qa:slice4-status-mismatch');
  });
});
