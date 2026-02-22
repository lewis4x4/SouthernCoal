import { useState } from 'react';
import { X, Play, Mail, Download, Loader2 } from 'lucide-react';
import type { ReportDefinitionWithAccess } from '@/hooks/useReportDefinitions';

interface ReportConfigDrawerProps {
  report: ReportDefinitionWithAccess;
  onClose: () => void;
  onGenerate: (config: {
    format: 'csv' | 'pdf' | 'both';
    config: Record<string, unknown>;
    delivery: { download?: boolean; email?: boolean };
  }) => void;
  generating: boolean;
}

const STATES = ['AL', 'KY', 'TN', 'VA', 'WV'] as const;

export function ReportConfigDrawer({
  report,
  onClose,
  onGenerate,
  generating,
}: ReportConfigDrawerProps) {
  const [format, setFormat] = useState<'csv' | 'pdf' | 'both'>('csv');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [deliveryDownload, setDeliveryDownload] = useState(true);
  const [deliveryEmail, setDeliveryEmail] = useState(false);

  const toggleState = (st: string) => {
    setSelectedStates((prev) =>
      prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st],
    );
  };

  const handleGenerate = () => {
    const config: Record<string, unknown> = {};
    if (dateFrom) config.date_from = dateFrom;
    if (dateTo) config.date_to = dateTo;
    if (selectedStates.length > 0) config.states = selectedStates;

    onGenerate({
      format,
      config,
      delivery: { download: deliveryDownload, email: deliveryEmail },
    });
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[480px] border-l border-white/[0.08] bg-crystal-base/95 backdrop-blur-xl shadow-2xl overflow-y-auto">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              #{report.report_number} &middot; Tier {report.tier}
            </p>
            <h3 className="text-lg font-semibold text-text-primary mt-1">
              {report.title}
            </h3>
            <p className="mt-1 text-xs text-text-muted">{report.description}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-white/[0.06] hover:text-text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Format */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-text-secondary">Format</label>
          <div className="flex gap-2">
            {(['csv', 'pdf', 'both'] as const).map((f) => {
              const available =
                f === 'both'
                  ? report.formats_available.includes('csv') &&
                    report.formats_available.includes('pdf')
                  : report.formats_available.includes(f);
              return (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  disabled={!available}
                  className={`rounded-lg px-4 py-2 text-xs font-medium uppercase transition-all ${
                    format === f
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : available
                        ? 'bg-white/[0.04] text-text-muted border border-white/[0.06] hover:bg-white/[0.06]'
                        : 'bg-white/[0.02] text-text-muted/50 border border-white/[0.04] cursor-not-allowed'
                  }`}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date Range */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-text-secondary">
            Date Range <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-text-muted block mb-1">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-text-primary focus:border-primary/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-muted block mb-1">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-text-primary focus:border-primary/50 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* State Filter */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-text-secondary">
            State Filter <span className="text-text-muted font-normal">(optional — all states if none selected)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {STATES.map((st) => (
              <button
                key={st}
                onClick={() => toggleState(st)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  selectedStates.includes(st)
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'bg-white/[0.04] text-text-muted border border-white/[0.06] hover:bg-white/[0.06]'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Delivery */}
        <div className="space-y-3">
          <label className="text-xs font-medium text-text-secondary">Delivery</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={deliveryDownload}
                onChange={(e) => setDeliveryDownload(e.target.checked)}
                className="rounded border-white/20 bg-white/[0.05] text-primary focus:ring-primary/30"
              />
              <Download className="h-3.5 w-3.5 text-text-muted" />
              <span className="text-xs text-text-secondary">Download file</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={deliveryEmail}
                onChange={(e) => setDeliveryEmail(e.target.checked)}
                className="rounded border-white/20 bg-white/[0.05] text-primary focus:ring-primary/30"
              />
              <Mail className="h-3.5 w-3.5 text-text-muted" />
              <span className="text-xs text-text-secondary">Email to recipients</span>
            </label>
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={generating || (!deliveryDownload && !deliveryEmail)}
          className={`w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
            generating
              ? 'bg-primary/10 text-primary/60 cursor-wait'
              : 'bg-primary/15 text-primary hover:bg-primary/25 active:scale-[0.98]'
          }`}
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Generate Report
            </>
          )}
        </button>
      </div>
    </div>
  );
}
