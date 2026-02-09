import { useStagingStore } from '@/stores/staging';
import { useUploadStore } from '@/stores/upload';
import { useFileUpload } from '@/hooks/useFileUpload';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuditLog } from '@/hooks/useAuditLog';
import { CATEGORIES, CATEGORY_BY_DB_KEY, STATES } from '@/lib/constants';
import { validateFile } from '@/lib/file-validation';
import { cn } from '@/lib/cn';
import {
  Upload,
  Trash2,
  AlertCircle,
  CheckCircle2,
  FileText,
  X,
} from 'lucide-react';

/**
 * Smart Staging Area — pre-upload file review with auto-classification.
 * Auto-filled fields shown in cyan (#67e8f9) to indicate "AI guess".
 */
export function SmartStaging() {
  const files = useStagingStore((s) => s.files);
  const { removeFile, updateFile, clearAll } = useStagingStore();
  const activeUploads = useUploadStore((s) => s.activeUploads);
  const { uploadFile, uploadAll } = useFileUpload();
  const { can } = usePermissions();
  const { log } = useAuditLog();

  if (files.length === 0) return null;

  const readyCount = files.filter((f) => f.validationErrors.length === 0).length;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold text-text-primary">
          Staging Area
          <span className="ml-2 text-xs font-normal text-text-secondary">
            {files.length} file{files.length !== 1 ? 's' : ''} staged
            {readyCount < files.length && (
              <span className="text-status-failed ml-1">
                ({files.length - readyCount} with errors)
              </span>
            )}
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { clearAll(); log('staging_clear_all'); }}
            className="px-3 py-1.5 text-xs font-medium rounded-lg text-text-muted hover:text-text-secondary hover:bg-white/[0.05] border border-white/[0.06] transition-colors"
          >
            <Trash2 size={12} className="inline mr-1" />
            Clear All
          </button>
          <button
            onClick={uploadAll}
            disabled={readyCount === 0 || !can('upload')}
            className={cn(
              'px-4 py-1.5 text-xs font-semibold rounded-lg border transition-all',
              readyCount > 0 && can('upload')
                ? 'bg-status-queued/20 text-status-queued border-status-queued/20 hover:bg-status-queued/30'
                : 'opacity-50 cursor-not-allowed bg-white/[0.03] text-text-muted border-white/[0.06]',
            )}
            title={!can('upload') ? 'Requires upload permission' : undefined}
          >
            <Upload size={12} className="inline mr-1" />
            Upload All ({readyCount})
          </button>
        </div>
      </div>

      {/* File list */}
      <div className="divide-y divide-white/[0.03]">
        {files.map((file) => {
          const isUploading = activeUploads.has(file.id);
          const hasErrors = file.validationErrors.length > 0;
          const effectiveCategory =
            file.manualOverride?.category ??
            file.autoClassification?.category ??
            'other';
          const effectiveState =
            file.manualOverride?.state ??
            file.autoClassification?.stateCode ??
            '';
          const isAutoCategory = !file.manualOverride?.category && file.autoClassification?.category;
          const isAutoState = !file.manualOverride?.state && file.autoClassification?.stateCode;

          return (
            <div
              key={file.id}
              className={cn(
                'flex items-center gap-4 px-5 py-3',
                hasErrors && 'bg-status-failed/[0.03]',
              )}
            >
              {/* Icon */}
              <div className="flex-shrink-0">
                {hasErrors ? (
                  <AlertCircle size={18} className="text-status-failed" />
                ) : (
                  <CheckCircle2 size={18} className="text-status-imported" />
                )}
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-text-muted flex-shrink-0" />
                  <span className="font-mono text-xs text-text-primary truncate">
                    {file.fileName}
                  </span>
                  <span className="text-[10px] text-text-muted flex-shrink-0">
                    {formatSize(file.fileSize)}
                  </span>
                </div>
                {hasErrors && (
                  <p className="mt-1 text-[11px] text-status-failed">
                    {file.validationErrors[0]}
                  </p>
                )}
              </div>

              {/* Category dropdown */}
              <select
                value={effectiveCategory}
                onChange={(e) => {
                  const newCategory = e.target.value;
                  const newConfig = CATEGORY_BY_DB_KEY[newCategory];
                  const errors = newConfig ? validateFile(file.file, newConfig) : [];
                  updateFile(file.id, {
                    manualOverride: {
                      ...file.manualOverride,
                      category: newCategory,
                    },
                    validationErrors: errors,
                  });
                }}
                className={cn(
                  'px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.08] text-xs focus:outline-none focus:border-status-queued/50',
                  isAutoCategory ? 'text-text-ai-guess' : 'text-text-primary',
                )}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.dbKey} value={c.dbKey}>
                    {c.label}
                  </option>
                ))}
              </select>

              {/* State dropdown */}
              <select
                value={effectiveState}
                onChange={(e) => {
                  updateFile(file.id, {
                    manualOverride: {
                      ...file.manualOverride,
                      state: e.target.value || undefined,
                    },
                  });
                }}
                className={cn(
                  'px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.08] text-xs focus:outline-none focus:border-status-queued/50',
                  isAutoState ? 'text-text-ai-guess' : 'text-text-primary',
                )}
              >
                <option value="">No state</option>
                {STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code}
                  </option>
                ))}
              </select>

              {/* Upload / Remove buttons */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {!hasErrors && can('upload') && (
                  <button
                    onClick={() => uploadFile(file)}
                    disabled={isUploading}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-status-queued/15 text-status-queued border border-status-queued/20 hover:bg-status-queued/25 disabled:opacity-50 transition-all"
                  >
                    {isUploading ? 'Uploading...' : 'Upload'}
                  </button>
                )}
                <button
                  onClick={() => removeFile(file.id)}
                  className="p-1 rounded text-text-muted hover:text-status-failed transition-colors"
                  title="Remove from staging"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
