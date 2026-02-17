import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { useStagingStore } from '@/stores/staging';
import { useAutoClassify } from '@/hooks/useAutoClassify';
import { usePermissions } from '@/hooks/usePermissions';
import { CATEGORY_BY_DB_KEY } from '@/lib/constants';
import { validateFile } from '@/lib/file-validation';
import type { StagedFile } from '@/types/upload';

interface GlobalDropZoneProps {
  children: ReactNode;
}

/**
 * Full-window drag-and-drop overlay.
 * Activates on any drag into the browser window.
 * v5 spec: "Attach drag handler at root layout level (NOT scoped to small box)"
 */
export function GlobalDropZone({ children }: GlobalDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const { addFiles } = useStagingStore();
  const { classify } = useAutoClassify();
  const { can } = usePermissions();
  const dragCountRef = useRef(0);

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      dragCountRef.current++;
      if (dragCountRef.current === 1) {
        setIsDragging(true);
      }
    },
    [],
  );

  const handleDragLeave = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      dragCountRef.current--;
      if (dragCountRef.current === 0) {
        setIsDragging(false);
      }
    },
    [],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      dragCountRef.current = 0;
      setIsDragging(false);

      if (!can('upload')) {
        toast.error('Read-only users cannot upload files.');
        return;
      }

      const droppedFiles = e.dataTransfer?.files;
      if (!droppedFiles || droppedFiles.length === 0) return;

      const staged: StagedFile[] = [];

      for (let i = 0; i < droppedFiles.length; i++) {
        const file = droppedFiles[i]!;
        const classification = classify(file.name);

        // Determine target category for validation
        const categoryKey = classification.category ?? 'other';
        const categoryConfig = CATEGORY_BY_DB_KEY[categoryKey];

        const validationErrors = categoryConfig
          ? validateFile(file, categoryConfig)
          : ['Unknown category'];

        staged.push({
          id: crypto.randomUUID(),
          file,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          autoClassification: classification,
          manualOverride: null,
          validationErrors,
          hashHex: null, // JIT: computed before upload, not on drop
        });
      }

      addFiles(staged);

      const errorCount = staged.filter((f) => f.validationErrors.length > 0).length;
      if (errorCount > 0) {
        toast.warning(
          `${errorCount} of ${staged.length} files have validation issues. Review in staging area.`,
        );
      } else {
        toast.success(`${staged.length} file${staged.length > 1 ? 's' : ''} staged for upload.`);
      }
    },
    [addFiles, classify, can],
  );

  useEffect(() => {
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  return (
    <>
      {children}

      {/* Full-screen overlay when dragging */}
      {isDragging && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm border-[3px] border-dashed border-status-queued/50 animate-border-pulse">
          <div className="flex flex-col items-center gap-4">
            <Upload size={48} className="text-status-queued" />
            <p className="text-xl font-semibold text-text-primary">Release to Stage Files</p>
            <p className="text-sm text-text-secondary">
              Files will be auto-classified by filename
            </p>
          </div>
        </div>
      )}
    </>
  );
}
