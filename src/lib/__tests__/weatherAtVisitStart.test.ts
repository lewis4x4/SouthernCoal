import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WEATHER_OBSERVED_SITE_PREFIX,
  fetchOpenMeteoCurrentSnapshot,
  formatWeatherForPersistence,
  observedWeatherFromPersisted,
} from '@/lib/weatherAtVisitStart';

describe('weatherAtVisitStart', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('formatWeatherForPersistence merges system and observed', () => {
    const system = { summary: 'Overcast · 54°F', fetchedAtIso: '2026-04-01T12:00:00.000Z' };
    expect(formatWeatherForPersistence('Fog at lip', system)).toBe(
      `System weather (Open-Meteo, 2026-04-01T12:00:00.000Z): Overcast · 54°F${WEATHER_OBSERVED_SITE_PREFIX}Fog at lip`,
    );
    expect(formatWeatherForPersistence('', system)).toBe(
      'System weather (Open-Meteo, 2026-04-01T12:00:00.000Z): Overcast · 54°F',
    );
    expect(formatWeatherForPersistence('  Windy  ', null)).toBe('Windy');
  });

  it('observedWeatherFromPersisted strips known delimiter', () => {
    const full = `System weather (Open-Meteo, 2026-04-01T12:00:00.000Z): Clear${WEATHER_OBSERVED_SITE_PREFIX}Icy access road`;
    expect(observedWeatherFromPersisted(full)).toBe('Icy access road');
    expect(observedWeatherFromPersisted('Legacy free-text only')).toBe('Legacy free-text only');
  });

  it('fetchOpenMeteoCurrentSnapshot parses current block', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          current: {
            time: '2026-04-01T15:00',
            temperature_2m: 52.3,
            relative_humidity_2m: 71,
            weather_code: 3,
            wind_speed_10m: 6.2,
          },
        }),
      }),
    );

    const snap = await fetchOpenMeteoCurrentSnapshot({ latitude: 38.0, longitude: -81.0 });
    expect(snap.summary).toContain('Overcast');
    expect(snap.summary).toContain('52°F');
    expect(snap.fetchedAtIso).toMatch(/2026-04-01/);
  });

});
