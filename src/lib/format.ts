/**
 * Formats a number as a dollar amount with commas, no decimal places.
 * Examples: 2000 → "$2,000" | 1500000 → "$1,500,000"
 */
export function formatDollars(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
