import type { CategoryConfig } from './constants';

const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.sh', '.cmd', '.ps1', '.dll', '.msi',
  '.jar', '.zip', '.tar', '.gz', '.7z', '.rar', '.com',
  '.scr', '.vbs', '.wsf', '.js',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Validate a file against its target category's accepted types.
 * Returns validation errors (empty array = valid).
 */
export function validateFile(file: File, category: CategoryConfig): string[] {
  const errors: string[] = [];

  // Check blocked extensions
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    errors.push(
      `Executable and archive files are not accepted. "${file.name}" is blocked.`,
    );
    return errors; // No need to check further
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    errors.push(
      `File size (${formatSize(file.size)}) exceeds the 50MB limit.`,
    );
  }

  // Check MIME type against category's accepted types
  if (file.type && !category.acceptedTypes.includes(file.type)) {
    const accepted = category.acceptedTypes
      .map((t) => t.split('/').pop())
      .join(', ');
    errors.push(
      `The '${category.label}' category accepts ${accepted} files only. "${file.name}" (${file.type || 'unknown type'}) is not allowed.`,
    );
  }

  // If no MIME type detected, check by extension
  if (!file.type) {
    const knownExts: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.csv': 'text/csv',
      '.txt': 'text/plain',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
      '.tsv': 'text/tab-separated-values',
    };
    const inferred = knownExts[ext];
    if (inferred && !category.acceptedTypes.includes(inferred)) {
      const accepted = category.acceptedTypes
        .map((t) => t.split('/').pop())
        .join(', ');
      errors.push(
        `The '${category.label}' category accepts ${accepted} files only. "${file.name}" is not allowed.`,
      );
    }
  }

  return errors;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
