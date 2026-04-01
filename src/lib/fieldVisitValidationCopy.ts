/**
 * User-facing validation copy for field visit flows (Lane A Milestone 1).
 * Wording leans operational + compliance: evidence, outlet inspection, chain of custody.
 */

export const FIELD_VISIT_COPY = {
  startGpsRequired:
    'Enter start latitude and longitude (or use GPS capture). Location ties the visit to the outfall for the record.',

  completeGpsRequired:
    'Enter completion latitude and longitude (or use GPS capture). Coordinates document where and when the visit ended.',

  outletFlowRequired:
    'Select outlet flow status before completing: flowing, no flow, or obstructed. This inspection item is required for a complete outlet record.',

  outletObstructionDetailsRequired:
    'When the outlet is obstructed, describe the obstruction in the inspection. Auditors expect specifics, not a blank field.',

  sampleCocContainerRequired:
    'Record the primary sample container ID in Chain of custody before completing a sample-collected visit.',

  sampleCocPreservativeRequired:
    'Confirm bottle and preservative match the sampling plan before completing or saving chain of custody.',

  saveCocContainerRequired: 'Enter a primary container ID for the chain of custody record.',

  noDischargePhotoRequired:
    'Add at least one site photo before completing a no-discharge visit. Photos support the no-discharge determination.',

  noDischargeNarrativeRequired:
    'Enter a no-discharge narrative (what you observed and why there was no discharge). Narrative is required for this outcome.',

  noDischargeObstructionDetailsRequired:
    'You noted an obstruction. Describe it before completing so the record is reviewable.',

  accessIssuePhotoRequired:
    'Add at least one photo before completing an access issue. Documentation supports follow-up and any escalation.',

  accessIssueNarrativeRequired:
    'Describe the access issue (what blocked sampling and what you did). Narrative is required before completing.',

  measurementNameRequired: 'Enter a parameter or measurement name before saving.',

  measurementUseCocSection:
    'Use the Chain of custody section to record the primary container ID (not ad-hoc measurements).',
} as const;
