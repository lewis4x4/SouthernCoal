import { type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'danger' | 'success' | 'ghost';

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: string;
}

const VARIANT_STYLES: Record<Variant, string> = {
  primary:
    'bg-qo-accent text-white border-qo-accent hover:bg-qo-accent-hover',
  danger:
    'bg-qo-risk/10 text-qo-risk border-qo-risk/30 hover:bg-qo-risk/15',
  success:
    'bg-qo-sage/10 text-qo-sage-text border-qo-sage/30 hover:bg-qo-sage/15',
  ghost:
    'bg-white text-text-secondary border-black/[0.12] hover:bg-black/[0.04] hover:text-text-primary',
};

/** Quiet Operator button — flat, no glass blur. */
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
        'rounded-qo-sm border px-4 py-2 text-xs font-semibold transition-colors',
        isDisabled
          ? 'cursor-not-allowed border-black/[0.08] bg-qo-nested text-text-muted opacity-50'
          : VARIANT_STYLES[variant],
        className,
      )}
      title={isDisabled && !loading ? title ?? 'Requires Environmental Manager or Admin role' : title}
      {...props}
    >
      {loading ? (
        <span className="inline-flex items-center gap-1.5">
          <svg
            className="h-3 w-3 animate-spin"
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
