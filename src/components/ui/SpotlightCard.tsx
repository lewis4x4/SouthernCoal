import { useRef, type ReactNode, type MouseEvent } from 'react';
import { cn } from '@/lib/cn';

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
}

/**
 * Cursor-tracking glassmorphism card.
 * Radial gradient spotlight follows the mouse pointer.
 */
export function SpotlightCard({
  children,
  className,
  spotlightColor = 'rgba(59, 130, 246, 0.08)',
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--y', `${e.clientY - rect.top}px`);
  }

  function handleMouseLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.removeProperty('--x');
    el.style.removeProperty('--y');
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'relative rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl overflow-hidden',
        'shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]',
        className,
      )}
      style={{
        background: `radial-gradient(600px circle at var(--x, 50%) var(--y, 50%), ${spotlightColor}, transparent 40%)`,
      }}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}
