import { type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'danger' | 'success' | 'ghost';

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: string;
}

const VARIANT_STYLES: Record<Variant, string> = {
  primary:
    'bg-status-queued/15 text-status-queued border-status-queued/20 hover:bg-status-queued/25',
  danger:
    'bg-status-failed/15 text-status-failed border-status-failed/20 hover:bg-status-failed/25',
  success:
    'bg-status-imported/15 text-status-imported border-status-imported/20 hover:bg-status-imported/25',
  ghost:
    'bg-white/[0.03] text-text-secondary border-white/[0.08] hover:bg-white/[0.06] hover:text-text-primary',
};

/**
 * Glassmorphism button with backdrop blur.
 * Variants: primary (blue), danger (red), success (emerald), ghost.
 */
export function GlassButton({
  variant = 'primary',
  loading,
  disabled,
  className,
  children,
  title,
  ...props
}: GlassButtonProps) {
  const isDisabled = disabled || !!loading;

  return (
    <button
      disabled={isDisabled}
      className={cn(
        'px-4 py-2 text-xs font-semibold rounded-xl border backdrop-blur-sm transition-all',
        isDisabled
          ? 'opacity-50 cursor-not-allowed bg-white/[0.03] text-text-muted border-white/[0.06]'
          : VARIANT_STYLES[variant],
        className,
      )}
      title={isDisabled && !loading ? title ?? 'Requires Environmental Manager or Admin role' : title}
      {...props}
    >
      {loading ? (
        <span className="inline-flex items-center gap-1.5">
          <svg
            className="animate-spin h-3 w-3"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          {loading}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
