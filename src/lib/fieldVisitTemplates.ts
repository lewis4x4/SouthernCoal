import type { FieldVisitOutcome } from '@/types';

export type QuickPhraseTemplate = {
  id: string;
  label: string;
  text: string;
};

const OUTCOME_TEMPLATES: Record<FieldVisitOutcome, QuickPhraseTemplate[]> = {
  sample_collected: [
    {
      id: 'sample-normal',
      label: 'Routine collection',
      text: 'Routine sample collected at the designated point. Labels verified and field observations recorded on site.',
    },
    {
      id: 'sample-low-flow',
      label: 'Low flow',
      text: 'Sample collected under low-flow conditions. Collection completed at the active discharge point.',
    },
    {
      id: 'sample-unusual',
      label: 'Unusual condition',
      text: 'Sample collected with unusual outlet conditions noted in the field record and supporting photos attached.',
    },
  ],
  no_discharge: [
    {
      id: 'dry-channel',
      label: 'Dry channel',
      text: 'No discharge observed at the actual sampling point. Channel and outlet were dry at the time of visit.',
    },
    {
      id: 'standing-water',
      label: 'Standing water only',
      text: 'No flowing discharge observed. Standing water was present, but no sampleable discharge was leaving the outlet.',
    },
    {
      id: 'weather-driven',
      label: 'Weather context',
      text: 'No discharge observed during this visit. Weather and site conditions were documented to support the no-discharge determination.',
    },
  ],
  access_issue: [
    {
      id: 'locked-gate',
      label: 'Locked gate',
      text: 'Sampling could not proceed because access to the outlet was blocked by a locked gate.',
    },
    {
      id: 'road-blocked',
      label: 'Road blocked',
      text: 'Sampling could not proceed because the access road was blocked before the outlet could be reached.',
    },
    {
      id: 'unsafe-access',
      label: 'Unsafe access',
      text: 'Sampling did not proceed because site access conditions were unsafe at the time of visit.',
    },
  ],
};

export function getOutcomeQuickPhrases(outcome: FieldVisitOutcome): QuickPhraseTemplate[] {
  return OUTCOME_TEMPLATES[outcome];
}

const FORCE_MAJEURE_TEMPLATES: Record<FieldVisitOutcome, QuickPhraseTemplate[]> = {
  sample_collected: [
    {
      id: 'fm-timing-source',
      label: 'Timing and source',
      text: 'Timing context: site conditions were observed at the time of visit and may affect downstream notice handling. Source of condition noted in the field record.',
    },
    {
      id: 'fm-weather-impact',
      label: 'Weather impact',
      text: 'Potential force majeure basis: weather or site conditions materially affected collection conditions and supporting evidence was captured on site.',
    },
    {
      id: 'fm-collection-disrupted',
      label: 'Collection disrupted',
      text: 'Collection proceeded under abnormal conditions. Field notes and photo evidence document why the event may need governance review.',
    },
  ],
  no_discharge: [
    {
      id: 'fm-timing-source',
      label: 'Timing and source',
      text: 'Timing context: site conditions were observed at the time of visit and may affect downstream notice handling. Source of condition noted in the field record.',
    },
    {
      id: 'fm-weather-impact',
      label: 'Weather impact',
      text: 'Potential force majeure basis: weather or site conditions may explain the no-discharge context at the actual sample point. Supporting observations were captured on site.',
    },
    {
      id: 'fm-no-discharge-context',
      label: 'No-discharge context',
      text: 'No discharge was observed during conditions that may need governance review. Notes and photos document why the result may not reflect normal operating conditions.',
    },
  ],
  access_issue: [
    {
      id: 'fm-timing-source',
      label: 'Timing and source',
      text: 'Timing context: site conditions were observed at the time of visit and may affect downstream notice handling. Source of condition noted in the field record.',
    },
    {
      id: 'fm-weather-impact',
      label: 'Weather impact',
      text: 'Potential force majeure basis: weather or site conditions materially restricted access to the outlet. Supporting observations were captured on site.',
    },
    {
      id: 'fm-access-disrupted',
      label: 'Access disrupted',
      text: 'Access conditions prevented normal execution of the stop. Field notes identify the site condition, timing, and evidence supporting later governance review.',
    },
  ],
};

export function getForceMajeureQuickPhrases(outcome: FieldVisitOutcome): QuickPhraseTemplate[] {
  return FORCE_MAJEURE_TEMPLATES[outcome];
}
