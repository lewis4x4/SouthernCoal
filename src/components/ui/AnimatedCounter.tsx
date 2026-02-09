import { useEffect, useRef } from 'react';
import { useSpring, useTransform, motion, type MotionValue } from 'framer-motion';
import { cn } from '@/lib/cn';

interface AnimatedCounterProps {
  value: number;
  className?: string;
}

/**
 * Animated number counter using framer-motion springs.
 * Transitions from old → new (not 0 → new).
 * JetBrains Mono, tabular-nums.
 */
export function AnimatedCounter({ value, className }: AnimatedCounterProps) {
  const spring = useSpring(value, { stiffness: 100, damping: 20 });
  const display = useTransform(spring, (v: number) => Math.round(v).toLocaleString());
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current !== value) {
      spring.set(value);
      prevRef.current = value;
    }
  }, [value, spring]);

  return (
    <motion.span className={cn('font-mono tabular-nums', className)}>
      {display as unknown as MotionValue<string>}
    </motion.span>
  );
}
