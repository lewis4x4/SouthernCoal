/**
 * GST-8 / GST-18 — automated regression matrix for Slice B/C dispatch sync gate.
 * Run: npx vitest run src/lib/__tests__/gst8SliceBcRegression.test.ts
 */
import { describe, expect, it } from 'vitest';
import { didDispatchContextLoadSucceed } from '@/hooks/useFieldOps';

describe('GST-8 slice B/C — didDispatchContextLoadSucceed matrix', () => {
  const base = {
    flushFailed: null as Error | null,
    permitError: null as { message: string } | null,
    sitesStateError: null as { message: string } | null,
    userError: null as { message: string } | null,
    visitError: null as { message: string } | null,
    outfallError: null as { message: string } | null,
    assignmentError: null as { message: string } | null,
    routeStopError: null as { message: string } | null,
  };

  it.each([
    { name: 'all clear', patch: {}, ok: true },
    { name: 'flush failed', patch: { flushFailed: new Error('blocked') }, ok: false },
    { name: 'permit error', patch: { permitError: { message: 'permits' } }, ok: false },
    { name: 'sites/state error', patch: { sitesStateError: { message: 'sites' } }, ok: false },
    { name: 'user directory error', patch: { userError: { message: 'users' } }, ok: false },
    { name: 'visit query error', patch: { visitError: { message: 'visits' } }, ok: false },
    { name: 'outfall query error', patch: { outfallError: { message: 'outfalls' } }, ok: false },
    { name: 'assignment query error', patch: { assignmentError: { message: 'roles' } }, ok: false },
    { name: 'route stop error', patch: { routeStopError: { message: 'stops' } }, ok: false },
    {
      name: 'multiple auxiliary errors',
      patch: { outfallError: { message: 'a' }, routeStopError: { message: 'b' } },
      ok: false,
    },
  ])('$name → success=$ok', ({ patch, ok }) => {
    expect(didDispatchContextLoadSucceed({ ...base, ...patch })).toBe(ok);
  });
});
