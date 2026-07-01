import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sharedPath = resolve(
  process.cwd(),
  'supabase/functions/_shared/permit-pdf-import.ts',
);

const edgePath = resolve(
  process.cwd(),
  'supabase/functions/import-permit-limits/index.ts',
);

describe('permit PDF import pipeline', () => {
  const shared = readFileSync(sharedPath, 'utf8');
  const edge = readFileSync(edgePath, 'utf8');

  it('defines importable permit PDF document types', () => {
    expect(shared).toContain('"original_permit"');
    expect(shared).toContain('"renewal"');
    expect(shared).toContain('importPermitPdfExtractedData');
  });

  it('routes permit PDF document types in import-permit-limits', () => {
    expect(edge).toContain('PERMIT_PDF_IMPORT_TYPES');
    expect(edge).toContain('importPermitPdfExtractedData');
    expect(edge).toContain('permit_pdf_imported');
  });
});
