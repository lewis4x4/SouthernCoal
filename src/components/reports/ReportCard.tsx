import { Lock, Play, Clock, AlertTriangle } from 'lucide-react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import type { ReportDefinitionWithAccess } from '@/hooks/useReportDefinitions';

const PRIORITY_COLORS: Record<string, { dot: string; glow: string; spotlight: string }> = {
  CRITICAL: {
    dot: 'bg-red-400',
    glow: 'shadow-[0_0_8px_rgba(248,113,113,0.8)]',
    spotlight: 'rgba(239, 68, 68, 0.05)',
  },
  HIGH: {
    dot: 'bg-amber-400',
    glow: 'shadow-[0_0_8px_rgba(251,191,36,0.8)]',
    spotlight: 'rgba(245, 158, 11, 0.05)',
  },
  MEDIUM: {
    dot: 'bg-slate-400',
    glow: 'shadow-[0_0_8px_rgba(148,163,184,0.5)]',
    spotlight: 'rgba(148, 163, 184, 0.03)',
  },
};

interface ReportCardProps {
  report: ReportDefinitionWithAccess;
  onGenerate: (report: ReportDefinitionWithAccess) => void;
  lastGenerated?: string | null;
}

export function ReportCard({ report, onGenerate, lastGenerated }: ReportCardProps) {
  const defaultColors = { dot: 'bg-slate-400', glow: 'shadow-[0_0_8px_rgba(148,163,184,0.5)]', spotlight: 'rgba(148, 163, 184, 0.03)' };
  const colors = PRIORITY_COLORS[report.priority] ?? defaultColors;
  const isDisabled = report.is_locked || !report.has_access;

  return (
    <SpotlightCard
      spotlightColor={isDisabled ? 'rgba(100, 100, 100, 0.02)' : colors.spotlight}
      className={`p-4 border-transparent bg-white/[0.01] transition-all ${isDisabled ? 'opacity-50' : 'hover:bg-white/[0.03]'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Report number + priority badge */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-mono text-text-muted">
              #{report.report_number}
            </span>
            <div className={`h-1.5 w-1.5 rounded-full ${colors.dot} ${colors.glow}`} />
            {report.is_locked && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold text-slate-500">
                <Lock className="h-2.5 w-2.5" />
                LOCKED
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold text-text-primary leading-tight truncate">
            {report.title}
          </h3>

          {/* Description */}
          <p className="mt-1 text-[11px] text-text-muted leading-relaxed line-clamp-2">
            {report.description}
          </p>

          {/* Footer: formats + last generated */}
          <div className="mt-2.5 flex items-center gap-3">
            <div className="flex items-center gap-1">
              {report.formats_available.map((fmt) => (
                <span
                  key={fmt}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-white/[0.04] text-text-muted border border-white/[0.06]"
                >
                  {fmt}
                </span>
              ))}
            </div>
            {lastGenerated && (
              <span className="text-[10px] text-text-muted flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {new Date(lastGenerated).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Lock reason */}
          {report.is_locked && report.prerequisite_condition && (
            <div className="mt-2 flex items-start gap-1.5 text-[10px] text-amber-400/80">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{report.prerequisite_condition}</span>
            </div>
          )}
        </div>

        {/* Generate button */}
        <button
          onClick={() => onGenerate(report)}
          disabled={isDisabled}
          className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${isDisabled
              ? 'bg-white/[0.03] text-text-muted cursor-not-allowed'
              : 'bg-primary/10 text-primary hover:bg-primary/20 active:scale-95'
            }`}
          title={
            report.is_locked
              ? 'Report locked — prerequisite data not available'
              : !report.has_access
                ? 'You do not have permission to generate this report'
                : 'Configure and generate report'
          }
        >
          {isDisabled ? (
            <>
              <Lock className="h-3 w-3" />
              Locked
            </>
          ) : (
            <>
              <Play className="h-3 w-3" />
              Generate
            </>
          )}
        </button>
      </div>
    </SpotlightCard>
  );
}
