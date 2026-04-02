import { fetchOpenMeteoCurrentSnapshot, isWeatherFetchEnabled } from '@/lib/weatherAtVisitStart';

const STORAGE_KEY = 'scc.fieldWeatherQueue.v1';

interface PendingWeatherFetch {
  visitId: string;
  latitude: number;
  longitude: number;
  enqueuedAt: string;
}

export function enqueueWeatherFetch(visitId: string, latitude: number, longitude: number): void {
  const queue = getPendingWeatherFetches();
  const existing = queue.findIndex((entry) => entry.visitId === visitId);
  const entry: PendingWeatherFetch = {
    visitId,
    latitude,
    longitude,
    enqueuedAt: new Date().toISOString(),
  };
  if (existing >= 0) {
    queue[existing] = entry;
  } else {
    queue.push(entry);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or blocked — fire-and-forget
  }
}

export function dequeueWeatherFetch(visitId: string): void {
  const queue = getPendingWeatherFetches().filter((entry) => entry.visitId !== visitId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // fire-and-forget
  }
}

export function getPendingWeatherFetches(): PendingWeatherFetch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Process all pending weather fetches. Returns results keyed by visitId.
 * Entries that succeed are dequeued; entries that fail remain for next attempt.
 */
export async function processWeatherQueue(): Promise<
  Map<string, { summary: string; fetchedAtIso: string }>
> {
  if (!isWeatherFetchEnabled()) return new Map();
  if (typeof navigator !== 'undefined' && !navigator.onLine) return new Map();

  const queue = getPendingWeatherFetches();
  if (queue.length === 0) return new Map();

  const results = new Map<string, { summary: string; fetchedAtIso: string }>();

  for (const entry of queue) {
    try {
      const snap = await fetchOpenMeteoCurrentSnapshot({
        latitude: entry.latitude,
        longitude: entry.longitude,
      });
      results.set(entry.visitId, snap);
      dequeueWeatherFetch(entry.visitId);
    } catch {
      // Leave in queue for next attempt
    }
  }

  return results;
}
