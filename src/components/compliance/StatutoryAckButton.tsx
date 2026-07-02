import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Props {
  needsAck: boolean;
  onAck: () => void | Promise<unknown>;
  acknowledging?: boolean;
  loading?: boolean;
  className?: string;
  compact?: boolean;
}

export function StatutoryAckButton({
  needsAck,
  onAck,
  acknowledging = false,
  loading = false,
  className,
  compact,
}: Props) {
  if (!needsAck && !acknowledging) {
    if (loading) return null;
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-[10px] text-emerald-400/90',
          className,
        )}
      >
        <Check size={12} />
        Acknowledged
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={acknowledging || loading}
      onClick={() => void onAck()}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border border-qo-accent/30 bg-qo-accent/10 font-medium text-qo-accent hover:bg-qo-accent/20 disabled:opacity-50',
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1.5 text-xs',
        className,
      )}
      title="Record that you have seen this alert. Does not dismiss or change triage status."
    >
      {acknowledging ? <Loader2 size={12} className="animate-spin" /> : null}
      Ack alert
    </button>
  );
}
