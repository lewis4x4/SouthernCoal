const EASTERN_TIME_ZONE = 'America/New_York';

function getEasternParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';

  return { year, month, day };
}

export function getEasternTodayYmd(date = new Date()) {
  const { year, month, day } = getEasternParts(date);
  return `${year}-${month}-${day}`;
}

export function getEasternCurrentYm(date = new Date()) {
  const { year, month } = getEasternParts(date);
  return `${year}-${month}`;
}

export function getOperationalTimeZone() {
  return EASTERN_TIME_ZONE;
}
