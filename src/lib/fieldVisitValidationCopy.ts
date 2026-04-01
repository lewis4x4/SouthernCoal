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

  outcomeRequired:
    'Choose the stop outcome before completing. The workflow changes based on whether you collected a sample, documented no discharge, or recorded an access issue.',

  outletObstructionDetailsRequired:
    'When the outlet is obstructed, describe the obstruction in the inspection. Auditors expect specifics, not a blank field.',

  sampleCocContainerRequired:
    'Record the primary sample container ID in Chain of custody before completing a sample-collected visit.',

  sampleFieldMeasurementsRequired:
    'Capture the required on-site field measurements for this stop before completing the sample-collected visit.',

  sampleCocPreservativeRequired:
    'Confirm bottle and preservative match the sampling plan before completing or saving chain of custody.',

  sampleContainerMismatch:
    'The captured bottle or kit does not match this stop. Rescan the correct container or switch to the right bottle before completing.',

  saveCocContainerRequired: 'Enter a primary container ID for the chain of custody record.',

  noDischargePhotoRequired:
    'Add at least one site photo before completing a no-discharge visit. Photos support the no-discharge determination.',

  /** Online complete: RPC counts only uploaded photos — drafts on device are not enough until they sync. */
  photoSyncBeforeCompleteOnline:
    'At least one photo must be uploaded to the server before completing online. Use Refresh in the sync bar if you have photos pending on this device, then try again.',

  noDischargeNarrativeRequired:
    'Enter a no-discharge narrative (what you observed and why there was no discharge). Narrative is required for this outcome.',

  noDischargeObstructionDetailsRequired:
    'You noted an obstruction. Describe it before completing so the record is reviewable.',

  accessIssuePhotoRequired:
    'Add at least one photo before completing an access issue. Documentation supports follow-up and any escalation.',

  accessIssueNarrativeRequired:
    'Describe the access issue (what blocked sampling and what you did). Narrative is required before completing.',

  measurementNameRequired: 'Enter a parameter or measurement name before saving.',
  measurementValueRequired: 'Enter a field reading before saving.',

  measurementUseCocSection:
    'Use the Chain of custody section to record the primary container ID (not ad-hoc measurements).',

  fieldMeasurementsNotLab:
    'This section is for on-site meter readings only. Certified lab results are never entered here — they arrive through lab EDD import and attach to the sampling event after the visit.',

  additionalFieldObservationsExplainer:
    'Extra readings below are field observations recorded on this visit but not driven by the current stop requirement list. They are still field data, not laboratory analytical results.',
} as const;
