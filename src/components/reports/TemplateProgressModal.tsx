import { Download, Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react';

interface TemplateProgressModalProps {
    templateName: string;
    jobs: Array<{
        report_key: string;
        report_title: string;
        status: 'pending' | 'generating' | 'complete' | 'failed';
        download_url?: string;
        row_count?: number;
    }>;
    currentIndex: number;
    totalCount: number;
    onDownloadAll: () => void;
    onClose: () => void;
}

export function TemplateProgressModal({
    templateName,
    jobs,
    currentIndex,
    totalCount,
    onDownloadAll,
    onClose,
}: TemplateProgressModalProps) {
    const isAllComplete = jobs.every((j) => j.status === 'complete' || j.status === 'failed');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#0A0A0A] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/[0.04]">
                    <div>
                        <h2 className="text-lg font-medium text-text-primary">Running Template</h2>
                        <p className="text-sm text-text-muted mt-1">{templateName}</p>
                    </div>
                    {isAllComplete && (
                        <button
                            onClick={onClose}
                            className="rounded-full p-2 text-text-muted hover:bg-white/[0.04] hover:text-text-secondary transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="p-6 flex-1 overflow-y-auto min-h-0">
                    <div className="mb-6 flex items-center justify-between">
                        <span className="text-sm font-medium text-text-secondary">Overall Progress</span>
                        <span className="text-sm font-mono text-text-muted">
                            {currentIndex} / {totalCount} Reports
                        </span>
                    </div>

                    {/* Global Progress Bar */}
                    <div className="h-2 w-full bg-white/[0.04] rounded-full overflow-hidden mb-8">
                        <div
                            className="h-full bg-primary transition-all duration-500 ease-out"
                            style={{ width: `${(currentIndex / totalCount) * 100}%` }}
                        />
                    </div>

                    {/* Job List */}
                    <div className="space-y-3">
                        {jobs.map((job) => (
                            <div
                                key={job.report_key}
                                className={`p-4 rounded-xl border transition-colors ${job.status === 'generating'
                                    ? 'border-primary/30 bg-primary/5'
                                    : 'border-white/[0.04] bg-white/[0.02]'
                                    }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <h4 className="text-sm font-medium text-text-primary truncate">
                                            {job.report_title}
                                        </h4>

                                        {job.status === 'complete' && job.row_count != null && (
                                            <p className="text-xs text-text-muted mt-1">
                                                {job.row_count.toLocaleString()} records processed
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex-shrink-0 flex items-center">
                                        {job.status === 'pending' && (
                                            <div className="h-5 flex items-center">
                                                <div className="h-2 w-2 rounded-full bg-white/[0.1] animate-pulse" />
                                            </div>
                                        )}
                                        {job.status === 'generating' && (
                                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                        )}
                                        {job.status === 'complete' && (
                                            <div className="flex items-center gap-3">
                                                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                                                {job.download_url && (
                                                    <a
                                                        href={job.download_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-1.5 rounded-lg bg-white/[0.04] text-text-muted hover:bg-white/[0.08] hover:text-text-primary transition-colors"
                                                        title="Download Report"
                                                    >
                                                        <Download className="h-4 w-4" />
                                                    </a>
                                                )}
                                            </div>
                                        )}
                                        {job.status === 'failed' && (
                                            <AlertTriangle className="h-5 w-5 text-red-400" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                {isAllComplete && (
                    <div className="p-6 border-t border-white/[0.04] bg-white/[0.01]">
                        <button
                            onClick={onDownloadAll}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                            <Download className="h-4 w-4" />
                            Download All Reports
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
