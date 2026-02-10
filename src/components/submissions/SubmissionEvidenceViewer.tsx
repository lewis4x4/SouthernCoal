import { FileText, Image, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface SubmissionEvidenceViewerProps {
  paths: string[];
  bucket: string;
}

/**
 * Displays uploaded evidence for a submission.
 * Shows file icon, name, and download link.
 *
 * Wire into any submission detail view:
 *   <SubmissionEvidenceViewer paths={evidencePaths} bucket="dmrs" />
 */
export function SubmissionEvidenceViewer({ paths, bucket }: SubmissionEvidenceViewerProps) {
  if (paths.length === 0) {
    return (
      <div className="py-2 text-xs text-text-muted">No evidence files attached.</div>
    );
  }

  async function handleDownload(path: string) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 300); // 5 min signed URL

    if (error || !data?.signedUrl) {
      toast.error('Failed to generate download link');
      return;
    }

    window.open(data.signedUrl, '_blank');
  }

  return (
    <div className="space-y-1.5">
      {paths.map((path) => {
        const fileName = path.split('/').pop() ?? path;
        const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
        const isImage = ['png', 'jpg', 'jpeg', 'tiff'].includes(ext);
        const Icon = isImage ? Image : FileText;

        return (
          <div
            key={path}
            className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
          >
            <Icon className="h-4 w-4 shrink-0 text-text-muted" />
            <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
              {fileName}
            </span>
            <button
              onClick={() => handleDownload(path)}
              className="shrink-0 rounded p-1 text-text-muted transition-colors hover:bg-white/[0.05] hover:text-blue-400"
              title="Download"
            >
              <Download size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
