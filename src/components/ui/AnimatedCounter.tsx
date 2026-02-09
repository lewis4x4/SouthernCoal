import { useEffect, useRef, useState } from 'react';
import { useSpring, useTransform } from 'framer-motion';
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
  const [rendered, setRendered] = useState(() => Math.round(value).toLocaleString());
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current !== value) {
      spring.set(value);
      prevRef.current = value;
    }
  }, [value, spring]);

  useEffect(() => {
    const unsubscribe = display.on('change', (v) => setRendered(v));
    return unsubscribe;
  }, [display]);

  return (
    <span className={cn('font-mono tabular-nums', className)}>
      {rendered}
    </span>
  );
}
