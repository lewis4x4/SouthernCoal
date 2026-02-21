import { cn } from '@/lib/cn';

type BadgeVariant =
  | 'uploaded'
  | 'queued'
  | 'processing'
  | 'parsed'
  | 'imported'
  | 'embedded'
  | 'embedding_failed'
  | 'failed'
  | 'uploading'
  | 'unreviewed'
  | 'in_review'
  | 'verified'
  | 'disputed';

interface GlassBadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  // File status badges
  uploaded: 'bg-[rgba(59,130,246,0.15)] text-[#93bbfd] border-[rgba(59,130,246,0.2)]',
  queued: 'bg-[rgba(59,130,246,0.15)] text-[#93bbfd] border-[rgba(59,130,246,0.2)]',
  processing:
    'bg-[rgba(245,158,11,0.15)] text-[#fbbf24] border-[rgba(245,158,11,0.2)] animate-pulse-glow-amber',
  parsed: 'bg-[rgba(6,182,212,0.15)] text-[#67e8f9] border-[rgba(6,182,212,0.2)]',
  imported: 'bg-[rgba(16,185,129,0.15)] text-[#6ee7b7] border-[rgba(16,185,129,0.2)]',
  embedded: 'bg-[rgba(16,185,129,0.15)] text-[#6ee7b7] border-[rgba(16,185,129,0.2)]',
  embedding_failed: 'bg-[rgba(245,158,11,0.15)] text-[#fbbf24] border-[rgba(245,158,11,0.2)]',
  failed: 'bg-[rgba(239,68,68,0.15)] text-[#fca5a5] border-[rgba(239,68,68,0.2)]',
  uploading:
    'bg-[rgba(139,92,246,0.15)] text-[#c4b5fd] border-[rgba(139,92,246,0.2)] animate-pulse-glow-violet',

  // Verification badges (v6 Section 5)
  unreviewed: 'bg-[rgba(168,85,247,0.15)] text-[#c4b5fd] border-[rgba(168,85,247,0.2)]',
  in_review: 'bg-[rgba(234,179,8,0.15)] text-[#fbbf24] border-[rgba(234,179,8,0.2)]',
  verified: 'bg-[rgba(34,197,94,0.15)] text-[#86efac] border-[rgba(34,197,94,0.2)]',
  disputed: 'bg-[rgba(239,68,68,0.15)] text-[#fca5a5] border-[rgba(239,68,68,0.2)]',
};

/**
 * Glassmorphism status badge — rounded pill with backdrop blur.
 * v5 design system: backdrop-filter: blur(12px), rounded-full, 12px font.
 */
export function GlassBadge({ variant, children, className }: GlassBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-3 py-0.5 rounded-full text-[11px] font-semibold tracking-wide border backdrop-blur-sm transition-all duration-300',
        VARIANT_STYLES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
