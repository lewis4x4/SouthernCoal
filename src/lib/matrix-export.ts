import type { MatrixCell } from '@/types/matrix';

/** Format a matrix cell for CSV/Markdown export (includes verification counts when applicable). */
export function formatMatrixCellExport(cell: MatrixCell | undefined): string {
  if (!cell || cell.count === 0) return '0';

  const base = `${cell.count} (${cell.status})`;
  if (cell.reviewableCount > 0) {
    return `${base} ${cell.verifiedCount}/${cell.reviewableCount} verified`;
  }
  return base;
}
