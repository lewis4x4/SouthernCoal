import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface GlassProgressProps {
  /** 0–100 */
  value: number;
  className?: string;
}

/**
 * Glass progress bar with animated fill and glow effect.
 */
export function GlassProgress({ value, className }: GlassProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn(
        'h-2 rounded-full bg-white/5 overflow-hidden',
        className,
      )}
    >
      <motion.div
        className="h-full rounded-full"
        style={{
          background: 'linear-gradient(90deg, #3b82f6, #06b6d4)',
          boxShadow: '0 0 8px rgba(59, 130, 246, 0.4)',
        }}
        initial={false}
        animate={{ width: `${clamped}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      />
    </div>
  );
}
