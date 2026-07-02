import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATEGORY_BY_DB_KEY, CATEGORIES, STATES, STATE_MAP } from '@/lib/constants';
import { DISCLAIMER_EXPORT } from '@/lib/disclaimer';
import { validateFile } from '@/lib/file-validation';
import {
  canProcessQueueEntry,
  isArchiveDocumentCategory,
  resolveQueueParser,
} from '@/lib/queueProcessorRouting';
import type { QueueEntry } from '@/types/queue';

function queueEntry(partial: Partial<QueueEntry>): QueueEntry {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    file_name: 'file.pdf',
    file_category: 'npdes_permit',
    status: 'queued',
    storage_bucket: 'permits',
    storage_path: 'WV/file.pdf',
    file_size_bytes: 1024,
    mime_type: 'application/pdf',
    file_hash: 'abc',
    state_code: 'WV',
    uploaded_by: 'user',
    organization_id: 'org',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...partial,
  } as QueueEntry;
}

describe('upload dashboard permit pipeline (logic E2E)', () => {
  const permitCategory = CATEGORY_BY_DB_KEY.npdes_permit;

  it('builds state-scoped permit storage paths for all five states', () => {
    expect(permitCategory).toBeDefined();
    for (const state of STATES) {
      const folder = STATE_MAP[state.code] ?? state.code;
      const path = permitCategory!.buildPath({
        stateCode: state.code,
        fileName: `${state.code}_permit.pdf`,
        hashPrefix: 'deadbeef',
      });
      expect(path.startsWith(`${folder}/`)).toBe(true);
      expect(path).toContain('deadbeef');
    }
  });

  it('accepts permit PDFs in staging validation', () => {
    const file = new File(['%PDF-1.4'], 'WV_permit.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 2048 });
    expect(validateFile(file, permitCategory!)).toEqual([]);
  });

  it('routes permit PDFs to parse-permit-pdf', () => {
    const entry = queueEntry({ file_name: 'WV123.pdf', storage_path: 'WV/WV123.pdf' });
    const route = resolveQueueParser(entry);
    expect(route.kind).toBe('permit_pdf');
    expect(route.functionName).toBe('parse-permit-pdf');
    expect(canProcessQueueEntry(entry)).toBe(true);
  });

  it('routes parameter sheets to parse-parameter-sheet', () => {
    const entry = queueEntry({ file_name: 'WV_Limits.xlsx', storage_path: 'WV/WV_Limits.xlsx' });
    const route = resolveQueueParser(entry);
    expect(route.kind).toBe('parameter_sheet');
    expect(route.functionName).toBe('parse-parameter-sheet');
  });
});

describe('upload dashboard category mapping', () => {
  it('maps legacy water_monitoring DB key to matrix and archive routing', () => {
    const category = CATEGORY_BY_DB_KEY.water_monitoring;
    expect(category).toBeDefined();
    expect(category!.label).toBe('Water Monitoring');
    expect(category!.bucket).toBe('field-inspections');

    const entry = queueEntry({
      file_category: 'water_monitoring',
      storage_bucket: 'field-inspections',
      file_name: 'WV_monitoring.csv',
    });
    const route = resolveQueueParser(entry);
    expect(route.kind).toBe('compliance_archive');
    expect(canProcessQueueEntry(entry)).toBe(true);
  });

  it('maps consent_decree and sampling_matrix to archive pipeline', () => {
    expect(CATEGORY_BY_DB_KEY.consent_decree?.bucket).toBe('audit-reports');
    expect(CATEGORY_BY_DB_KEY.sampling_matrix?.bucket).toBe('other');

    for (const fileCategory of ['consent_decree', 'sampling_matrix'] as const) {
      const entry = queueEntry({
        file_category: fileCategory,
        storage_bucket: CATEGORY_BY_DB_KEY[fileCategory]!.bucket,
        file_name: fileCategory === 'consent_decree' ? 'Consent_Decree_7-16-cv-00462.pdf' : 'Sampling_Matrix_Q3.xlsx',
      });
      const route = resolveQueueParser(entry);
      expect(route.kind).toBe('compliance_archive');
      expect(route.functionName).toBe('process-compliance-archive');
      expect(canProcessQueueEntry(entry)).toBe(true);
    }
  });

  it('includes outreach document categories in canonical CATEGORIES list', () => {
    const dbKeys = new Set(CATEGORY_BY_DB_KEY ? Object.keys(CATEGORY_BY_DB_KEY) : []);
    expect(dbKeys.has('consent_decree')).toBe(true);
    expect(dbKeys.has('sampling_matrix')).toBe(true);
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(11);
  });

  it('treats all archive-routed categories as archive documents', () => {
    for (const fileCategory of [
      'field_inspection',
      'water_monitoring',
      'consent_decree',
      'sampling_matrix',
      'quarterly_report',
      'audit_report',
      'enforcement',
    ] as const) {
      expect(isArchiveDocumentCategory(fileCategory)).toBe(true);
      const entry = queueEntry({
        file_category: fileCategory,
        storage_bucket: CATEGORY_BY_DB_KEY[fileCategory]?.bucket ?? 'other',
      });
      expect(resolveQueueParser(entry).kind).toBe('compliance_archive');
    }
  });
});

describe('upload dashboard lab pipeline by state', () => {
  it('routes each state lab fixture to a processable parser', () => {
    const fixtures: Array<{ state: string; file: string; kind: string; fn: string }> = [
      { state: 'KY', file: 'results.csv', kind: 'lab_data', fn: 'parse-lab-data-edd' },
      { state: 'VA', file: 'lab_results.csv', kind: 'va_lab_csv', fn: 'parse-va-lab-csv' },
      { state: 'TN', file: 'Q1_monitoring.xlsx', kind: 'osmre_monitoring', fn: 'parse-osmre-monitoring' },
      { state: 'AL', file: 'waypoint.csv', kind: 'al_lab_data', fn: 'parse-al-lab-data' },
      { state: 'WV', file: 'edd.csv', kind: 'lab_data', fn: 'parse-lab-data-edd' },
    ];

    for (const fx of fixtures) {
      const entry = queueEntry({
        file_category: 'lab_data',
        file_name: fx.file,
        storage_path: `${fx.state}/${fx.file}`,
        storage_bucket: 'lab-data',
        state_code: fx.state,
      });
      const route = resolveQueueParser(entry);
      expect(route.kind, fx.state).toBe(fx.kind);
      expect(route.functionName, fx.state).toBe(fx.fn);
      expect(canProcessQueueEntry(entry), fx.state).toBe(true);
    }
  });
});

describe('upload dashboard export + insert wiring', () => {
  it('appends export disclaimer in ComplianceMatrix exports', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dashboard/ComplianceMatrix.tsx'),
      'utf8',
    );
    expect(source).toContain('DISCLAIMER_EXPORT');
    expect(source).toContain('matrix_export_csv');
    expect(source).toContain('matrix_export_markdown');
  });

  it('inserts organization_id on queue rows in useFileUpload', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/hooks/useFileUpload.ts'),
      'utf8',
    );
    expect(source).toContain('organization_id: userProfile.organization_id');
    expect(source).toContain('getFreshToken()');
    expect(source).toContain('isOrgScopedDedupViolation');
  });

  it('refreshes JWT before parse-permit-pdf in usePermitProcessing', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/hooks/usePermitProcessing.ts'),
      'utf8',
    );
    expect(source).toContain('getFreshToken()');
    expect(source).toContain('edgeFunctionFetchHeaders');
    expect(source).toContain('/functions/v1/parse-permit-pdf');
  });

  it('uses standard export disclaimer one-liner', () => {
    expect(DISCLAIMER_EXPORT).toContain('Not an EMS');
    expect(DISCLAIMER_EXPORT).toContain('independent verification');
  });
});
