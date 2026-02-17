import { useState } from 'react';
import { AlertTriangle, CheckCircle, Eye, XCircle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import type { ExceedanceWithRelations, ExceedanceSeverity, ExceedanceStatus } from '@/types';

interface ExceedanceTableProps {
  exceedances: ExceedanceWithRelations[];
  loading: boolean;
  onAcknowledge?: (id: string) => void;
  onResolve?: (id: string) => void;
  onMarkFalsePositive?: (id: string) => void;
}

const SEVERITY_CONFIG: Record<ExceedanceSeverity, { label: string; color: string; icon: typeof AlertTriangle }> = {
  critical: { label: 'Critical', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: AlertTriangle },
  major: { label: 'Major', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: AlertTriangle },
  moderate: { label: 'Moderate', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: AlertTriangle },
  minor: { label: 'Minor', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: AlertTriangle },
};

const STATUS_CONFIG: Record<ExceedanceStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  open: { label: 'Open', color: 'bg-red-500/20 text-red-400', icon: AlertTriangle },
  acknowledged: { label: 'Acknowledged', color: 'bg-yellow-500/20 text-yellow-400', icon: Eye },
  under_investigation: { label: 'Investigating', color: 'bg-blue-500/20 text-blue-400', icon: Clock },
  resolved: { label: 'Resolved', color: 'bg-green-500/20 text-green-400', icon: CheckCircle },
  false_positive: { label: 'False Positive', color: 'bg-gray-500/20 text-gray-400', icon: XCircle },
};

/**
 * Simple date formatter without external dependencies.
 * Formats date as "MMM d, yyyy" (e.g., "Feb 17, 2026")
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Simple datetime formatter without external dependencies.
 * Formats as "MMM d, yyyy h:mm a" (e.g., "Feb 17, 2026 3:45 PM")
 */
function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Status/severity badge component (inline styled, not using GlassBadge)
 */
function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border backdrop-blur-sm',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ExceedanceTable({
  exceedances,
  loading,
  onAcknowledge,
  onResolve,
  onMarkFalsePositive,
}: ExceedanceTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (exceedances.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium">No exceedances found</p>
        <p className="text-sm">All lab results are within permit limits</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left py-3 px-4 font-medium text-muted-foreground w-8"></th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Outfall</th>
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Parameter</th>
            <th className="text-right py-3 px-4 font-medium text-muted-foreground">Result</th>
            <th className="text-right py-3 px-4 font-medium text-muted-foreground">Limit</th>
            <th className="text-right py-3 px-4 font-medium text-muted-foreground">Exceeded By</th>
            <th className="text-center py-3 px-4 font-medium text-muted-foreground">Severity</th>
            <th className="text-center py-3 px-4 font-medium text-muted-foreground">Status</th>
            <th className="text-right py-3 px-4 font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {exceedances.map((exceedance) => {
            const severityConfig = SEVERITY_CONFIG[exceedance.severity];
            const statusConfig = STATUS_CONFIG[exceedance.status];
            const isExpanded = expandedId === exceedance.id;

            // Get units from joined relations
            const resultUnit = exceedance.lab_result?.unit || '';
            const limitUnit = exceedance.permit_limit?.unit || '';

            return (
              <>
                <tr
                  key={exceedance.id}
                  className={clsx(
                    'border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors',
                    isExpanded && 'bg-white/5',
                  )}
                  onClick={() => setExpandedId(isExpanded ? null : exceedance.id)}
                >
                  <td className="py-3 px-4">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {formatDate(exceedance.sample_date)}
                  </td>
                  <td className="py-3 px-4 font-mono">
                    {exceedance.outfall?.outfall_number || 'Unknown'}
                  </td>
                  <td className="py-3 px-4">
                    {exceedance.parameter?.short_name || exceedance.parameter?.name || 'Unknown'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    {exceedance.result_value.toFixed(2)}
                    {resultUnit && (
                      <span className="text-muted-foreground ml-1">{resultUnit}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    {exceedance.limit_value.toFixed(2)}
                    {limitUnit && (
                      <span className="text-muted-foreground ml-1">{limitUnit}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={clsx(
                      'font-mono',
                      exceedance.exceedance_pct && exceedance.exceedance_pct > 50 ? 'text-red-400' : 'text-yellow-400',
                    )}>
                      +{exceedance.exceedance_pct?.toFixed(1) || '0'}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Badge className={severityConfig.color}>
                      {severityConfig.label}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Badge className={statusConfig.color}>
                      {statusConfig.label}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      {exceedance.status === 'open' && onAcknowledge && (
                        <button
                          className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors"
                          onClick={() => onAcknowledge(exceedance.id)}
                        >
                          Acknowledge
                        </button>
                      )}
                      {(exceedance.status === 'open' || exceedance.status === 'acknowledged') && onResolve && (
                        <button
                          className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                          onClick={() => onResolve(exceedance.id)}
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${exceedance.id}-detail`} className="bg-white/5">
                    <td colSpan={10} className="p-4">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Detected:</span>{' '}
                          {exceedance.detected_at ? formatDateTime(exceedance.detected_at) : 'N/A'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Limit Type:</span>{' '}
                          {exceedance.limit_type || 'N/A'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Corrective Action:</span>{' '}
                          {exceedance.corrective_action ? (
                            <span className="text-primary">{exceedance.corrective_action.title}</span>
                          ) : (
                            'None'
                          )}
                        </div>
                      </div>
                      {exceedance.status === 'open' && onMarkFalsePositive && (
                        <div className="mt-4 pt-4 border-t border-white/10">
                          <button
                            className="text-xs px-2 py-1 rounded bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition-colors"
                            onClick={() => onMarkFalsePositive(exceedance.id)}
                          >
                            Mark as False Positive
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
