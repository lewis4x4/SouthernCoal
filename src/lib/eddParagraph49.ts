/** Lane C QW2 — CD ¶49 48-hour EDD clock + exceedance-only completeness (advisory). */

export const PARAGRAPH_49_HOURS_LIMIT = 48;

export type EddParagraph49ReviewStatus =
  | 'pending'
  | 'acknowledged'
  | 'disputed'
  | 'resolved';

export function computeParagraph49Late(
  latestAnalysisDate: string,
  arrivalAt: Date,
): { hoursToArrival: number; isLate48h: boolean } {
  const analysisEnd = new Date(`${latestAnalysisDate}T23:59:59.999Z`);
  const hoursToArrival = (arrivalAt.getTime() - analysisEnd.getTime()) / (1000 * 60 * 60);
  return {
    hoursToArrival: Math.round(hoursToArrival * 10) / 10,
    isLate48h: hoursToArrival > PARAGRAPH_49_HOURS_LIMIT,
  };
}

export function computeExceedanceOnlyFlag(
  parametersReceived: number,
  parametersExpected: number,
  exceedanceParameterCount: number,
): boolean {
  if (parametersReceived <= 0 || parametersExpected <= 0) return false;
  return (
    exceedanceParameterCount === parametersReceived &&
    parametersReceived < parametersExpected
  );
}

export const EDD_REVIEW_STATUS_LABELS: Record<EddParagraph49ReviewStatus, string> = {
  pending: 'Pending',
  acknowledged: 'Acknowledged',
  disputed: 'Disputed',
  resolved: 'Resolved',
};
