import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, RefreshCw, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ErrorForensicsProps {
  errorLog: unknown[] | null;
  onRetry?: () => void;
  className?: string;
}

interface ParsedError {
  summary: string;
  detail: string;
  action?: {
    label: string;
    icon: React.ReactNode;
    onClick?: () => void;
  };
}

/**
 * Human-readable error display for failed file processing.
 * Parses error_log JSON into actionable messages.
 * v5: "Never dump raw JSON at top level."
 */
export function ErrorForensics({ errorLog, onRetry, className }: ErrorForensicsProps) {
  const [showTechnical, setShowTechnical] = useState(false);
  const [copied, setCopied] = useState(false);

  const errors = parseErrors(errorLog, onRetry);

  if (errors.length === 0) {
    return (
      <div className={cn('p-4 text-sm text-text-muted', className)}>
        No error details available.
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {errors.map((error, i) => (
        <div
          key={i}
          className="p-3 rounded-lg bg-status-failed/[0.05] border border-status-failed/10"
        >
          <p className="text-sm text-text-primary font-medium">{error.summary}</p>
          {error.detail && (
            <p className="mt-1 text-xs text-text-secondary">{error.detail}</p>
          )}
          {error.action && (
            <button
              onClick={error.action.onClick}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/[0.05] text-text-secondary border border-white/[0.08] hover:bg-white/[0.08] transition-colors"
            >
              {error.action.icon}
              {error.action.label}
            </button>
          )}
        </div>
      ))}

      {/* Technical Details (collapsible) */}
      <div>
        <button
          onClick={() => setShowTechnical(!showTechnical)}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          {showTechnical ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Technical Details
        </button>
        {showTechnical && (
          <div className="mt-2 relative">
            <pre className="p-3 rounded-lg bg-crystal-surface text-[11px] text-text-secondary font-mono overflow-x-auto max-h-48 border border-white/[0.04]">
              {JSON.stringify(errorLog, null, 2)}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(errorLog, null, 2));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="absolute top-2 right-2 p-1.5 rounded text-text-muted hover:text-text-secondary hover:bg-white/[0.05] transition-colors"
              title="Copy error details"
            >
              <Copy size={12} />
              {copied && (
                <span className="absolute -top-6 right-0 text-[10px] text-status-imported">
                  Copied!
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function parseErrors(
  errorLog: unknown[] | null,
  onRetry?: () => void,
): ParsedError[] {
  if (!errorLog || errorLog.length === 0) return [];

  return errorLog.map((entry) => {
    const msg = typeof entry === 'string' ? entry : JSON.stringify(entry);
    const lower = msg.toLowerCase();

    // Pattern-match common errors to human-readable messages
    if (lower.includes('password') && lower.includes('protect')) {
      return {
        summary: 'This PDF is password-protected',
        detail: 'The file cannot be processed because it requires a password to open.',
        action: {
          label: 'Re-upload Unlocked Version',
          icon: <UploadCloud size={12} />,
        },
      };
    }

    if (lower.includes('corrupt') || lower.includes('invalid pdf')) {
      return {
        summary: 'This file appears to be corrupted',
        detail: 'The PDF could not be read. It may be damaged or not a valid PDF file.',
        action: {
          label: 'Re-upload',
          icon: <UploadCloud size={12} />,
        },
      };
    }

    if (lower.includes('no permit number') || lower.includes('permit number not found')) {
      return {
        summary: 'No permit number found in this document',
        detail:
          'The AI extraction could not find an NPDES permit number. Check that this is an NPDES permit document.',
        action: undefined,
      };
    }

    if (lower.includes('timeout') || lower.includes('timed out')) {
      return {
        summary: 'Processing took too long',
        detail: 'The document processing timed out. This can happen with very large or complex documents.',
        action: onRetry
          ? {
              label: 'Retry Processing',
              icon: <RefreshCw size={12} />,
              onClick: onRetry,
            }
          : undefined,
      };
    }

    // Default: show raw message
    return {
      summary: msg.length > 120 ? msg.slice(0, 120) + '...' : msg,
      detail: '',
      action: onRetry
        ? {
            label: 'Retry Processing',
            icon: <RefreshCw size={12} />,
            onClick: onRetry,
          }
        : undefined,
    };
  });
}
