import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { Upload, X, FileText, Image, File } from 'lucide-react';
import clsx from 'clsx';

interface HandoffDropZoneProps {
  onFileSelect: (file: File) => void;
  onFileClear?: () => void;
  selectedFile?: File | null;
  maxSize?: number;
  accept?: string[];
  disabled?: boolean;
}

const DEFAULT_ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

function getFileIcon(mimeType: string): React.ElementType {
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType === 'application/pdf') return FileText;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function HandoffDropZone({
  onFileSelect,
  onFileClear,
  selectedFile,
  maxSize = MAX_FILE_SIZE,
  accept = DEFAULT_ACCEPTED_TYPES,
  disabled = false,
}: HandoffDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback(
    (file: File): string | null => {
      // Check file size
      if (file.size > maxSize) {
        return `File too large. Maximum size is ${formatFileSize(maxSize)}.`;
      }

      // Check MIME type
      if (!accept.includes(file.type)) {
        return 'File type not supported. Please upload PNG, JPEG, PDF, or Excel files.';
      }

      return null;
    },
    [maxSize, accept]
  );

  const handleFile = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setError(null);
      onFileSelect(file);
    },
    [validateFile, onFileSelect]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]!);
      }
    },
    [disabled, handleFile]
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]!);
      }
      // Reset input value so same file can be selected again
      e.target.value = '';
    },
    [handleFile]
  );

  const handleBrowseClick = useCallback(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.click();
    }
  }, [disabled]);

  const handleClear = useCallback(() => {
    setError(null);
    onFileClear?.();
  }, [onFileClear]);

  // If a file is selected, show the file preview
  if (selectedFile) {
    const FileIcon = getFileIcon(selectedFile.type);
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <FileIcon className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary truncate max-w-[200px]">
                {selectedFile.name}
              </p>
              <p className="text-xs text-text-muted">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
          </div>
          <button
            onClick={handleClear}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/[0.05] transition-colors"
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        className={clsx(
          'relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer',
          isDragging
            ? 'border-cyan-400 bg-cyan-400/10'
            : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]',
          disabled && 'opacity-50 cursor-not-allowed',
          error && 'border-red-500/50'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleBrowseClick}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Drop zone for file upload"
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept.join(',')}
          onChange={handleChange}
          className="hidden"
          disabled={disabled}
        />

        <div className="flex flex-col items-center justify-center p-6 text-center">
          <div
            className={clsx(
              'p-3 rounded-xl mb-3 transition-colors',
              isDragging ? 'bg-cyan-400/20' : 'bg-white/[0.04]'
            )}
          >
            <Upload
              className={clsx(
                'h-8 w-8 transition-colors',
                isDragging ? 'text-cyan-400' : 'text-white/40'
              )}
            />
          </div>
          <p className="text-sm text-text-secondary mb-1">
            Drag & drop a file here, or{' '}
            <span className="text-cyan-400 hover:underline">browse</span>
          </p>
          <p className="text-xs text-text-muted">
            PNG, JPEG, PDF, Excel up to 25MB
          </p>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <X className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}
