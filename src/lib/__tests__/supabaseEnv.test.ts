import { describe, it, expect } from 'vitest';
import { parseSupabaseBrowserEnv } from '../supabaseEnv';

describe('parseSupabaseBrowserEnv', () => {
  it('accepts https project URL', () => {
    const r = parseSupabaseBrowserEnv({
      VITE_SUPABASE_URL: '  https://abc.supabase.co  ',
      VITE_SUPABASE_ANON_KEY: '  key  ',
    });
    expect(r.url).toBe('https://abc.supabase.co');
    expect(r.anonKey).toBe('key');
  });

  it('accepts http for localhost', () => {
    const r = parseSupabaseBrowserEnv({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: 'k',
    });
    expect(r.url).toBe('http://127.0.0.1:54321');
  });

  it('rejects remote http', () => {
    expect(() =>
      parseSupabaseBrowserEnv({
        VITE_SUPABASE_URL: 'http://evil.example.com',
        VITE_SUPABASE_ANON_KEY: 'k',
      }),
    ).toThrow(/https/);
  });

  it('throws when vars missing', () => {
    expect(() => parseSupabaseBrowserEnv({})).toThrow(/Missing Supabase/);
  });
});
