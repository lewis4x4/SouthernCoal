import { useState } from 'react';
import { FileText, Download, Loader2 } from 'lucide-react';
import { supabase, getFreshToken } from '@/lib/supabase';

interface EvidencePacketButtonProps {
  eventId: string;
  eventStatus: 'alert_generated' | 'activated' | 'dismissed' | 'completed';
  className?: string;
}

export function EvidencePacketButton({
  eventId,
  eventStatus,
  className = '',
}: EvidencePacketButtonProps) {
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only render for qualifying statuses
  if (eventStatus === 'alert_generated') return null;

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setDownloadUrl(null);

    try {
      const token = await getFreshToken();

      const { data, error: fnError } = await supabase.functions.invoke(
        'generate-precipitation-evidence-pdf',
        {
          body: { event_id: eventId },
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (fnError) {
        throw new Error(fnError.message ?? 'Failed to generate evidence packet');
      }

      if (data?.url) {
        setDownloadUrl(data.url);
      } else {
        throw new Error('No download URL returned');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  if (downloadUrl) {
    return (
      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-500 ${className}`}
      >
        <Download className="h-3.5 w-3.5" />
        Download Evidence Packet
      </a>
    );
  }

  return (
    <div>
      <button
        onClick={handleGenerate}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <FileText className="h-3.5 w-3.5" />
            Generate Evidence Packet
          </>
        )}
      </button>
      {error && (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
