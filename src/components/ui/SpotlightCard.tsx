import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  /** @deprecated Quiet Operator uses flat cards; kept for call-site compat */
  spotlightColor?: string;
}

/**
 * Quiet Operator surface card — flat white, hairline border, generous radius.
 * Replaces Living Crystal glassmorphism spotlight cards.
 */
export function SpotlightCard({ children, className }: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className={cn(
        'relative overflow-hidden rounded-qo border border-black/[0.08] bg-qo-card',
        className,
      )}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}
