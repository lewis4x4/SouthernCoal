import { Suspense, lazy } from 'react';
import type { FtsMonthlyTotal } from '@/types/fts';
const FtsTrendChartInner = lazy(() => import('@/components/fts/FtsTrendChartInner'));

interface Props {
  monthlyTotals: FtsMonthlyTotal[];
}

export function FtsTrendChart({ monthlyTotals }: Props) {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-black/[0.08] bg-qo-nested p-6 ">
          <h3 className="text-sm font-semibold text-text-primary">Penalty Trend</h3>
          <div className="mt-4 h-[280px] animate-pulse rounded-xl border border-black/[0.06] bg-qo-nested" />
        </div>
      }
    >
      <FtsTrendChartInner monthlyTotals={monthlyTotals} />
    </Suspense>
  );
}
