import { validateFile } from '@/lib/file-validation';
import { CATEGORY_BY_DB_KEY } from '@/lib/constants';
import {
  DUPLICATE_UPLOAD_MESSAGE,
  hasOrgScopedDuplicate,
  isOrgScopedDedupViolation,
} from '@/lib/uploadDedup';
import type { UploadSmokeCheckId } from '@/lib/uploadDashboardSmokeChecklist';

export interface SmokeAssertionResult {
  id: UploadSmokeCheckId;
  passed: boolean;
  message: string;
}

/** Runtime checks that work in browser and CI without reading source files. */
export function runUploadDashboardRuntimeAssertions(): SmokeAssertionResult[] {
  return [assertDuplicateDetection(), assertFileTypeValidation()];
}

function assertDuplicateDetection(): SmokeAssertionResult {
  const duplicateOk = hasOrgScopedDuplicate([{ id: 'x' }]);
  const violationOk = isOrgScopedDedupViolation({
    code: '23505',
    message: 'file_processing_queue_org_hash_bucket_key',
  });
  const toastOk = DUPLICATE_UPLOAD_MESSAGE.toLowerCase().includes('already');
  const passed = duplicateOk && violationOk && toastOk;
  return {
    id: 'duplicate_detection',
    passed,
    message: passed
      ? 'Org-scoped dedup helpers and duplicate toast message present'
      : 'Org-scoped dedup wiring failed runtime checks',
  };
}

function assertFileTypeValidation(): SmokeAssertionResult {
  const permitCategory = CATEGORY_BY_DB_KEY.npdes_permit;
  if (!permitCategory) {
    return { id: 'file_type_validation', passed: false, message: 'Permit category config missing' };
  }
  const file = new File([''], 'malware.exe', { type: 'application/octet-stream' });
  Object.defineProperty(file, 'size', { value: 1024 });
  const errors = validateFile(file, permitCategory);
  return {
    id: 'file_type_validation',
    passed: errors.length > 0,
    message:
      errors.length > 0
        ? 'Executable files rejected at staging validation'
        : '.exe was not rejected by validateFile',
  };
}

export function allUploadSmokeAssertionsPassed(results: SmokeAssertionResult[]): boolean {
  return results.length > 0 && results.every((r) => r.passed);
}
