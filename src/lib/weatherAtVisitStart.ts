/**
 * Open-Meteo current conditions at visit start (Stage A Week 1).
 * Persistence rules: Roadmap/FIELD_VISIT_WEEK1_DECISIONS.md
 */

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

/** Persisted combined string splits on this suffix so the UI can edit observed only. */
export const WEATHER_OBSERVED_SITE_PREFIX = '\nObserved at site: ';

const FETCH_TIMEOUT_MS = 10_000;

export function isWeatherFetchEnabled(): boolean {
  return import.meta.env.VITE_WEATHER_FETCH_ENABLED !== 'false';
}

function wmoWeatherLabel(code: number): string {
  const map: Record<number, string> = {
    0: 'Clear',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Drizzle',
    55: 'Heavy drizzle',
    61: 'Slight rain',
    63: 'Rain',
    65: 'Heavy rain',
    71: 'Slight snow',
    73: 'Snow',
    75: 'Heavy snow',
    80: 'Rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  };
  return map[code] ?? `Weather code ${code}`;
}

function buildSummaryLine(current: {
  temperature_2m?: number;
  relative_humidity_2m?: number;
  weather_code?: number;
  wind_speed_10m?: number;
}): string {
  const parts: string[] = [];
  if (typeof current.weather_code === 'number') {
    parts.push(wmoWeatherLabel(current.weather_code));
  }
  if (typeof current.temperature_2m === 'number' && Number.isFinite(current.temperature_2m)) {
    parts.push(`${Math.round(current.temperature_2m)}°F`);
  }
  if (typeof current.relative_humidity_2m === 'number' && Number.isFinite(current.relative_humidity_2m)) {
    parts.push(`${Math.round(current.relative_humidity_2m)}% RH`);
  }
  if (typeof current.wind_speed_10m === 'number' && Number.isFinite(current.wind_speed_10m)) {
    parts.push(`wind ${Math.round(current.wind_speed_10m)} mph`);
  }
  return parts.join(' · ') || 'Conditions retrieved (details unavailable)';
}

type OpenMeteoCurrentResponse = {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    time?: string;
  };
};

/**
 * Fetches current conditions at the given WGS84 coordinates (visit start location).
 */
export async function fetchOpenMeteoCurrentSnapshot(params: {
  latitude: number;
  longitude: number;
  signal?: AbortSignal;
}): Promise<{ summary: string; fetchedAtIso: string }> {
  const { latitude, longitude, signal: externalSignal } = params;
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const url = new URL(OPEN_METEO_BASE);
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m');
  url.searchParams.set('temperature_unit', 'fahrenheit');
  url.searchParams.set('wind_speed_unit', 'mph');

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Weather service returned ${res.status}`);
    }
    const json = (await res.json()) as OpenMeteoCurrentResponse;
    const current = json.current;
    if (!current) {
      throw new Error('Weather response missing current conditions');
    }
    const summary = buildSummaryLine(current);
    const fetchedAtIso = current.time
      ? new Date(current.time).toISOString()
      : new Date().toISOString();
    return { summary, fetchedAtIso };
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

/** Merge system snapshot + observed site text for `weather_conditions` column. */
export function formatWeatherForPersistence(
  observedSiteTrimmed: string,
  system: { summary: string; fetchedAtIso: string } | null,
): string {
  const obs = observedSiteTrimmed.trim();
  if (system) {
    const sysBlock = `System weather (Open-Meteo, ${system.fetchedAtIso}): ${system.summary}`;
    return obs ? `${sysBlock}${WEATHER_OBSERVED_SITE_PREFIX}${obs}` : sysBlock;
  }
  return obs;
}

/** Extract editable observed tail from a persisted `weather_conditions` value. */
export function observedWeatherFromPersisted(persisted: string): string {
  const idx = persisted.indexOf(WEATHER_OBSERVED_SITE_PREFIX);
  if (idx === -1) return persisted;
  return persisted.slice(idx + WEATHER_OBSERVED_SITE_PREFIX.length);
}
