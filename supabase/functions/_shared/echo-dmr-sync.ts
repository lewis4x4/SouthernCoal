/** Shared ECHO DMR date-range chunking (sync-echo-data Slice 3). */

export interface DmrDateChunk {
  start: Date;
  end: Date;
}

export const HEAVY_DMR_NPDES_IDS = new Set(["WV1024078"]);
export const DMR_CHUNK_MONTHS_DEFAULT = 12;
export const DMR_CHUNK_MONTHS_HEAVY = 1;
export const HEAVY_DMR_PARAMETER_CODES: Record<string, string[]> = {
  WV1024078: [
    "00095",
    "00400",
    "00410",
    "00530",
    "00545",
    "00916",
    "00927",
    "00929",
    "00937",
    "00945",
    "01045",
    "01055",
    "01105",
    "01106",
    "50050",
    "61426",
    "70295",
  ],
};

export function formatEchoDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${month}/${day}/${d.getFullYear()}`;
}

export function resolveDmrChunkMonths(npdesId: string, override?: number): number {
  if (typeof override === "number" && override > 0) return Math.floor(override);
  return HEAVY_DMR_NPDES_IDS.has(npdesId.toUpperCase())
    ? DMR_CHUNK_MONTHS_HEAVY
    : DMR_CHUNK_MONTHS_DEFAULT;
}

export function resolveHeavyDmrParameterCodes(npdesId: string, override?: string[]): string[] {
  const normalizedOverride = (override ?? [])
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
  if (normalizedOverride.length > 0) return [...new Set(normalizedOverride)];
  return HEAVY_DMR_PARAMETER_CODES[npdesId.toUpperCase()] ?? [];
}

/** Split [now - backfillYears, now] into contiguous month windows for EPA p_start_date/p_end_date. */
export function buildDmrDateChunks(
  backfillYears: number,
  chunkMonths: number,
  now: Date = new Date(),
): DmrDateChunk[] {
  const rangeEnd = new Date(now);
  const rangeStart = new Date(now);
  rangeStart.setFullYear(rangeStart.getFullYear() - backfillYears);
  rangeStart.setHours(0, 0, 0, 0);

  const chunks: DmrDateChunk[] = [];
  let cursor = new Date(rangeStart);

  while (cursor <= rangeEnd) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setMonth(chunkEnd.getMonth() + chunkMonths);
    chunkEnd.setDate(chunkEnd.getDate() - 1);
    if (chunkEnd > rangeEnd) {
      chunkEnd.setTime(rangeEnd.getTime());
    }
    chunks.push({ start: new Date(cursor), end: new Date(chunkEnd) });
    const next = new Date(chunkEnd);
    next.setDate(next.getDate() + 1);
    cursor = next;
  }

  return chunks;
}

function localDateUtcMs(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function addLocalDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

export function dmrDateWindowDays(chunk: DmrDateChunk): number {
  const days = Math.floor((localDateUtcMs(chunk.end) - localDateUtcMs(chunk.start)) / 86_400_000) + 1;
  return Math.max(1, days);
}

export function bisectDmrDateChunk(chunk: DmrDateChunk): [DmrDateChunk, DmrDateChunk] | null {
  const days = dmrDateWindowDays(chunk);
  if (days <= 1) return null;

  const leftDays = Math.floor(days / 2);
  const leftEnd = addLocalDays(chunk.start, leftDays - 1);
  const rightStart = addLocalDays(leftEnd, 1);

  return [
    { start: new Date(chunk.start), end: leftEnd },
    { start: rightStart, end: new Date(chunk.end) },
  ];
}

export function buildEffluentChartUrl(
  echoBase: string,
  npdesId: string,
  start: Date,
  end: Date,
  options: { parameterCode?: string | null } = {},
): string {
  const startStr = formatEchoDate(start);
  const endStr = formatEchoDate(end);
  const parameter = options.parameterCode
    ? `&parameter_code=${encodeURIComponent(options.parameterCode)}`
    : "";
  return `${echoBase}/eff_rest_services.get_effluent_chart?p_id=${encodeURIComponent(npdesId)}&output=JSON&p_start_date=${startStr}&p_end_date=${endStr}${parameter}`;
}
