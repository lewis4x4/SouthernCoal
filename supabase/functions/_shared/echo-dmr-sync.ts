/** Shared ECHO DMR date-range chunking (sync-echo-data Slice 3). */

export const HEAVY_DMR_NPDES_IDS = new Set(["WV1024078"]);
export const DMR_CHUNK_MONTHS_DEFAULT = 12;
export const DMR_CHUNK_MONTHS_HEAVY = 3;

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

/** Split [now - backfillYears, now] into contiguous month windows for EPA p_start_date/p_end_date. */
export function buildDmrDateChunks(
  backfillYears: number,
  chunkMonths: number,
  now: Date = new Date(),
): Array<{ start: Date; end: Date }> {
  const rangeEnd = new Date(now);
  const rangeStart = new Date(now);
  rangeStart.setFullYear(rangeStart.getFullYear() - backfillYears);
  rangeStart.setHours(0, 0, 0, 0);

  const chunks: Array<{ start: Date; end: Date }> = [];
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

export function buildEffluentChartUrl(
  echoBase: string,
  npdesId: string,
  start: Date,
  end: Date,
): string {
  const startStr = formatEchoDate(start);
  const endStr = formatEchoDate(end);
  return `${echoBase}/eff_rest_services.get_effluent_chart?p_id=${encodeURIComponent(npdesId)}&output=JSON&p_start_date=${startStr}&p_end_date=${endStr}`;
}
