/**
 * File Validation Tests
 *
 * Tests for validateFile function that handles:
 * - Blocked file extensions (executables, archives)
 * - File size limits (50MB max)
 * - MIME type matching against category.acceptedTypes
 * - Extension inference fallback for files without MIME type
 */

import { describe, it, expect } from 'vitest';
import { validateFile } from '../file-validation';
import type { CategoryConfig } from '../constants';

// Mock category configurations for testing
const mockPermitCategory: CategoryConfig = {
  dbKey: 'npdes_permit',
  bucket: 'permits',
  label: 'NPDES Permits',
  matrixLabel: 'Permits',
  acceptedTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff'],
  priority: 1,
  buildPath: ({ fileName, hashPrefix }) => `${hashPrefix}_${fileName}`,
};

const mockLabDataCategory: CategoryConfig = {
  dbKey: 'lab_data',
  bucket: 'lab-data',
  label: 'Lab Data',
  matrixLabel: 'Lab Data',
  acceptedTypes: [
    'application/pdf',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/tab-separated-values',
  ],
  priority: 2,
  buildPath: ({ fileName, hashPrefix }) => `${hashPrefix}_${fileName}`,
};

// Helper to create mock File objects
function createMockFile(
  name: string,
  size: number,
  type: string,
): File {
  const file = new File([''], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('validateFile', () => {
  describe('blocked extensions', () => {
    it('rejects .exe files', () => {
      const file = createMockFile('malware.exe', 1024, 'application/octet-stream');
      const errors = validateFile(file, mockPermitCategory);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Executable and archive files are not accepted');
    });

    it('rejects .bat files', () => {
      const file = createMockFile('script.bat', 512, 'application/octet-stream');
      const errors = validateFile(file, mockPermitCategory);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('blocked');
    });

    it('rejects .zip archives', () => {
      const file = createMockFile('archive.zip', 1024 * 1024, 'application/zip');
      const errors = validateFile(file, mockPermitCategory);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('blocked');
    });

    it('rejects .jar files', () => {
      const file = createMockFile('library.jar', 1024, 'application/java-archive');
      const errors = validateFile(file, mockLabDataCategory);
      expect(errors[0]).toContain('blocked');
    });

    it('rejects .js files', () => {
      const file = createMockFile('hack.js', 100, 'application/javascript');
      const errors = validateFile(file, mockPermitCategory);
      expect(errors[0]).toContain('blocked');
    });

    it('rejects blocked extensions case-insensitively', () => {
      const file = createMockFile('MALWARE.EXE', 1024, 'application/octet-stream');
      const errors = validateFile(file, mockPermitCategory);
      expect(errors[0]).toContain('blocked');
    });
  });

  describe('file size limits', () => {
    it('accepts files under 50MB', () => {
      const file = createMockFile('permit.pdf', 49 * 1024 * 1024, 'application/pdf');
      const errors = validateFile(file, mockPermitCategory);
      expect(errors).toHaveLength(0);
    });

    it('accepts files exactly at 50MB', () => {
      const file = createMockFile('permit.pdf', 50 * 1024 * 1024, 'application/pdf');
      const errors = validateFile(file, mockPermitCategory);
      expect(errors).toHaveLength(0);
    });

    it('rejects files over 50MB', () => {
      const file = createMockFile('huge.pdf', 51 * 1024 * 1024, 'application/pdf');
      const errors = validateFile(file, mockPermitCategory);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('exceeds the 50MB limit');
    });

    it('formats size correctly in error message', () => {
      const file = createMockFile('huge.pdf', 75 * 1024 * 1024, 'application/pdf');
      const errors = validateFile(file, mockPermitCategory);
      expect(errors[0]).toContain('75.0 MB');
    });
  });

  describe('MIME type validation', () => {
    it('accepts PDF files for permit category', () => {
      const file = createMockFile('permit.pdf', 1024 * 100, 'application/pdf');
      const errors = validateFile(file, mockPermitCategory);
      expect(errors).toHaveLength(0);
    });

    it('accepts PNG images for permit category', () => {
      const file = createMockFile('scan.png', 1024 * 500, 'image/png');
      const errors = validateFile(file, mockPermitCategory);
      expect(errors).toHaveLength(0);
    });

    it('accepts Excel files for lab data category', () => {
      const file = createMockFile(
        'lab_results.xlsx',
        1024 * 100,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      const errors = validateFile(file, mockLabDataCategory);
      expect(errors).toHaveLength(0);
    });

    it('accepts CSV files for lab data category', () => {
      const file = createMockFile('edd_report.csv', 1024 * 50, 'text/csv');
      const errors = validateFile(file, mockLabDataCategory);
      expect(errors).toHaveLength(0);
    });

    it('rejects Word docs for permit category', () => {
      const file = createMockFile(
        'permit.docx',
        1024 * 100,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      const errors = validateFile(file, mockPermitCategory);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("'NPDES Permits' category");
    });

    it('rejects Excel files for permit category', () => {
      const file = createMockFile(
        'spreadsheet.xlsx',
        1024 * 100,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      const errors = validateFile(file, mockPermitCategory);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('not allowed');
    });
  });

  describe('extension inference fallback', () => {
    it('infers PDF MIME type from .pdf extension', () => {
      const file = createMockFile('permit.pdf', 1024, '');
      const errors = validateFile(file, mockPermitCategory);
      // PDF is accepted for permits, should pass
      expect(errors).toHaveLength(0);
    });

    it('rejects .xlsx when inferred type is not accepted', () => {
      const file = createMockFile('spreadsheet.xlsx', 1024, '');
      const errors = validateFile(file, mockPermitCategory);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('not allowed');
    });

    it('accepts .csv for lab data when MIME type is missing', () => {
      const file = createMockFile('results.csv', 1024, '');
      const errors = validateFile(file, mockLabDataCategory);
      expect(errors).toHaveLength(0);
    });

    it('handles unknown extension with no MIME type gracefully', () => {
      const file = createMockFile('data.xyz', 1024, '');
      const errors = validateFile(file, mockLabDataCategory);
      // Unknown extension should not produce inference error
      // (only MIME type mismatch errors when MIME is provided)
      expect(errors).toHaveLength(0);
    });
  });

  describe('multiple validation errors', () => {
    it('returns only blocked extension error for blocked files', () => {
      // Blocked extension should return early
      const file = createMockFile('script.exe', 100 * 1024 * 1024, 'application/octet-stream');
      const errors = validateFile(file, mockPermitCategory);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('blocked');
    });

    it('returns both size and MIME errors for oversized wrong-type files', () => {
      const file = createMockFile(
        'huge.docx',
        75 * 1024 * 1024,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      const errors = validateFile(file, mockPermitCategory);
      expect(errors).toHaveLength(2);
      expect(errors[0]).toContain('50MB limit');
      expect(errors[1]).toContain('not allowed');
    });
  });
});
