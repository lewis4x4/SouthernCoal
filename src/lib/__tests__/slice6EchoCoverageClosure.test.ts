import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSrc(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src', relativePath), 'utf8');
}

describe('slice6 / task 3.38 — VA NPDES override UI wiring', () => {
  it('requires confirmation basis for VA registry mapping gaps', () => {
    const source = readSrc('components/external-data/EchoCoveragePanel.tsx');
    expect(source).toMatch(/requiresConfirmation/);
    expect(source).toMatch(/requireConfirmationBasis/);
    expect(source).toMatch(/NPDES_CONFIRMATION_BASIS/);
    expect(source).toMatch(/saveOverride/);
  });

  it('persists confirmation basis via useNpdesOverrides', () => {
    const source = readSrc('hooks/useNpdesOverrides.ts');
    expect(source).toContain('confirmation_basis');
    expect(source).toContain('validateConfirmationBasis');
    expect(source).toContain('syncPermitFederalMetadata');
  });
});

describe('slice6 / task 3.37 — ECHO sync coverage panel wiring', () => {
  it('mounts EchoCoveragePanel on External Data route', () => {
    const source = readSrc('pages/ExternalDataPage.tsx');
    expect(source).toContain('EchoCoveragePanel');
    expect(source).toContain('MshaCoveragePanel');
  });

  it('includes sync health, facility table, and registry gap panels', () => {
    const source = readSrc('components/external-data/EchoCoveragePanel.tsx');
    expect(source).toContain('SyncHealthPanel');
    expect(source).toContain('Slice1ActivationFunnelPanel');
    expect(source).toContain('Registry Mapping Gaps');
    expect(source).toContain('useVirtualizer');
    expect(source).toContain('useEchoCoverage');
  });
});
