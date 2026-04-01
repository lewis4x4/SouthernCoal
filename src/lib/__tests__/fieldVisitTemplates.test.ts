import { describe, expect, it } from 'vitest';
import { getForceMajeureQuickPhrases } from '@/lib/fieldVisitTemplates';

describe('getForceMajeureQuickPhrases', () => {
  it('includes timing and outcome-aware prompts', () => {
    const phrases = getForceMajeureQuickPhrases('access_issue');

    expect(phrases.map((phrase) => phrase.id)).toEqual(
      expect.arrayContaining([
        'fm-timing-source',
        'fm-weather-impact',
        'fm-access-disrupted',
      ]),
    );
  });
});
