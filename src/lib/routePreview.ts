/** Straight-line distance in kilometers (WGS84). */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Road-ish minutes from crow-flight km (no external API).
 * Factor 1.35 approximates winding rural roads; cap per leg for sanity.
 */
export function estimateDriveMinutesStraightLine(km: number, roadFactor = 1.35, avgKmh = 45): number {
  if (!Number.isFinite(km) || km <= 0) return 0;
  const adjustedKm = km * roadFactor;
  const minutes = (adjustedKm / avgKmh) * 60;
  return Math.min(240, Math.round(minutes));
}

export interface RouteLegEstimate {
  fromLabel: string;
  toLabel: string;
  km: number;
  minutes: number;
}

export function buildRouteLegEstimates(
  orderedStops: Array<{ label: string; coord: { lat: number; lng: number } | null }>,
): { legs: RouteLegEstimate[]; totalMinutes: number; missingCoordCount: number } {
  const legs: RouteLegEstimate[] = [];
  let totalMinutes = 0;
  let missingCoordCount = 0;

  for (let i = 0; i < orderedStops.length; i += 1) {
    const cur = orderedStops[i]!;
    if (!cur.coord) missingCoordCount += 1;
    if (i === 0) continue;
    const prev = orderedStops[i - 1]!;
    if (!prev.coord || !cur.coord) continue;
    const km = haversineKm(prev.coord, cur.coord);
    const minutes = estimateDriveMinutesStraightLine(km);
    legs.push({
      fromLabel: prev.label,
      toLabel: cur.label,
      km,
      minutes,
    });
    totalMinutes += minutes;
  }

  return { legs, totalMinutes, missingCoordCount };
}

/** Same physical outfall visited in non-consecutive stops (possible inefficient order). */
export function findNonConsecutiveOutfallRepeats(outfallIdsInOrder: string[]): string[] {
  const warnings: string[] = [];
  const lastIndex = new Map<string, number>();
  for (let i = 0; i < outfallIdsInOrder.length; i += 1) {
    const id = outfallIdsInOrder[i];
    if (!id) continue;
    const prev = lastIndex.get(id);
    if (prev !== undefined && prev !== i - 1) {
      warnings.push(id);
    }
    lastIndex.set(id, i);
  }
  return warnings;
}
