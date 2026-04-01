import { describe, expect, it } from 'vitest';
import { stateCodeFromPermitSiteEmbed } from '../npdesPermitState';

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
