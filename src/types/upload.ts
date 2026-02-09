export interface StagedFile {
  /** Client-generated UUID */
  id: string;
  /** Original File object */
  file: File;
  fileName: string;
  fileSize: number;
  mimeType: string;
  /** Auto-detected classification from filename */
  autoClassification: ClassificationResult | null;
  /** User overrides for state/category */
  manualOverride: { state?: string; category?: string } | null;
  /** Validation errors (empty = ready to upload) */
  validationErrors: string[];
  /** SHA-256 hash (computed JIT before upload, not on drop) */
  hashHex: string | null;
}

export interface ClassificationResult {
  stateCode: string | null;
  category: string | null;
  confidence: 'high' | 'medium' | 'low';
  matchedPatterns: string[];
}

export interface UploadProgress {
  fileId: string;
  percent: number;
  status: 'pending' | 'hashing' | 'uploading' | 'complete' | 'error';
  error?: string;
}
