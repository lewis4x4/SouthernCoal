import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchSiteIdToStateCodeMap,
  fetchSiteIdToStateCodeMapViaStateId,
  stateCodeFromPermitSiteEmbed,
} from '../npdesPermitState';

describe('stateCodeFromPermitSiteEmbed', () => {
  it('returns null for missing embed', () => {
    expect(stateCodeFromPermitSiteEmbed(null)).toBeNull();
    expect(stateCodeFromPermitSiteEmbed(undefined)).toBeNull();
  });

  it('reads states.code from object sites', () => {
    expect(stateCodeFromPermitSiteEmbed({ states: { code: 'WV' } })).toBe('WV');
  });

  it('reads first element when sites is array', () => {
    expect(stateCodeFromPermitSiteEmbed([{ states: { code: 'KY' } }])).toBe('KY');
  });

  it('returns null when code missing', () => {
    expect(stateCodeFromPermitSiteEmbed({ states: {} })).toBeNull();
  });
});

function chainSitesStatesCode(
  inHandler: (col: string, batch: string[]) => Promise<{ data: unknown; error: unknown }>,
) {
  return {
    from: (table: string) => {
      if (table !== 'sites') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: null, error: { message: 'wrong table' } }),
          }),
        };
      }
      return {
        select: (cols: string) => ({
          in: (_field: string, batch: string[]) => inHandler(cols, batch),
        }),
      };
    },
  };
}

describe('fetchSiteIdToStateCodeMap', () => {
  it('returns empty map when no site ids', async () => {
    const client = { from: vi.fn() } as unknown as SupabaseClient;
    const { map, error } = await fetchSiteIdToStateCodeMap(client, []);
    expect(map.size).toBe(0);
    expect(error).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });

  it('dedupes ids and maps state codes in one tier-A batch', async () => {
    const client = chainSitesStatesCode((_cols, batch) =>
      Promise.resolve({
        data: batch.map((id) => ({ id, states: { code: id === 's1' ? 'WV' : 'KY' } })),
        error: null,
      }),
    ) as unknown as SupabaseClient;

    const { map, error } = await fetchSiteIdToStateCodeMap(client, ['s1', 's2', 's1', null, undefined]);

    expect(error).toBeNull();
    expect(map.get('s1')).toBe('WV');
    expect(map.get('s2')).toBe('KY');
  });

  it('chunks more than 100 unique site ids into multiple tier-A queries', async () => {
    const inMock = vi.fn((_col: string, batch: string[]) =>
      Promise.resolve({
        data: batch.map((id) => ({ id, states: { code: 'WV' } })),
        error: null,
      }),
    );
    const client = {
      from: () => ({
        select: () => ({ in: inMock }),
      }),
    } as unknown as SupabaseClient;

    const ids = Array.from({ length: 150 }, (_, i) => `site-${i}`);
    await fetchSiteIdToStateCodeMap(client, ids);

    expect(inMock).toHaveBeenCalledTimes(2);
    expect(inMock.mock.calls[0]?.[1]).toHaveLength(100);
    expect(inMock.mock.calls[1]?.[1]).toHaveLength(50);
  });

  it('uses tier B when tier A returns rows with empty states embed', async () => {
    const sitesIn = vi.fn((col: string, batch: string[]) => {
      if (col === 'id' && String(batch?.[0]).includes('states')) return Promise.resolve({ data: [], error: null });
      if (String(col).includes('state_id')) {
        return Promise.resolve({
          data: batch.map((id) => ({ id, state_id: 'st-wv' })),
          error: null,
        });
      }
      return Promise.resolve({
        data: batch.map((id) => ({ id, states: {} })),
        error: null,
      });
    });
    const statesIn = vi.fn(() =>
      Promise.resolve({
        data: [{ id: 'st-wv', code: 'WV' }],
        error: null,
      }),
    );
    const client = {
      from: (table: string) => {
        if (table === 'states') {
          return { select: () => ({ in: statesIn }) };
        }
        return { select: (cols: string) => ({ in: (_f: string, b: string[]) => sitesIn(cols, b) }) };
      },
    } as unknown as SupabaseClient;

    const { map, error } = await fetchSiteIdToStateCodeMap(client, ['site-a']);

    expect(error).toBeNull();
    expect(map.get('site-a')).toBe('WV');
    expect(statesIn).toHaveBeenCalled();
  });

  it('recovers with tier B when tier A batch errors', async () => {
    let sitesEmbedCalls = 0;
    const sitesIn = vi.fn((_cols: string, batch: string[]) => {
      if (String(_cols).includes('state_id')) {
        return Promise.resolve({
          data: batch.map((id) => ({ id, state_id: 'st1' })),
          error: null,
        });
      }
      sitesEmbedCalls += 1;
      if (sitesEmbedCalls === 2) {
        return Promise.resolve({ data: null, error: { message: 'embed rls' } });
      }
      return Promise.resolve({
        data: batch.map((id) => ({ id, states: { code: 'WV' } })),
        error: null,
      });
    });
    const statesIn = vi.fn(() =>
      Promise.resolve({
        data: [{ id: 'st1', code: 'KY' }],
        error: null,
      }),
    );
    const client = {
      from: (table: string) => {
        if (table === 'states') {
          return { select: () => ({ in: statesIn }) };
        }
        return { select: (cols: string) => ({ in: (_field: string, b: string[]) => sitesIn(cols, b) }) };
      },
    } as unknown as SupabaseClient;

    const ids = Array.from({ length: 101 }, (_, i) => `site-${i}`);
    const { map, error } = await fetchSiteIdToStateCodeMap(client, ids);

    expect(error).toBeNull();
    expect(map.get('site-0')).toBe('WV');
    expect(map.get('site-100')).toBe('KY');
  });

  it('returns tier B error when tier A failed and tier B fails', async () => {
    const client = {
      from: (table: string) => {
        if (table === 'states') {
          return {
            select: () => ({
              in: () => Promise.resolve({ data: null, error: { message: 'states rls' } }),
            }),
          };
        }
        return {
          select: (cols: string) => ({
            in: () => {
              if (String(cols).includes('state_id')) {
                return Promise.resolve({
                  data: [{ id: 's1', state_id: 'st1' }],
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: { message: 'embed fail' } });
            },
          }),
        };
      },
    } as unknown as SupabaseClient;

    const { map, error } = await fetchSiteIdToStateCodeMap(client, ['s1']);

    expect(error?.message).toBe('states rls');
    expect(map.size).toBe(0);
  });
});

describe('fetchSiteIdToStateCodeMapViaStateId', () => {
  it('maps site id to code via state_id', async () => {
    const sitesIn = vi.fn(() =>
      Promise.resolve({
        data: [
          { id: 'a', state_id: 'st1' },
          { id: 'b', state_id: 'st2' },
        ],
        error: null,
      }),
    );
    const statesIn = vi.fn(() =>
      Promise.resolve({
        data: [
          { id: 'st1', code: 'WV' },
          { id: 'st2', code: 'KY' },
        ],
        error: null,
      }),
    );
    const client = {
      from: (table: string) => {
        if (table === 'states') return { select: () => ({ in: statesIn }) };
        return { select: () => ({ in: sitesIn }) };
      },
    } as unknown as SupabaseClient;

    const { map, error } = await fetchSiteIdToStateCodeMapViaStateId(client, ['a', 'b']);

    expect(error).toBeNull();
    expect(map.get('a')).toBe('WV');
    expect(map.get('b')).toBe('KY');
  });
});
