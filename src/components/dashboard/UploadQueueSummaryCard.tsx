import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Upload, CheckCircle2, Loader2, AlertCircle, Clock } from 'lucide-react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useQueueStore } from '@/stores/queue';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';

export function UploadQueueSummaryCard() {
  const entries = useQueueStore((s) => s.entries);
  const { user } = useAuth();

  const stats = useMemo(() => {
    const mine = user ? entries.filter((e) => e.uploaded_by === user.id) : entries;
    return {
      total: mine.length,
      queued: mine.filter((e) => e.status === 'queued').length,
      processing: mine.filter((e) => e.status === 'processing').length,
      parsed: mine.filter((e) => e.status === 'parsed').length,
      failed: mine.filter((e) => e.status === 'failed').length,
    };
  }, [entries, user]);

  const BLOCKS = [
    { label: 'Queued', value: stats.queued, icon: Clock, color: 'text-blue-400' },
    { label: 'Processing', value: stats.processing, icon: Loader2, color: 'text-amber-400' },
    { label: 'Parsed', value: stats.parsed, icon: CheckCircle2, color: 'text-emerald-400' },
    { label: 'Failed', value: stats.failed, icon: AlertCircle, color: 'text-red-400' },
  ];

  return (
    <SpotlightCard className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium text-text-secondary">
          <Upload className="h-4 w-4 text-blue-400" />
          My Uploads
        </h3>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-text-muted">
          {stats.total} files
        </span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        {BLOCKS.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-center gap-2">
              <Icon className={cn('h-4 w-4', color)} />
              <span className="text-[10px] text-text-muted">{label}</span>
            </div>
            <p className="mt-1 font-mono text-lg font-bold text-text-primary">{value}</p>
          </div>
        ))}
      </div>

      <Link
        to="/compliance"
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 py-2 text-sm font-semibold text-blue-400 transition-colors hover:bg-blue-500/20"
      >
        <Upload className="h-4 w-4" />
        Upload Dashboard
      </Link>
    </SpotlightCard>
  );
}
