import { useState, useRef, type DragEvent } from 'react';
import { Upload, FileCheck, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';

interface EvidenceCaptureProps {
  submissionType: 'dmr' | 'quarterly_report' | 'notification' | 'correction' | 'roadmap';
  referenceId: string;
  bucket: string;
  pathPrefix: string;
  onUploaded: (path: string) => void;
  acceptedTypes?: string[];
}

const DEFAULT_ACCEPTED = ['.pdf', '.png', '.jpg', '.jpeg'];

/**
 * Reusable evidence upload zone for portal submissions.
 * Drag-and-drop or file picker. Uploads to specified bucket + prefix.
 *
 * Wire into any submission workflow:
 *   <EvidenceCaptureUpload
 *     submissionType="dmr"
 *     referenceId={dmrId}
 *     bucket="dmrs"
 *     pathPrefix="receipts/"
 *     onUploaded={(path) => saveEvidencePath(path)}
 *   />
 */
export function EvidenceCaptureUpload({
  submissionType,
  referenceId,
  bucket,
  pathPrefix,
  onUploaded,
  acceptedTypes = DEFAULT_ACCEPTED,
}: EvidenceCaptureProps) {
  const { log } = useAuditLog();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }

  async function uploadFile(file: File) {
    // Validate file type
    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
    if (!acceptedTypes.includes(ext)) {
      toast.error(`File type ${ext} not accepted. Allowed: ${acceptedTypes.join(', ')}`);
      return;
    }

    // Validate size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large. Maximum 10MB.');
      return;
    }

    setUploading(true);

    const storagePath = `${pathPrefix}${referenceId}/${Date.now()}_${file.name}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (error) {
      toast.error(`Upload failed: ${error.message}`);
      setUploading(false);
      return;
    }

    log('evidence_uploaded', {
      submission_type: submissionType,
      reference_id: referenceId,
      file_name: file.name,
      file_size: file.size,
    }, {
      module: submissionType,
      tableName: 'evidence',
    });

    setUploadedPath(storagePath);
    setUploading(false);
    onUploaded(storagePath);
    toast.success(`Evidence uploaded: ${file.name}`);
  }

  if (uploadedPath) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
        <FileCheck className="h-4 w-4 text-emerald-400" />
        <span className="text-xs text-emerald-400">Evidence uploaded</span>
        <button
          onClick={() => {
            setUploadedPath(null);
            if (inputRef.current) inputRef.current.value = '';
          }}
          className="ml-auto text-text-muted hover:text-text-secondary"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition-all',
        isDragging
          ? 'border-blue-400/40 bg-blue-500/5'
          : 'border-white/[0.1] bg-white/[0.01] hover:border-white/[0.15] hover:bg-white/[0.03]',
        uploading && 'pointer-events-none opacity-60',
      )}
    >
      {uploading ? (
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      ) : (
        <Upload className="h-5 w-5 text-text-muted" />
      )}
      <div className="text-xs text-text-muted">
        {uploading ? 'Uploading...' : 'Drop evidence file or click to browse'}
      </div>
      <div className="text-[10px] text-text-muted/60">
        {acceptedTypes.join(', ')} &middot; Max 10MB
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={acceptedTypes.join(',')}
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}
