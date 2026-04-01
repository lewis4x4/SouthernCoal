import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Beaker,
  ClipboardList,
  Copy,
  ExternalLink,
  Navigation,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { FieldDataSourceBanner } from '@/components/field/FieldDataSourceBanner';
import { FieldDispatchLoadAlerts } from '@/components/field/FieldDispatchLoadAlerts';
import { FieldDataSyncBar } from '@/components/field/FieldDataSyncBar';
import { FieldSameOutfallDayWarning } from '@/components/field/FieldSameOutfallDayWarning';
import { CustodyScanPanel } from '@/components/field-visit/CustodyScanPanel';
import { FieldVisitDeficiencyPrompts } from '@/components/field-visit/FieldVisitDeficiencyPrompts';
import { FieldVisitForceMajeureAssistPanel } from '@/components/field-visit/FieldVisitForceMajeureAssistPanel';
import { FieldVisitLastContextCard } from '@/components/field-visit/FieldVisitLastContextCard';
import { FieldVisitPhotoBuckets } from '@/components/field-visit/FieldVisitPhotoBuckets';
import { FieldVisitQaPromptsPanel } from '@/components/field-visit/FieldVisitQaPromptsPanel';
import { FieldVisitReviewHooksPanel } from '@/components/field-visit/FieldVisitReviewHooksPanel';
import { FieldVisitRequirementsCard } from '@/components/field-visit/FieldVisitRequirementsCard';
import { SafetyActionsPanel } from '@/components/field-visit/SafetyActionsPanel';
import { FieldVisitShortHoldAlert } from '@/components/field-visit/FieldVisitShortHoldAlert';
import { FieldVisitRequiredChecklist } from '@/components/field-visit/FieldVisitRequiredChecklist';
import { FieldVisitWeatherCard } from '@/components/field-visit/FieldVisitWeatherCard';
import { FieldVisitWizardProgress } from '@/components/field-visit/FieldVisitWizardProgress';
import { FieldVisitWizardShell } from '@/components/field-visit/FieldVisitWizardShell';
import type { FieldVisitWizardProgressStep } from '@/components/field-visit/FieldVisitWizardProgress';
import { QuickPhrasePicker } from '@/components/field-visit/QuickPhrasePicker';
import { FieldVisitEvidenceStep } from '@/components/field-visit/steps/FieldVisitEvidenceStep';
import { FieldVisitInspectionStep } from '@/components/field-visit/steps/FieldVisitInspectionStep';
import { FieldVisitOutcomeDetailsStep } from '@/components/field-visit/steps/FieldVisitOutcomeDetailsStep';
import { FieldVisitOutcomeStep } from '@/components/field-visit/steps/FieldVisitOutcomeStep';
import { FieldVisitReviewStep } from '@/components/field-visit/steps/FieldVisitReviewStep';
import { FieldVisitStartStep } from '@/components/field-visit/steps/FieldVisitStartStep';
import { SubmissionEvidenceViewer } from '@/components/submissions/SubmissionEvidenceViewer';
import { EvidenceCaptureUpload } from '@/components/submissions/EvidenceCaptureUpload';
import { useFieldOps } from '@/hooks/useFieldOps';
import { usePermissions } from '@/hooks/usePermissions';
import { parseContainerScan, validateContainerAgainstStop } from '@/lib/containerScan';
import {
  clearPersistedFieldEvidenceSyncFailuresForVisit,
  listFieldEvidenceDrafts,
  readPersistedFieldEvidenceSyncFailuresForVisit,
  saveFieldEvidenceDraft,
  type FieldEvidenceDraft,
  type FieldEvidenceDraftSyncFailure,
} from '@/lib/fieldEvidenceDrafts';
import { FIELD_MEASUREMENT_COC_PRIMARY_CONTAINER } from '@/lib/fieldOpsConstants';
import {
  describeGovernanceDeadline,
  type GovernanceDeadlineTone,
} from '@/lib/governanceDeadlines';
import { FIELD_HANDOFF_GOVERNANCE_INBOX, governanceIssuesInboxHref } from '@/lib/governanceInboxNav';
import { mapsSearchQueryUrl, mapsSearchUrl } from '@/lib/fieldMapsNav';
import { countOutboundQueueOpsForVisit } from '@/lib/fieldOutboundQueue';
import {
  getFieldVisitCompletionChecklistItems,
  summarizeCompletionChecklist,
  validateFieldVisitCompletion,
  validateFieldVisitOutcomeEvidence,
  validateFieldVisitStartCoordinates,
} from '@/lib/fieldVisitCompletionValidation';
import { getFieldVisitDeficiencyPrompts } from '@/lib/fieldVisitDeficiencyPrompts';
import { visitNeedsDisposition } from '@/lib/fieldVisitDisposition';
import { getFieldVisitQaPrompts } from '@/lib/fieldVisitQaPrompts';
import { getFieldVisitReviewHooks } from '@/lib/fieldVisitReviewHooks';
import { buildFieldVisitRequirementsModel } from '@/lib/fieldVisitRequirements';
import {
  getInspectionObstructionNarrative,
  normalizePipeCondition,
  normalizeSignageCondition,
} from '@/lib/fieldVisitInspectionRouting';
import { getOutcomeQuickPhrases } from '@/lib/fieldVisitTemplates';
import {
  fieldMeasurementInputPlaceholder,
  findSavedMeasurementForRequirement,
  measurementMatchesRequiredFieldMeasurement,
} from '@/lib/fieldMeasurementPrefill';
import {
  countPhotosByCategory,
  getPhotoBucketDefinition,
  getRequiredPhotoCategories,
  getSuggestedPhotoCategory,
  parsePhotoEvidenceCategory,
  serializePhotoEvidenceCategory,
} from '@/lib/photoEvidenceBuckets';
import {
  fetchOpenMeteoCurrentSnapshot,
  formatWeatherForPersistence,
  isWeatherFetchEnabled,
  observedWeatherFromPersisted,
} from '@/lib/weatherAtVisitStart';
import { FIELD_VISIT_COPY } from '@/lib/fieldVisitValidationCopy';
import { FIELD_VISIT_WIZARD_COPY } from '@/lib/fieldVisitWizardCopy';
import {
  FIELD_VISIT_WIZARD_STEPS,
  getFieldVisitWizardStep,
  getNextFieldVisitWizardStep,
  getPreviousFieldVisitWizardStep,
  persistFieldVisitWizardStep,
  readStoredFieldVisitWizardStep,
  type FieldVisitWizardStepId,
} from '@/lib/fieldVisitWizard';
import {
  getFieldVisitWizardRecommendedStep,
  isFieldVisitWizardStepComplete,
  validateFieldVisitWizardAdvanceStep,
  validateFieldVisitWizardStepAccess,
} from '@/lib/fieldVisitWizardGuards';
import { groupSameOutfallSameDay, siblingVisitsSameOutfallSameDay } from '@/lib/fieldSameOutfallDay';
import { GOVERNANCE_ROUTE_ROLES } from '@/lib/rbac';
import type {
  FieldVisitDetails,
  FieldVisitContainerCaptureMethod,
  FieldVisitScannedContainer,
  FieldVisitOutcome,
  FieldVisitPhotoCategory,
  GovernanceIssueRecord,
  OutletInspectionRecord,
} from '@/types';

function deadlineToneClass(tone: GovernanceDeadlineTone) {
  switch (tone) {
    case 'overdue':
      return 'text-red-300';
    case 'soon':
      return 'text-amber-200';
    case 'ok':
      return 'text-text-primary';
    default:
      return 'text-text-muted';
  }
}

const EMPTY_INSPECTION_STATE: Partial<OutletInspectionRecord> = {
  flow_status: 'unknown',
  signage_condition: '',
  pipe_condition: '',
  erosion_observed: false,
  obstruction_observed: false,
  obstruction_details: '',
  inspector_notes: '',
};

async function captureBrowserCoordinates() {
  if (!navigator.geolocation) {
    throw new Error('Browser geolocation is unavailable');
  }

  return new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      (error) => reject(new Error(error.message)),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

function formatOutcomeLabel(outcome: FieldVisitOutcome) {
  switch (outcome) {
    case 'sample_collected':
      return 'Sample collected';
    case 'no_discharge':
      return 'No discharge';
    case 'access_issue':
      return 'Access issue';
    default:
      return String(outcome).replace(/_/g, ' ');
  }
}

export function FieldVisitPage() {
  const { id } = useParams<{ id: string }>();
  const { getEffectiveRole } = usePermissions();

  const {
    detail,
    detailLoading,
    detailLoadSource,
    loading: fieldQueueLoading,
    lastSyncedAt,
    outboundPendingCount,
    outboundQueueDiagnostic,
    clearOutboundQueueDiagnostic,
    dispatchLoadAlerts,
    visits: fieldQueueVisits,
    loadVisitDetails,
    refreshOutboundPendingCount,
    refresh: refreshFieldQueue,
    startVisit,
    saveInspection,
    addMeasurement,
    saveCocPrimaryContainer,
    recordEvidenceAsset,
    completeVisit,
  } = useFieldOps();

  const [inspection, setInspection] = useState<Partial<OutletInspectionRecord>>({
    ...EMPTY_INSPECTION_STATE,
  });
  const [cocContainerId, setCocContainerId] = useState('');
  const [cocPreservativeConfirmed, setCocPreservativeConfirmed] = useState(false);
  const [cocCaptureMethod, setCocCaptureMethod] = useState<FieldVisitContainerCaptureMethod>('manual');
  const [cocRawScanValue, setCocRawScanValue] = useState('');
  const [observedSiteConditions, setObservedSiteConditions] = useState('');
  const [systemWeather, setSystemWeather] = useState<{ summary: string; fetchedAtIso: string } | null>(null);
  const [systemWeatherLoading, setSystemWeatherLoading] = useState(false);
  const [systemWeatherError, setSystemWeatherError] = useState<string | null>(null);
  const systemWeatherDedupeRef = useRef<string | null>(null);
  const [fieldNotes, setFieldNotes] = useState('');
  const [outcome, setOutcome] = useState<FieldVisitOutcome>('sample_collected');
  const [outcomeExplicitlySelected, setOutcomeExplicitlySelected] = useState(false);
  const [potentialForceMajeure, setPotentialForceMajeure] = useState(false);
  const [potentialForceMajeureNotes, setPotentialForceMajeureNotes] = useState('');
  const [noDischargeNarrative, setNoDischargeNarrative] = useState('');
  const [noDischargeCondition, setNoDischargeCondition] = useState('');
  const [noDischargeObstructionObserved, setNoDischargeObstructionObserved] = useState(false);
  const [noDischargeObstructionDetails, setNoDischargeObstructionDetails] = useState('');
  const [accessIssueNarrative, setAccessIssueNarrative] = useState('');
  const [accessIssueType, setAccessIssueType] = useState('access_issue');
  const [contactAttempted, setContactAttempted] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactOutcome, setContactOutcome] = useState('');
  const [startCoords, setStartCoords] = useState({ latitude: '', longitude: '' });
  const [completeCoords, setCompleteCoords] = useState({ latitude: '', longitude: '' });
  const [requiredMeasurementDrafts, setRequiredMeasurementDrafts] = useState<Record<string, string>>({});
  const [selectedPhotoCategory, setSelectedPhotoCategory] = useState<FieldVisitPhotoCategory>('outlet_signage');
  const [activeStep, setActiveStep] = useState<FieldVisitWizardStepId>('start_visit');
  const [wizardStateReady, setWizardStateReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingEvidenceDrafts, setPendingEvidenceDrafts] = useState<FieldEvidenceDraft[]>([]);
  const [evidenceUploadFailures, setEvidenceUploadFailures] = useState<FieldEvidenceDraftSyncFailure[]>([]);
  const [loadAttempted, setLoadAttempted] = useState(false);
  const latestPhotoCategoryRef = useRef<FieldVisitPhotoCategory>('outlet_signage');
  const uploadPhotoCategoryRef = useRef<FieldVisitPhotoCategory>('outlet_signage');
  const wizardHydratedForVisitRef = useRef<string | null>(null);
  const effectiveRole = getEffectiveRole();
  const canOpenGovernanceInbox = GOVERNANCE_ROUTE_ROLES.includes(effectiveRole);
  const governanceInboxHref = canOpenGovernanceInbox
    ? governanceIssuesInboxHref(FIELD_HANDOFF_GOVERNANCE_INBOX)
    : null;
  const governanceDisabledReason = canOpenGovernanceInbox
    ? null
    : 'Governance inbox opens for environmental manager, executive, or admin review. Capture the evidence and follow-up note here for handoff.';

  const goToStep = useCallback((stepId: FieldVisitWizardStepId) => {
    setActiveStep(stepId);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const refreshPendingEvidenceDrafts = useCallback(async (visitId: string) => {
    try {
      setPendingEvidenceDrafts(await listFieldEvidenceDrafts(visitId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load offline evidence drafts');
    }
  }, []);

  const handleFieldSyncRefresh = useCallback(async () => {
    if (!id) return { success: false };
    const fieldQueueResult = await refreshFieldQueue();
    await Promise.all([loadVisitDetails(id), refreshPendingEvidenceDrafts(id)]);
    setEvidenceUploadFailures(readPersistedFieldEvidenceSyncFailuresForVisit(id));
    return fieldQueueResult;
  }, [id, loadVisitDetails, refreshFieldQueue, refreshPendingEvidenceDrafts]);

  const handleCopySamplingEventId = useCallback(async () => {
    const sid = detail?.visit.linked_sampling_event_id;
    if (!sid) return;
    try {
      await navigator.clipboard.writeText(sid);
      toast.success('Sampling event ID copied');
    } catch {
      toast.error('Could not copy — select the ID and copy manually');
    }
  }, [detail?.visit.linked_sampling_event_id]);

  useEffect(() => {
    if (id) {
      setLoadAttempted(false);
      loadVisitDetails(id).catch((error) => {
        console.error('[FieldVisitPage] Failed to load visit details:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to load field visit');
      }).finally(() => {
        setLoadAttempted(true);
      });
      void refreshPendingEvidenceDrafts(id);
      setEvidenceUploadFailures(readPersistedFieldEvidenceSyncFailuresForVisit(id));
    }
  }, [id, loadVisitDetails, refreshPendingEvidenceDrafts]);

  useEffect(() => {
    setSystemWeather(null);
    setSystemWeatherError(null);
    setSystemWeatherLoading(false);
    systemWeatherDedupeRef.current = null;
    wizardHydratedForVisitRef.current = null;
    setWizardStateReady(false);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void refreshPendingEvidenceDrafts(id);
  }, [id, detail?.evidence.length, refreshPendingEvidenceDrafts]);

  useEffect(() => {
    const suggested = getSuggestedPhotoCategory(outcome);
    setSelectedPhotoCategory(suggested);
    latestPhotoCategoryRef.current = suggested;
  }, [outcome]);

  useEffect(() => {
    if (!detail) return;

    setObservedSiteConditions(observedWeatherFromPersisted(detail.visit.weather_conditions ?? ''));
    setFieldNotes(detail.visit.field_notes ?? '');
    setOutcome(detail.visit.outcome ?? 'sample_collected');
    setOutcomeExplicitlySelected(detail.visit.outcome != null);
    setPotentialForceMajeure(detail.visit.potential_force_majeure);
    setPotentialForceMajeureNotes(detail.visit.potential_force_majeure_notes ?? '');
    setStartCoords({
      latitude: detail.visit.started_latitude?.toString() ?? '',
      longitude: detail.visit.started_longitude?.toString() ?? '',
    });
    setCompleteCoords({
      latitude: detail.visit.completed_latitude?.toString() ?? '',
      longitude: detail.visit.completed_longitude?.toString() ?? '',
    });
    setNoDischargeNarrative(detail.noDischarge?.narrative ?? '');
    setNoDischargeCondition(detail.noDischarge?.observed_condition ?? '');
    setNoDischargeObstructionObserved(detail.noDischarge?.obstruction_observed ?? false);
    setNoDischargeObstructionDetails(detail.noDischarge?.obstruction_details ?? '');
    setAccessIssueNarrative(detail.accessIssue?.obstruction_narrative ?? '');
    setAccessIssueType(detail.accessIssue?.issue_type ?? 'access_issue');
    setContactAttempted(detail.accessIssue?.contact_attempted ?? false);
    setContactName(detail.accessIssue?.contact_name ?? '');
    setContactOutcome(detail.accessIssue?.contact_outcome ?? '');
    const cocRow = detail.measurements.find(
      (m) => m.parameter_name === FIELD_MEASUREMENT_COC_PRIMARY_CONTAINER,
    );
    setCocContainerId(cocRow?.measured_text ?? '');
    setCocPreservativeConfirmed(Boolean(cocRow?.metadata?.preservative_confirmed));
    setCocCaptureMethod(
      cocRow?.metadata?.capture_method === 'scan' ? 'scan' : 'manual',
    );
    setCocRawScanValue(
      typeof cocRow?.metadata?.raw_scan === 'string'
        ? cocRow.metadata.raw_scan
        : cocRow?.measured_text ?? '',
    );
    setRequiredMeasurementDrafts(
      Object.fromEntries(
        (detail.required_field_measurements ?? []).map((measurement) => {
          const latest = findSavedMeasurementForRequirement(detail.measurements, measurement);
          return [
            measurement.key,
            latest?.measured_value?.toString() ?? latest?.measured_text ?? '',
          ];
        }),
      ),
    );
    wizardHydratedForVisitRef.current = null;
    setWizardStateReady(true);
  }, [detail]);

  useEffect(() => {
    if (!detail) return;
    setInspection((current) => {
      const incoming = detail.inspection
        ? {
            ...detail.inspection,
            signage_condition: normalizeSignageCondition(detail.inspection.signage_condition) || '',
            pipe_condition: normalizePipeCondition(detail.inspection.pipe_condition) || '',
            obstruction_details: detail.inspection.obstruction_details ?? '',
            inspector_notes: detail.inspection.inspector_notes ?? '',
          }
        : { ...EMPTY_INSPECTION_STATE };

      const currentUpdatedAt = current.updated_at ? Date.parse(current.updated_at) : Number.NEGATIVE_INFINITY;
      const incomingUpdatedAt = detail.inspection?.updated_at ? Date.parse(detail.inspection.updated_at) : Number.NEGATIVE_INFINITY;
      const isSameVisit = current.field_visit_id === detail.visit.id || !current.field_visit_id;

      if (isSameVisit && currentUpdatedAt > incomingUpdatedAt) {
        return current;
      }

      return incoming;
    });
  }, [detail?.visit.id, detail?.inspection?.updated_at]);

  useEffect(() => {
    if (!id || !wizardStateReady || wizardHydratedForVisitRef.current !== id) return;
    persistFieldVisitWizardStep(id, activeStep);
  }, [activeStep, id, wizardStateReady]);

  const outfallMapsHref = useMemo(() => {
    if (!detail) return '';
    const lat = detail.visit.outfall_latitude;
    const lng = detail.visit.outfall_longitude;
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      return mapsSearchUrl(lat, lng);
    }
    const q = [detail.visit.permit_number, detail.visit.outfall_number].filter(Boolean).join(' ');
    return mapsSearchQueryUrl(q);
  }, [detail]);

  const visitOutboundQueuedCount = useMemo(() => {
    void outboundPendingCount;
    if (!id) return 0;
    return countOutboundQueueOpsForVisit(id);
  }, [id, outboundPendingCount]);

  const photoCount = useMemo(
    () => detail?.evidence.filter((asset) => asset.evidence_type === 'photo').length ?? 0,
    [detail?.evidence],
  );
  const pendingPhotoCount = useMemo(
    () => pendingEvidenceDrafts.filter((draft) => draft.evidenceType === 'photo').length,
    [pendingEvidenceDrafts],
  );
  const totalPhotoCount = photoCount + pendingPhotoCount;
  const uploadedPhotoCounts = useMemo(
    () => countPhotosByCategory(detail?.evidence ?? []),
    [detail?.evidence],
  );
  const pendingPhotoCounts = useMemo(
    () =>
      countPhotosByCategory(
        pendingEvidenceDrafts.map((draft) => ({
          evidence_type: draft.evidenceType,
          notes: draft.notes,
        })),
      ),
    [pendingEvidenceDrafts],
  );
  const visitLocked = detail?.visit.visit_status === 'completed';
  const outletInspectionObstructed =
    inspection.flow_status === 'obstructed' || (inspection.obstruction_observed ?? false);
  const isClientOnline = typeof navigator !== 'undefined' && navigator.onLine;
  const visitStarted = Boolean(detail?.visit.started_at);
  const canAttemptComplete = visitStarted && !visitLocked;
  const generalMeasurements = useMemo(
    () =>
      detail?.measurements.filter((m) => m.parameter_name !== FIELD_MEASUREMENT_COC_PRIMARY_CONTAINER) ??
      [],
    [detail?.measurements],
  );
  const requiredMeasurements = detail?.required_field_measurements ?? [];
  const additionalFieldObservations = useMemo(
    () =>
      generalMeasurements.filter(
        (measurement) =>
          !requiredMeasurements.some((requirement) =>
            measurementMatchesRequiredFieldMeasurement(measurement.parameter_name, requirement),
          ),
      ),
    [generalMeasurements, requiredMeasurements],
  );
  const requiredFieldMeasurementsComplete = useMemo(
    () =>
      requiredMeasurements.every((measurement) =>
        generalMeasurements.some((entry) =>
          measurementMatchesRequiredFieldMeasurement(entry.parameter_name, measurement),
        ),
      ),
    [generalMeasurements, requiredMeasurements],
  );
  const cocParsedScan = useMemo<FieldVisitScannedContainer | null>(() => {
    const sourceValue = (cocRawScanValue || cocContainerId).trim();
    if (!sourceValue) return null;
    return parseContainerScan(sourceValue);
  }, [cocContainerId, cocRawScanValue]);
  const cocValidation = useMemo(
    () => validateContainerAgainstStop(cocParsedScan, detail?.stop_requirements ?? []),
    [cocParsedScan, detail?.stop_requirements],
  );
  const cocSaveMetadata = useMemo<Record<string, unknown>>(
    () => ({
      capture_method: cocCaptureMethod,
      raw_scan: cocRawScanValue.trim() || cocContainerId.trim(),
      parsed_container_id: cocParsedScan?.container_id ?? (cocContainerId.trim() || null),
      parsed_serial_id: cocParsedScan?.serial_id ?? null,
      parsed_bottle_type: cocParsedScan?.bottle_type ?? null,
      preservative_hint: cocParsedScan?.preservative_hint ?? null,
      validation_status: cocValidation.status,
      validation_blocking: cocValidation.blocking,
      validation_message: cocValidation.message,
      expected_bottle_types: cocValidation.expected_bottle_types,
      actual_bottle_type: cocValidation.actual_bottle_type,
    }),
    [cocCaptureMethod, cocContainerId, cocParsedScan, cocRawScanValue, cocValidation],
  );
  const inspectionObstructionNarrative = useMemo(
    () => getInspectionObstructionNarrative(inspection.obstruction_details),
    [inspection.obstruction_details],
  );

  const completionChecklistItems = useMemo(() => {
    if (!detail) return [];
    const lat = Number(completeCoords.latitude);
    const lng = Number(completeCoords.longitude);
    return getFieldVisitCompletionChecklistItems({
      visitStarted,
      outcomeSelected: outcomeExplicitlySelected,
      requiredFieldMeasurementsComplete,
      containerValidationBlocking: cocValidation.blocking,
      completeLatitude: lat,
      completeLongitude: lng,
      inspectionFlowStatus: inspection.flow_status,
      outletInspectionObstructed,
      inspectionObstructionDetailsTrimmed: inspectionObstructionNarrative,
      outcome,
      cocContainerIdTrimmed: cocContainerId.trim(),
      cocPreservativeConfirmed,
      syncedPhotoCount: photoCount,
      pendingPhotoCount,
      isOnline: isClientOnline,
      noDischargeNarrativeTrimmed: noDischargeNarrative.trim(),
      noDischargeObstructionObserved,
      noDischargeObstructionDetailsTrimmed: noDischargeObstructionDetails.trim(),
      accessIssueNarrativeTrimmed: accessIssueNarrative.trim(),
    });
  }, [
    detail,
    visitStarted,
    outcomeExplicitlySelected,
    requiredFieldMeasurementsComplete,
    cocValidation.blocking,
    completeCoords.latitude,
    completeCoords.longitude,
    inspection.flow_status,
    inspectionObstructionNarrative,
    outletInspectionObstructed,
    outcome,
    cocContainerId,
    cocPreservativeConfirmed,
    photoCount,
    pendingPhotoCount,
    isClientOnline,
    noDischargeNarrative,
    noDischargeObstructionObserved,
    noDischargeObstructionDetails,
    accessIssueNarrative,
  ]);

  const evidenceFailureByDraftId = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of evidenceUploadFailures) {
      if (!m.has(f.draftId)) m.set(f.draftId, f.message);
    }
    return m;
  }, [evidenceUploadFailures]);

  const visitSiblingOutfallConflicts = useMemo(() => {
    if (!id || !detail) return [];
    const siblings = siblingVisitsSameOutfallSameDay(
      fieldQueueVisits,
      id,
      detail.visit.scheduled_date,
      detail.visit.outfall_id,
    );
    if (siblings.length === 0) return [];
    return groupSameOutfallSameDay([detail.visit, ...siblings]);
  }, [id, detail, fieldQueueVisits]);
  const sameDaySiblingCount = useMemo(
    () => visitSiblingOutfallConflicts[0]?.visits.length ? visitSiblingOutfallConflicts[0].visits.length - 1 : 0,
    [visitSiblingOutfallConflicts],
  );

  const weatherCoordinateSummary = useMemo(() => {
    if (!detail) return null;
    const lat =
      detail.visit.started_latitude != null
        ? Number(detail.visit.started_latitude)
        : Number(startCoords.latitude);
    const lng =
      detail.visit.started_longitude != null
        ? Number(detail.visit.started_longitude)
        : Number(startCoords.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }, [detail, startCoords.latitude, startCoords.longitude]);

  const startLatitude = Number(startCoords.latitude);
  const startLongitude = Number(startCoords.longitude);
  const completeLatitude = Number(completeCoords.latitude);
  const completeLongitude = Number(completeCoords.longitude);
  const completionCoordsReady =
    Number.isFinite(completeLatitude) && Number.isFinite(completeLongitude);
  const inspectionReady =
    (inspection.flow_status ?? 'unknown') !== 'unknown' &&
    (!outletInspectionObstructed || Boolean(inspectionObstructionNarrative));
  const noDischargeDetailsReady =
    Boolean(noDischargeNarrative.trim()) &&
    totalPhotoCount >= 1 &&
    (!noDischargeObstructionObserved || Boolean(noDischargeObstructionDetails.trim()));
  const accessIssueDetailsReady = Boolean(accessIssueNarrative.trim()) && totalPhotoCount >= 1;
  const sampleCollectedDetailsReady =
    !cocValidation.blocking &&
    requiredFieldMeasurementsComplete &&
    Boolean(cocContainerId.trim()) &&
    cocPreservativeConfirmed;
  const outcomeDetailsReady =
    outcome === 'sample_collected'
      ? sampleCollectedDetailsReady
      : outcome === 'no_discharge'
        ? noDischargeDetailsReady
        : accessIssueDetailsReady;
  const reviewReady = visitLocked || (canAttemptComplete && completionChecklistItems.every((item) => item.done));
  const readinessSummary = useMemo(
    () => summarizeCompletionChecklist(completionChecklistItems),
    [completionChecklistItems],
  );
  const deficiencyPrompts = useMemo(
    () => getFieldVisitDeficiencyPrompts({
      inspection,
      outcome,
      existingGovernanceIssueCount: detail?.governanceIssues.length ?? 0,
    }),
    [detail?.governanceIssues.length, inspection, outcome],
  );
  const reviewHooks = useMemo(
    () => getFieldVisitReviewHooks({
      outcome,
      totalPhotoCount,
      siblingVisitCount: sameDaySiblingCount,
      governanceIssues: detail?.governanceIssues ?? [],
      deficiencyPromptCount: deficiencyPrompts.length,
      contactAttempted,
      accessIssueType,
      potentialForceMajeure,
      outboundPendingCount,
      evidenceFailureCount: evidenceUploadFailures.length,
    }),
    [
      accessIssueType,
      contactAttempted,
      deficiencyPrompts.length,
      detail?.governanceIssues,
      evidenceUploadFailures.length,
      outboundPendingCount,
      outcome,
      potentialForceMajeure,
      sameDaySiblingCount,
      totalPhotoCount,
    ],
  );
  const qaPrompts = useMemo(
    () =>
      getFieldVisitQaPrompts({
        outcome,
        siblingVisitCount: sameDaySiblingCount,
        stopRequirements: detail?.stop_requirements ?? [],
        routePriorityReason: detail?.visit.route_priority_reason,
        totalPhotoCount,
        potentialForceMajeure,
      }),
    [
      detail?.stop_requirements,
      detail?.visit.route_priority_reason,
      outcome,
      potentialForceMajeure,
      sameDaySiblingCount,
      totalPhotoCount,
    ],
  );
  const requirementsModel = useMemo(
    () =>
      detail
        ? buildFieldVisitRequirementsModel({
            visit: detail.visit,
            outcome,
            stopRequirements: detail.stop_requirements,
            requiredMeasurements: detail.required_field_measurements,
          })
        : null,
    [detail, outcome],
  );
  const evidenceValidation = useMemo(
    () => validateFieldVisitOutcomeEvidence(outcome, photoCount, pendingPhotoCount, isClientOnline),
    [isClientOnline, outcome, pendingPhotoCount, photoCount],
  );
  const evidenceReady = outcome === 'sample_collected' ? true : evidenceValidation.ok;
  const startBlockerMessage = useMemo(() => {
    const startCheck = validateFieldVisitStartCoordinates(startLatitude, startLongitude);
    return startCheck.ok ? 'Start the visit before moving on.' : startCheck.message;
  }, [startLatitude, startLongitude]);
  const inspectionBlockerMessage = useMemo(() => {
    if ((inspection.flow_status ?? 'unknown') === 'unknown') return FIELD_VISIT_COPY.outletFlowRequired;
    if (outletInspectionObstructed && !inspectionObstructionNarrative) {
      return FIELD_VISIT_COPY.outletObstructionDetailsRequired;
    }
    return 'Save the outlet inspection before moving on.';
  }, [inspection.flow_status, inspectionObstructionNarrative, outletInspectionObstructed]);
  const outcomeDetailsBlockerMessage = useMemo(() => {
    if (outcome === 'sample_collected') {
      if (cocValidation.blocking) return FIELD_VISIT_COPY.sampleContainerMismatch;
      if (!requiredFieldMeasurementsComplete) return FIELD_VISIT_COPY.sampleFieldMeasurementsRequired;
      if (!cocContainerId.trim()) return FIELD_VISIT_COPY.sampleCocContainerRequired;
      if (!cocPreservativeConfirmed) return FIELD_VISIT_COPY.sampleCocPreservativeRequired;
      return 'Finish custody and required field readings before moving on.';
    }
    if (outcome === 'no_discharge') {
      if (!noDischargeNarrative.trim()) return FIELD_VISIT_COPY.noDischargeNarrativeRequired;
      if (noDischargeObstructionObserved && !noDischargeObstructionDetails.trim()) {
        return FIELD_VISIT_COPY.noDischargeObstructionDetailsRequired;
      }
      return 'Finish the no-discharge record before moving on.';
    }
    if (!accessIssueNarrative.trim()) return FIELD_VISIT_COPY.accessIssueNarrativeRequired;
    return 'Finish the access issue record before moving on.';
  }, [
    accessIssueNarrative,
    cocContainerId,
    cocPreservativeConfirmed,
    cocValidation.blocking,
    noDischargeNarrative,
    noDischargeObstructionDetails,
    noDischargeObstructionObserved,
    outcome,
    requiredFieldMeasurementsComplete,
  ]);
  const wizardGuardState = useMemo(
    () => ({
      visitStarted,
      inspectionReady,
      outcomeSelected: outcomeExplicitlySelected,
      outcomeDetailsReady,
      evidenceReady,
      startBlockerMessage,
      inspectionBlockerMessage,
      outcomeBlockerMessage: FIELD_VISIT_COPY.outcomeRequired,
      outcomeDetailsBlockerMessage,
      evidenceBlockerMessage: evidenceValidation.ok
        ? 'Evidence looks ready.'
        : evidenceValidation.message,
    }),
    [
      evidenceReady,
      evidenceValidation,
      inspectionBlockerMessage,
      inspectionReady,
      outcomeDetailsBlockerMessage,
      outcomeDetailsReady,
      outcomeExplicitlySelected,
      startBlockerMessage,
      visitStarted,
    ],
  );
  const recommendedStep = useMemo(
    () => (visitLocked ? 'review_complete' : getFieldVisitWizardRecommendedStep(wizardGuardState)),
    [visitLocked, wizardGuardState],
  );
  const progressSteps = useMemo<FieldVisitWizardProgressStep[]>(
    () =>
      FIELD_VISIT_WIZARD_STEPS.map((step) => ({
        ...step,
        status: activeStep === step.id
          ? 'current'
          : isFieldVisitWizardStepComplete(step.id, wizardGuardState)
            ? 'complete'
            : 'upcoming',
      })),
    [activeStep, wizardGuardState],
  );

  useEffect(() => {
    if (!id || !detail || !wizardStateReady || wizardHydratedForVisitRef.current === id) return;
    const storedStep = readStoredFieldVisitWizardStep(id);
    if (storedStep) {
      const access = validateFieldVisitWizardStepAccess({
        currentStep: recommendedStep,
        targetStep: storedStep,
        state: wizardGuardState,
      });
      setActiveStep(access.ok ? storedStep : recommendedStep);
    } else {
      setActiveStep(recommendedStep);
    }
    wizardHydratedForVisitRef.current = id;
  }, [detail, id, recommendedStep, wizardGuardState, wizardStateReady]);

  const fetchSystemWeather = useCallback(
    async (opts?: { manual?: boolean; notifyOnFailure?: boolean; lat?: number; lng?: number }) => {
      if (!detail || visitLocked) return;
      if (!isWeatherFetchEnabled()) {
        if (opts?.manual) toast.message('Weather automation is disabled for this build.');
        return;
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setSystemWeatherError('Connect to the network to load system weather.');
        if (opts?.manual || opts?.notifyOnFailure) toast.error('Offline — could not load system weather.');
        return;
      }
      const lat =
        opts?.lat ??
        (detail.visit.started_latitude != null
          ? Number(detail.visit.started_latitude)
          : Number(startCoords.latitude));
      const lng =
        opts?.lng ??
        (detail.visit.started_longitude != null
          ? Number(detail.visit.started_longitude)
          : Number(startCoords.longitude));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setSystemWeatherError('Start GPS is required before system weather can load.');
        if (opts?.manual || opts?.notifyOnFailure) toast.error('Capture start coordinates before refreshing weather.');
        return;
      }
      const dedupeKey = `${detail.visit.id}:${lat.toFixed(5)}:${lng.toFixed(5)}`;
      if (!opts?.manual && systemWeatherDedupeRef.current === dedupeKey) return;

      setSystemWeatherLoading(true);
      setSystemWeatherError(null);
      try {
        const snap = await fetchOpenMeteoCurrentSnapshot({ latitude: lat, longitude: lng });
        if (!opts?.manual) systemWeatherDedupeRef.current = dedupeKey;
        setSystemWeather(snap);
        if (opts?.manual) toast.success('System weather updated');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Weather fetch failed';
        setSystemWeatherError(msg);
        setSystemWeather(null);
        if (opts?.manual || opts?.notifyOnFailure) {
          toast.error(`System weather did not load: ${msg}`);
        }
      } finally {
        setSystemWeatherLoading(false);
      }
    },
    [detail, visitLocked, startCoords.latitude, startCoords.longitude],
  );

  useEffect(() => {
    if (!detail || !visitStarted || visitLocked) return;
    void fetchSystemWeather();
  }, [
    detail,
    visitStarted,
    visitLocked,
    fetchSystemWeather,
    startCoords.latitude,
    startCoords.longitude,
  ]);

  const handleApplySystemToObserved = useCallback(() => {
    if (!systemWeather) return;
    setObservedSiteConditions((prev) => {
      const line = `System snapshot: ${systemWeather.summary}`;
      const t = prev.trim();
      return t ? `${t}\n${line}` : line;
    });
    toast.success('Inserted system weather line into observed conditions');
  }, [systemWeather]);

  const applyPreviousInspectionSummary = useCallback(() => {
    const previous = detail?.previous_visit_context;
    if (!previous) return;
    setInspection((current) => ({
      ...current,
      flow_status: previous.inspection_flow_status ?? current.flow_status ?? 'unknown',
      signage_condition: normalizeSignageCondition(previous.signage_condition) || current.signage_condition || '',
      pipe_condition: normalizePipeCondition(previous.pipe_condition) || current.pipe_condition || '',
      erosion_observed: previous.erosion_observed,
      obstruction_observed: previous.obstruction_observed,
      obstruction_details: previous.obstruction_details ?? current.obstruction_details ?? '',
      inspector_notes: previous.inspector_notes ?? current.inspector_notes ?? '',
    }));
    toast.success('Applied last inspection summary');
  }, [detail?.previous_visit_context]);

  const appendFollowUpNote = useCallback((note: string) => {
    setFieldNotes((current) => (current.trim() ? `${current.trim()}\n${note}` : note));
    toast.success('Added follow-up note');
  }, []);

  const appendInspectionFollowUpNote = useCallback((note: string) => {
    setInspection((current) => ({
      ...current,
      inspector_notes: current.inspector_notes?.trim()
        ? `${current.inspector_notes.trim()}\n${note}`
        : note,
    }));
    toast.success('Added follow-up note to inspection notes');
  }, []);

  const routeSafetyHazard = useCallback(() => {
    setOutcome('access_issue');
    setOutcomeExplicitlySelected(true);
    setAccessIssueType('safety_hazard');
    setAccessIssueNarrative((current) =>
      current.trim()
        ? current
        : 'Sampling did not proceed because site conditions were unsafe at the time of visit.',
    );
    setFieldNotes((current) =>
      current.trim()
        ? `${current.trim()}\nSafety action: routed to safety hazard outcome.`
        : 'Safety action: routed to safety hazard outcome.',
    );
    goToStep('outcome_details');
    toast.success('Visit routed to safety hazard outcome');
  }, [goToStep]);

  const flagUnsafeToProceed = useCallback(() => {
    appendFollowUpNote('Safety action: unsafe to proceed. Sampling halted pending safer conditions or direction.');
  }, [appendFollowUpNote]);

  const recordLoneWorkerEscalation = useCallback(() => {
    appendFollowUpNote('Safety action: lone-worker escalation noted for this stop.');
  }, [appendFollowUpNote]);

  const focusForceMajeureEvidence = useCallback(() => {
    setPotentialForceMajeure(true);
    setSelectedPhotoCategory('site_weather');
    latestPhotoCategoryRef.current = 'site_weather';
    goToStep('evidence');
    toast.success('Focused site/weather evidence for force majeure documentation');
  }, [goToStep]);

  const focusPhotoBucket = useCallback((bucket: FieldVisitPhotoCategory, successMessage = 'Focused evidence bucket') => {
    setSelectedPhotoCategory(bucket);
    latestPhotoCategoryRef.current = bucket;
    goToStep('evidence');
    toast.success(successMessage);
  }, [goToStep]);

  const handleInspectionChange = useCallback((patch: Partial<OutletInspectionRecord>) => {
    setInspection((prev) => {
      const next = { ...prev, ...patch };
      if (patch.flow_status === 'obstructed' || patch.pipe_condition === 'Obstructed') {
        next.obstruction_observed = true;
      }
      return next;
    });
  }, []);

  async function handleCaptureStartCoords() {
    try {
      const coords = await captureBrowserCoordinates();
      setStartCoords({
        latitude: coords.latitude.toString(),
        longitude: coords.longitude.toString(),
      });
      toast.success('Start coordinates captured');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to capture coordinates');
    }
  }

  async function handleCaptureCompleteCoords() {
    try {
      const coords = await captureBrowserCoordinates();
      setCompleteCoords({
        latitude: coords.latitude.toString(),
        longitude: coords.longitude.toString(),
      });
      toast.success('Completion coordinates captured');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to capture coordinates');
    }
  }

  const handleStartVisit = useCallback(async () => {
    if (!detail) return;

    const startCheck = validateFieldVisitStartCoordinates(startLatitude, startLongitude);
    if (!startCheck.ok) {
      toast.error(startCheck.message);
      return;
    }

    try {
      setSaving(true);
      const { queued } = await startVisit(detail.visit.id, {
        latitude: startLatitude,
        longitude: startLongitude,
      });
      toast.success(
        queued
          ? 'Visit started on this device; will sync when you are back online'
          : 'Visit started',
      );
      void fetchSystemWeather({ lat: startLatitude, lng: startLongitude, notifyOnFailure: true });
      goToStep('inspection');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start visit');
    } finally {
      setSaving(false);
    }
  }, [detail, fetchSystemWeather, goToStep, startLatitude, startLongitude, startVisit]);

  async function handleSaveInspection() {
    if (!detail || visitLocked) return;

    try {
      setSaving(true);
      const { queued } = await saveInspection(detail.visit.id, inspection);
      toast.success(
        queued
          ? 'Inspection saved on this device; will upload when you are back online'
          : 'Inspection saved',
      );
      goToStep(outcomeExplicitlySelected ? 'outcome_details' : 'choose_outcome');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save inspection');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveRequiredMeasurement(
    requirement: FieldVisitDetails['required_field_measurements'][number],
  ) {
    if (!detail || visitLocked) return;
    const rawValue = (requiredMeasurementDrafts[requirement.key] ?? '').trim();
    if (!rawValue) {
      toast.error(FIELD_VISIT_COPY.measurementValueRequired);
      return;
    }
    const numericValue = Number(rawValue);
    const measuredValue = Number.isFinite(numericValue) ? numericValue : undefined;
    const measuredText = Number.isFinite(numericValue) ? undefined : rawValue;

    try {
      setSaving(true);
      const { queued } = await addMeasurement(detail.visit.id, {
        parameterName: requirement.parameter_name,
        measuredValue,
        measuredText,
        unit: requirement.default_unit ?? undefined,
      });
      toast.success(
        queued
          ? 'Saved on this device; will upload when you are back online'
          : `${requirement.display_label} captured`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add field measurement');
    } finally {
      setSaving(false);
    }
  }

  function handleContainerScanDetected(rawValue: string) {
    const parsed = parseContainerScan(rawValue);
    setCocRawScanValue(rawValue);
    setCocCaptureMethod('scan');
    setCocContainerId(parsed.container_id);
    toast.success('Primary container captured from scan');
  }

  async function handleSaveCoc() {
    if (!detail || visitLocked) return;
    if (!cocContainerId.trim()) {
      toast.error(FIELD_VISIT_COPY.saveCocContainerRequired);
      return;
    }
    if (cocValidation.blocking) {
      toast.error(FIELD_VISIT_COPY.sampleContainerMismatch);
      return;
    }
    if (!cocPreservativeConfirmed) {
      toast.error(FIELD_VISIT_COPY.sampleCocPreservativeRequired);
      return;
    }

    try {
      setSaving(true);
      const { queued } = await saveCocPrimaryContainer(
        detail.visit.id,
        cocContainerId,
        cocPreservativeConfirmed,
        cocSaveMetadata,
      );
      toast.success(
        queued
          ? 'Chain of custody saved on this device; will upload when you are back online'
          : 'Chain of custody record saved',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save chain of custody');
    } finally {
      setSaving(false);
    }
  }

  async function handleCompletion() {
    if (!detail) return;

    const completionCheck = validateFieldVisitCompletion({
      outcomeSelected: outcomeExplicitlySelected,
      requiredFieldMeasurementsComplete,
      containerValidationBlocking: cocValidation.blocking,
      completeLatitude,
      completeLongitude,
      inspectionFlowStatus: inspection.flow_status,
      outletInspectionObstructed,
      inspectionObstructionDetailsTrimmed: inspectionObstructionNarrative,
      outcome,
      cocContainerIdTrimmed: cocContainerId.trim(),
      cocPreservativeConfirmed,
      syncedPhotoCount: photoCount,
      pendingPhotoCount,
      isOnline: typeof navigator !== 'undefined' && navigator.onLine,
      noDischargeNarrativeTrimmed: noDischargeNarrative.trim(),
      noDischargeObstructionObserved,
      noDischargeObstructionDetailsTrimmed: noDischargeObstructionDetails.trim(),
      accessIssueNarrativeTrimmed: accessIssueNarrative.trim(),
    });

    if (!completionCheck.ok) {
      toast.error(completionCheck.message);
      goToStep(recommendedStep);
      return;
    }

    try {
      setSaving(true);
      if (outcome === 'sample_collected') {
        await saveCocPrimaryContainer(
          detail.visit.id,
          cocContainerId,
          cocPreservativeConfirmed,
          cocSaveMetadata,
        );
      }
      await saveInspection(detail.visit.id, inspection);
      const { queued, result } = await completeVisit(detail.visit, {
        outcome,
        completedCoords: { latitude: completeLatitude, longitude: completeLongitude },
        weatherConditions: formatWeatherForPersistence(observedSiteConditions, systemWeather),
        fieldNotes,
        potentialForceMajeure,
        potentialForceMajeureNotes,
        noDischarge: {
          narrative: noDischargeNarrative,
          observedCondition: noDischargeCondition,
          obstructionObserved: noDischargeObstructionObserved,
          obstructionDetails: noDischargeObstructionDetails,
        },
        accessIssue: {
          issueType: accessIssueType,
          obstructionNarrative: accessIssueNarrative,
          contactAttempted,
          contactName,
          contactOutcome,
        },
      });
      toast.success(
        queued
          ? 'Visit completed on this device; it will sync when you are back online'
          : result.governance_issue_id
            ? 'Visit completed and governance issue created'
            : 'Visit completed',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to complete visit');
    } finally {
      setSaving(false);
    }
  }

  const evidenceCategories = useMemo(() => {
    const categories = new Set<FieldVisitPhotoCategory>(getRequiredPhotoCategories(outcome));

    for (const prompt of qaPrompts) {
      categories.add(prompt.focusBucket);
    }

    if (potentialForceMajeure) {
      categories.add('site_weather');
    }

    if (deficiencyPrompts.length > 0 || outcome === 'access_issue') {
      categories.add('obstruction_deficiency');
    }

    return Array.from(categories);
  }, [deficiencyPrompts.length, outcome, potentialForceMajeure, qaPrompts]);

  useEffect(() => {
    if (evidenceCategories.length === 0) return;
    if (evidenceCategories.includes(selectedPhotoCategory)) return;
    const fallback = evidenceCategories[0]!;
    setSelectedPhotoCategory(fallback);
    latestPhotoCategoryRef.current = fallback;
  }, [evidenceCategories, selectedPhotoCategory]);

  const handleWizardStepSelect = useCallback((targetStep: FieldVisitWizardStepId) => {
    if (visitLocked) {
      goToStep(targetStep);
      return;
    }

    const access = validateFieldVisitWizardStepAccess({
      currentStep: activeStep,
      targetStep,
      state: wizardGuardState,
    });

    if (!access.ok) {
      toast.error(access.message);
      goToStep(access.blockedStep);
      return;
    }

    goToStep(targetStep);
  }, [activeStep, goToStep, visitLocked, wizardGuardState]);

  const handleWizardAdvance = useCallback(async () => {
    if (visitLocked && activeStep !== 'review_complete') {
      const nextStep = getNextFieldVisitWizardStep(activeStep);
      if (nextStep) {
        goToStep(nextStep);
      }
      return;
    }

    switch (activeStep) {
      case 'start_visit':
        if (visitStarted) {
          goToStep('inspection');
          return;
        }
        await handleStartVisit();
        return;
      case 'inspection': {
        const inspectionAdvance = validateFieldVisitWizardAdvanceStep('inspection', wizardGuardState);
        if (!inspectionAdvance.ok) {
          toast.error(inspectionAdvance.message);
          return;
        }
        await handleSaveInspection();
        return;
      }
      case 'choose_outcome': {
        const outcomeAdvance = validateFieldVisitWizardAdvanceStep('choose_outcome', wizardGuardState);
        if (!outcomeAdvance.ok) {
          toast.error(outcomeAdvance.message);
          return;
        }
        goToStep('outcome_details');
        return;
      }
      case 'outcome_details': {
        const outcomeDetailsAdvance = validateFieldVisitWizardAdvanceStep('outcome_details', wizardGuardState);
        if (!outcomeDetailsAdvance.ok) {
          toast.error(outcomeDetailsAdvance.message);
          return;
        }
        goToStep('evidence');
        return;
      }
      case 'evidence': {
        const evidenceAdvance = validateFieldVisitWizardAdvanceStep('evidence', wizardGuardState);
        if (!evidenceAdvance.ok) {
          toast.error(evidenceAdvance.message);
          return;
        }
        goToStep('review_complete');
        return;
      }
      case 'review_complete':
        await handleCompletion();
        return;
      default:
        return;
    }
  }, [
    activeStep,
    goToStep,
    handleStartVisit,
    visitStarted,
    visitLocked,
    wizardGuardState,
  ]);

  if (detailLoading || (!loadAttempted && !detail)) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" aria-hidden />
            <div>
              <h1 className="text-lg font-semibold text-text-primary">Field visit unavailable</h1>
              <p className="mt-2 text-sm text-text-secondary">
                We could not load this visit after checking the scoped cache, saved route shell, and live data.
                Refresh the field queue or go back and retry once you have the right org/user context or a better connection.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  to="/field/dispatch"
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary"
                >
                  Back to field queue
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    if (!id) return;
                    setLoadAttempted(false);
                    loadVisitDetails(id)
                      .catch((error) => {
                        console.error('[FieldVisitPage] Failed to retry visit details:', error);
                        toast.error(error instanceof Error ? error.message : 'Failed to load field visit');
                      })
                      .finally(() => {
                        setLoadAttempted(true);
                      });
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-400/35 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-100 transition-colors hover:bg-red-500/20"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  Retry visit load
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const orgScopedPrefix = `${detail.visit.organization_id}/field-visits/`;

  const renderEvidenceContent = (allowedCategories?: FieldVisitPhotoCategory[]) => (
    <>
      <FieldVisitPhotoBuckets
        outcome={outcome}
        selectedCategory={selectedPhotoCategory}
        uploadedCounts={uploadedPhotoCounts}
        pendingCounts={pendingPhotoCounts}
        allowedCategories={allowedCategories}
        onSelectCategory={(category) => {
          setSelectedPhotoCategory(category);
          latestPhotoCategoryRef.current = category;
        }}
      />

      <div className="mt-4">
        <EvidenceCaptureUpload
          submissionType="field_visit"
          referenceId={detail.visit.id}
          bucket="field-inspections"
          pathPrefix={orgScopedPrefix}
          acceptedTypes={['.pdf', '.png', '.jpg', '.jpeg', '.heic', '.webp']}
          disabled={visitLocked}
          onFileAccepted={async (file) => {
            const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
            const evidenceType = ['png', 'jpg', 'jpeg', 'heic', 'webp'].includes(ext) ? 'photo' : 'document';
            const category = latestPhotoCategoryRef.current;
            const notes = evidenceType === 'photo' ? serializePhotoEvidenceCategory(category) : null;

            if (typeof navigator !== 'undefined' && navigator.onLine) {
              uploadPhotoCategoryRef.current = category;
              return { handled: false };
            }

            await saveFieldEvidenceDraft({
              fieldVisitId: detail.visit.id,
              bucket: 'field-inspections',
              pathPrefix: orgScopedPrefix,
              file,
              evidenceType,
              notes,
              latitude: completeCoords.latitude ? Number(completeCoords.latitude) : null,
              longitude: completeCoords.longitude ? Number(completeCoords.longitude) : null,
            });
            await refreshPendingEvidenceDrafts(detail.visit.id);
            void refreshOutboundPendingCount();

            return {
              handled: true,
              message: 'Evidence saved on this device; it will upload when you are back online',
            };
          }}
          onUploaded={(path) => {
            const ext = path.split('.').pop()?.toLowerCase() ?? '';
            const evidenceType = ['png', 'jpg', 'jpeg', 'heic', 'webp'].includes(ext) ? 'photo' : 'document';
            const notes = evidenceType === 'photo'
              ? serializePhotoEvidenceCategory(uploadPhotoCategoryRef.current)
              : undefined;
            recordEvidenceAsset({
              fieldVisitId: detail.visit.id,
              storagePath: path,
              bucket: 'field-inspections',
              evidenceType,
              notes,
              coords: completeCoords.latitude && completeCoords.longitude
                ? {
                    latitude: Number(completeCoords.latitude),
                    longitude: Number(completeCoords.longitude),
                  }
                : undefined,
            }).catch((error) => {
              toast.error(error instanceof Error ? error.message : 'Failed to record evidence');
            });
          }}
        />
      </div>

      {pendingEvidenceDrafts.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/15 bg-amber-500/[0.07] px-3 py-2">
            <p className="text-xs text-amber-100/90">
              Pending on this device — upload when online.
            </p>
            <button
              type="button"
              disabled={fieldQueueLoading || detailLoading}
              onClick={() => {
                void handleFieldSyncRefresh().catch((err) => {
                  toast.error(err instanceof Error ? err.message : 'Retry failed');
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/35 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${fieldQueueLoading || detailLoading ? 'animate-spin' : ''}`}
                aria-hidden
              />
              Retry pending uploads
            </button>
          </div>
          {pendingEvidenceDrafts.map((draft) => (
            <div
              key={draft.id}
              className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm"
            >
              <div className="font-medium text-amber-100">{draft.fileName}</div>
              <div className="mt-1 text-xs text-amber-200/80">
                {draft.evidenceType === 'photo' && parsePhotoEvidenceCategory(draft.notes)
                  ? `${getPhotoBucketDefinition(parsePhotoEvidenceCategory(draft.notes)!).label} photo pending sync`
                  : `${draft.evidenceType.replace('_', ' ')} pending sync`}
              </div>
              {evidenceFailureByDraftId.get(draft.id) ? (
                <div className="mt-2 text-xs text-red-200/95">
                  Last upload attempt: {evidenceFailureByDraftId.get(draft.id)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        <SubmissionEvidenceViewer
          bucket="field-inspections"
          paths={detail.evidence.map((asset) => asset.storage_path)}
        />
      </div>
    </>
  );

  const renderOperationalNotes = () => (
    <>
      <FieldVisitWeatherCard
        visitLocked={visitLocked}
        visitStarted={visitStarted}
        fetchEnabled={isWeatherFetchEnabled()}
        isOnline={isClientOnline}
        coordinateSummary={weatherCoordinateSummary}
        systemWeather={systemWeather}
        systemLoading={systemWeatherLoading}
        systemError={systemWeatherError}
        observedSiteConditions={observedSiteConditions}
        onObservedChange={setObservedSiteConditions}
        onRefreshSystem={() => void fetchSystemWeather({ manual: true })}
        onApplySystemToObserved={handleApplySystemToObserved}
      />

      <label className="block space-y-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
          Field notes
        </span>
        <input
          value={fieldNotes}
          onChange={(e) => setFieldNotes(e.target.value)}
          disabled={visitLocked}
          placeholder="Context that will help review, lab intake, or follow-up."
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
        />
      </label>

      <FieldVisitForceMajeureAssistPanel
        checked={potentialForceMajeure}
        notes={potentialForceMajeureNotes}
        outcome={outcome}
        disabled={visitLocked}
        selectedEvidenceBucketFocused={selectedPhotoCategory === 'site_weather'}
        existingIssue={detail.governanceIssues.find((issue) => issue.issue_type === 'potential_force_majeure') ?? null}
        governanceInboxHref={governanceInboxHref}
        governanceDisabledReason={governanceDisabledReason}
        onCheckedChange={setPotentialForceMajeure}
        onNotesChange={setPotentialForceMajeureNotes}
        onAppendNote={(text) =>
          setPotentialForceMajeureNotes((current) => (current.trim() ? `${current.trim()}\n${text}` : text))
        }
        onReplaceNote={setPotentialForceMajeureNotes}
        onFocusEvidence={focusForceMajeureEvidence}
      />

      {outcome === 'sample_collected' ? (
        <QuickPhrasePicker
          title="Collection note templates"
          description="Use a template to seed field notes, then edit to match the actual stop."
          templates={getOutcomeQuickPhrases('sample_collected')}
          disabled={visitLocked}
          onAppend={(text) => setFieldNotes((current) => (current.trim() ? `${current.trim()}\n${text}` : text))}
          onReplace={setFieldNotes}
        />
      ) : null}
    </>
  );

  const renderSampleCollectedContent = () => (
    <div className="space-y-5">
      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.06] p-5">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-secondary">
          Guided custody lane
        </h3>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {[
            '1. Scan or enter the primary container.',
            '2. Confirm bottle and preservative match the plan.',
            '3. Save chain of custody before leaving the collection lane.',
            '4. Record only the on-site field measurements required for this stop.',
          ].map((step) => (
            <div key={step} className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3 text-sm text-text-secondary">
              {step}
            </div>
          ))}
        </div>
      </div>

      <CustodyScanPanel
        containerId={cocContainerId}
        captureMethod={cocCaptureMethod}
        preservativeConfirmed={cocPreservativeConfirmed}
        validation={cocValidation}
        disabled={visitLocked}
        saving={saving}
        onContainerIdChange={(value) => {
          setCocContainerId(value);
          setCocRawScanValue(value);
        }}
        onCaptureMethodChange={setCocCaptureMethod}
        onPreservativeConfirmedChange={setCocPreservativeConfirmed}
        onScanDetected={handleContainerScanDetected}
        onSave={handleSaveCoc}
      />

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-secondary">
          On-Site Field Measurements
        </h3>
        <p className="mt-2 text-sm text-text-secondary">{FIELD_VISIT_COPY.fieldMeasurementsNotLab}</p>

        <div className="mt-5 space-y-3">
          {detail.required_field_measurements.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.1] bg-black/10 px-4 py-3 text-sm text-text-muted">
              No field meter readings are currently required from the scheduled parameter set for this stop.
            </div>
          ) : (
            detail.required_field_measurements.map((measurement) => {
              const latestSaved = findSavedMeasurementForRequirement(generalMeasurements, measurement);

              return (
                <div key={measurement.key} className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-text-primary">
                        {measurement.display_label}
                        {measurement.default_unit ? ` · ${measurement.default_unit}` : ''}
                      </div>
                      <div className="mt-1 text-xs text-text-secondary">{measurement.rationale}</div>
                      <div className="mt-1 text-xs text-cyan-200/85">
                        Required because this stop includes: {measurement.source_parameter_names.join(', ')}
                      </div>
                    </div>
                    <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-text-secondary">
                      Latest saved:{' '}
                      <span className="font-medium text-text-primary">
                        {latestSaved
                          ? `${latestSaved.measured_value ?? latestSaved.measured_text ?? '—'}${latestSaved.unit ? ` ${latestSaved.unit}` : ''}`
                          : 'Not recorded'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      value={requiredMeasurementDrafts[measurement.key] ?? ''}
                      onChange={(event) => setRequiredMeasurementDrafts((current) => ({
                        ...current,
                        [measurement.key]: event.target.value,
                      }))}
                      placeholder={fieldMeasurementInputPlaceholder(measurement)}
                      disabled={visitLocked}
                      inputMode="decimal"
                      autoComplete="off"
                      className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveRequiredMeasurement(measurement)}
                      disabled={saving || visitLocked}
                      className="rounded-xl bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-white/[0.1] disabled:opacity-60"
                    >
                      Save reading
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {additionalFieldObservations.length > 0 ? (
          <div className="mt-4 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              Additional recorded field observations
            </div>
            <p className="text-xs text-text-secondary">{FIELD_VISIT_COPY.additionalFieldObservationsExplainer}</p>
            {additionalFieldObservations.map((measurement) => (
              <div key={measurement.id} className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3 text-sm">
                <div className="font-medium text-text-primary">{measurement.parameter_name}</div>
                <div className="mt-1 text-text-secondary">
                  {measurement.measured_value ?? measurement.measured_text ?? '—'} {measurement.unit ?? ''}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );

  const renderNoDischargeContent = () => (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-secondary">
        No-discharge record
      </h3>
      <label className="mt-4 block space-y-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
          Narrative <span className="text-amber-200/90">(required)</span>
        </span>
        <textarea
          value={noDischargeNarrative}
          onChange={(e) => setNoDischargeNarrative(e.target.value)}
          rows={4}
          disabled={visitLocked}
          placeholder="Describe the no-flow condition at the actual sampling point."
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
        />
      </label>

      <label className="mt-4 block space-y-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
          Observed condition
        </span>
        <textarea
          value={noDischargeCondition}
          onChange={(e) => setNoDischargeCondition(e.target.value)}
          rows={3}
          disabled={visitLocked}
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
        />
      </label>

      <label className="mt-4 inline-flex items-center gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={noDischargeObstructionObserved}
          onChange={(e) => setNoDischargeObstructionObserved(e.target.checked)}
          disabled={visitLocked}
        />
        Obstruction observed
      </label>

      <label className="mt-4 block space-y-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
          Obstruction details
        </span>
        <textarea
          value={noDischargeObstructionDetails}
          onChange={(e) => setNoDischargeObstructionDetails(e.target.value)}
          rows={3}
          disabled={visitLocked}
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
        />
      </label>

      {detail?.previous_visit_context?.no_discharge_narrative ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={visitLocked}
            onClick={() => setNoDischargeNarrative(detail.previous_visit_context?.no_discharge_narrative ?? '')}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-white/[0.08] disabled:opacity-60"
          >
            Copy last no-discharge note
          </button>
        </div>
      ) : null}

      <div className="mt-4">
        <QuickPhrasePicker
          title="No-discharge quick phrases"
          description="Seed the narrative with a common field pattern, then edit it to the actual conditions."
          templates={getOutcomeQuickPhrases('no_discharge')}
          disabled={visitLocked}
          onAppend={(text) => setNoDischargeNarrative((current) => (current.trim() ? `${current.trim()}\n${text}` : text))}
          onReplace={setNoDischargeNarrative}
        />
      </div>
    </div>
  );

  const renderAccessIssueContent = () => (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-secondary">
        Access issue escalation
      </h3>

      <label className="mt-4 block space-y-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
          Issue type
        </span>
        <select
          value={accessIssueType}
          onChange={(e) => setAccessIssueType(e.target.value)}
          disabled={visitLocked}
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
        >
          <option value="access_issue">Access issue</option>
          <option value="road_blocked">Road blocked</option>
          <option value="locked_gate">Locked gate</option>
          <option value="weather">Weather</option>
          <option value="safety_hazard">Safety hazard</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label className="mt-4 block space-y-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
          Obstruction narrative <span className="text-rose-200/90">(required)</span>
        </span>
        <textarea
          value={accessIssueNarrative}
          onChange={(e) => setAccessIssueNarrative(e.target.value)}
          rows={4}
          disabled={visitLocked}
          placeholder="Describe the physical access problem and why sampling could not proceed."
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
        />
      </label>

      <label className="mt-4 inline-flex items-center gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={contactAttempted}
          onChange={(e) => setContactAttempted(e.target.checked)}
          disabled={visitLocked}
        />
        Contact attempted
      </label>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <input
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="Contact name"
          disabled={visitLocked}
          className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
        />
        <input
          value={contactOutcome}
          onChange={(e) => setContactOutcome(e.target.value)}
          placeholder="Contact outcome"
          disabled={visitLocked}
          className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
        />
      </div>

      {detail?.previous_visit_context?.access_issue_narrative ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={visitLocked}
            onClick={() => {
              setAccessIssueNarrative(detail.previous_visit_context?.access_issue_narrative ?? '');
              if (detail.previous_visit_context?.access_issue_type) {
                setAccessIssueType(detail.previous_visit_context.access_issue_type);
              }
            }}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-white/[0.08] disabled:opacity-60"
          >
            Copy last access issue
          </button>
        </div>
      ) : null}

      <div className="mt-4">
        <QuickPhrasePicker
          title="Access issue quick phrases"
          description="Use a controlled phrase to reduce typing, then tailor it to the real blockage or hazard."
          templates={getOutcomeQuickPhrases('access_issue')}
          disabled={visitLocked}
          onAppend={(text) => setAccessIssueNarrative((current) => (current.trim() ? `${current.trim()}\n${text}` : text))}
          onReplace={setAccessIssueNarrative}
        />
      </div>
    </div>
  );

  const previousStep = getPreviousFieldVisitWizardStep(activeStep);
  const currentStepMeta = getFieldVisitWizardStep(activeStep);
  const recommendedStepMeta = getFieldVisitWizardStep(recommendedStep);

  const sameAsLastHelpers = detail.previous_visit_context ? (
    <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
            Same-as-last helpers
          </div>
          <div className="mt-2 text-sm text-text-secondary">
            Reuse the prior inspection summary when the stop conditions are unchanged, then edit only what differs.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={visitLocked}
            onClick={applyPreviousInspectionSummary}
            className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-500/20 disabled:opacity-60"
          >
            Apply last inspection
          </button>
          {detail.previous_visit_context.signage_condition ? (
            <button
              type="button"
              disabled={visitLocked}
              onClick={() => setInspection((prev) => ({
                ...prev,
                signage_condition: normalizeSignageCondition(detail.previous_visit_context?.signage_condition) || prev.signage_condition || '',
              }))}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-white/[0.08] disabled:opacity-60"
            >
              Copy signage
            </button>
          ) : null}
          {detail.previous_visit_context.pipe_condition ? (
            <button
              type="button"
              disabled={visitLocked}
              onClick={() => setInspection((prev) => ({
                ...prev,
                pipe_condition: normalizePipeCondition(detail.previous_visit_context?.pipe_condition) || prev.pipe_condition || '',
              }))}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-white/[0.08] disabled:opacity-60"
            >
              Copy pipe condition
            </button>
          ) : null}
        </div>
      </div>
    </div>
  ) : null;

  const deficiencyPromptsNode = (
    <FieldVisitDeficiencyPrompts
      prompts={deficiencyPrompts}
      disabled={visitLocked}
      onSetDeficiencyBucket={() => {
        focusPhotoBucket(
          'obstruction_deficiency',
          'Focused obstruction / deficiency evidence bucket',
        );
      }}
      onAppendFollowUpNote={appendInspectionFollowUpNote}
      governanceInboxHref={governanceInboxHref}
      governanceDisabledReason={governanceDisabledReason}
    />
  );

  const qaPromptsNode = (
    <FieldVisitQaPromptsPanel
      prompts={qaPrompts}
      disabled={visitLocked}
      onAppendNote={appendFollowUpNote}
      onFocusBucket={focusPhotoBucket}
    />
  );

  const safetyActionsNode = (
    <SafetyActionsPanel
      disabled={visitLocked}
      onRouteSafetyHazard={routeSafetyHazard}
      onFlagUnsafeToProceed={flagUnsafeToProceed}
      onRecordLoneWorkerEscalation={recordLoneWorkerEscalation}
    />
  );

  const evidenceFocusPrompts = (
    <div className="space-y-3">
      {qaPrompts.length > 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
            Evidence focus prompts
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {qaPrompts.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                disabled={visitLocked}
                onClick={() => focusPhotoBucket(prompt.focusBucket)}
                className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-500/20 disabled:opacity-60"
              >
                Focus {getPhotoBucketDefinition(prompt.focusBucket).label.toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {potentialForceMajeure ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Force majeure is flagged. Make sure the <span className="font-medium">Site / weather</span> bucket shows the conditions that support the timing narrative.
        </div>
      ) : null}

      {deficiencyPrompts.length > 0 ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          Inspection follow-up is active. Keep the <span className="font-medium">Obstruction / deficiency</span> bucket current before review.
        </div>
      ) : null}
    </div>
  );

  const reviewSummaryCards = (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Outcome</div>
          <div className="mt-2 text-sm font-medium text-text-primary">{formatOutcomeLabel(outcome)}</div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Completion GPS</div>
          <div className="mt-2 text-sm font-medium text-text-primary">
            {completionCoordsReady ? 'Recorded' : 'Missing'}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Evidence</div>
          <div className="mt-2 text-sm font-medium text-text-primary">
            {photoCount} uploaded / {pendingPhotoCount} pending
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Governance issues</div>
          <div className="mt-2 text-sm font-medium text-text-primary">{detail.governanceIssues.length}</div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Primary blockers</div>
          <div className="mt-2 text-sm font-medium text-text-primary">{readinessSummary.blockerCount}</div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Follow-up prompts</div>
          <div className="mt-2 text-sm font-medium text-text-primary">{deficiencyPrompts.length + qaPrompts.length}</div>
        </div>
      </div>

      <FieldVisitRequirementsCard
        stopRequirements={detail.stop_requirements}
        requiredMeasurements={detail.required_field_measurements}
        model={requirementsModel ?? buildFieldVisitRequirementsModel({
          visit: detail.visit,
          outcome,
          stopRequirements: detail.stop_requirements,
          requiredMeasurements: detail.required_field_measurements,
        })}
      />
    </div>
  );

  const reviewCompletionLocation = (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-secondary">
            Completion location
          </h3>
          <p className="mt-2 text-sm text-text-secondary">
            Capture the completion GPS here before finalizing the visit record.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCaptureCompleteCoords}
          disabled={visitLocked}
          className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary disabled:opacity-60"
        >
          Capture completion GPS
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="space-y-2" htmlFor="field-visit-complete-lat">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">Completion latitude</span>
          <input
            id="field-visit-complete-lat"
            name="field-visit-complete-lat"
            inputMode="decimal"
            autoComplete="off"
            value={completeCoords.latitude}
            onChange={(event) => setCompleteCoords((prev) => ({ ...prev, latitude: event.target.value }))}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
          />
        </label>
        <label className="space-y-2" htmlFor="field-visit-complete-lng">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">Completion longitude</span>
          <input
            id="field-visit-complete-lng"
            name="field-visit-complete-lng"
            inputMode="decimal"
            autoComplete="off"
            value={completeCoords.longitude}
            onChange={(event) => setCompleteCoords((prev) => ({ ...prev, longitude: event.target.value }))}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
          />
        </label>
      </div>
    </div>
  );

  const governanceIssuesNode = detail.governanceIssues.length > 0 ? (
    <div className="space-y-3">
      {detail.governanceIssues.map((issue: GovernanceIssueRecord) => {
        const response = describeGovernanceDeadline(issue.response_deadline);
        const notice = describeGovernanceDeadline(issue.notice_deadline);
        const written = describeGovernanceDeadline(issue.written_deadline);
        const isFm = issue.issue_type === 'potential_force_majeure';
        return (
          <div
            key={issue.id}
            className={`rounded-xl border px-4 py-3 text-sm ${
              isFm ? 'border-amber-500/25 bg-amber-500/5' : 'border-white/[0.06] bg-white/[0.02]'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium text-text-primary">{issue.title}</div>
                <div className="mt-0.5 text-xs text-text-muted">
                  {issue.issue_type.replace(/_/g, ' ')} · Step {issue.current_step} · {issue.current_status.replace(/_/g, ' ')}
                </div>
              </div>
              {isFm ? (
                <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-200">
                  FM candidate
                </span>
              ) : null}
            </div>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-text-muted">Response</dt>
                <dd className={`mt-0.5 font-medium ${deadlineToneClass(response.tone)}`}>{response.text}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Notice target</dt>
                <dd className={`mt-0.5 font-medium ${deadlineToneClass(notice.tone)}`}>{notice.text}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Written target</dt>
                <dd className={`mt-0.5 font-medium ${deadlineToneClass(written.tone)}`}>{written.text}</dd>
              </div>
            </dl>
          </div>
        );
      })}
      {governanceInboxHref ? (
        <div className="text-sm text-text-secondary">
          <Link to={governanceInboxHref} className="text-cyan-300 hover:text-cyan-200">
            Open governance inbox
          </Link>
        </div>
      ) : (
        <div className="text-sm text-text-muted">{governanceDisabledReason}</div>
      )}
    </div>
  ) : null;

  const forceMajeureBanner = potentialForceMajeure ? (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      Potential force majeure is flagged on this visit. Review the timing language, site/weather evidence, and governance deadlines before completion.
    </div>
  ) : null;

  const syncGuidance = (!isClientOnline || visitOutboundQueuedCount > 0 || evidenceUploadFailures.length > 0 || outboundQueueDiagnostic) ? (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/85">
        Sync guidance
      </div>
      <div className="mt-2 space-y-1 text-sm text-text-primary">
        {!isClientOnline ? <div>Reconnect before trusting the final server record. Device changes remain local while offline.</div> : null}
        {visitOutboundQueuedCount > 0 ? <div>Use Refresh in the sync bar after connectivity is stable to flush queued visit actions.</div> : null}
        {evidenceUploadFailures.length > 0 ? <div>Retry failed photo uploads before treating the evidence package as complete.</div> : null}
        {outboundQueueDiagnostic ? <div>The queue is blocked. Review the sync-health details before making more changes to this stop.</div> : null}
      </div>
    </div>
  ) : null;

  const lockedBanner = visitLocked ? (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
      This visit record is complete and locked from further field edits.
    </div>
  ) : null;

  const weatherStatusBanner = visitStarted && !visitLocked && isWeatherFetchEnabled()
    ? systemWeatherLoading ? (
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          System weather is still loading from your start GPS. You can keep moving, but confirm the snapshot before closeout.
        </div>
      ) : systemWeatherError ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          System weather did not load. {systemWeatherError} Return to <span className="font-medium">Start Visit</span> and use{' '}
          <span className="font-medium">Refresh system weather</span>.
        </div>
      ) : null
    : null;

  const currentStepContent = (() => {
    switch (activeStep) {
      case 'start_visit':
        return (
          <FieldVisitStartStep
            startLatitude={startCoords.latitude}
            startLongitude={startCoords.longitude}
            onStartLatitudeChange={(value) => setStartCoords((prev) => ({ ...prev, latitude: value }))}
            onStartLongitudeChange={(value) => setStartCoords((prev) => ({ ...prev, longitude: value }))}
            onCaptureStartCoords={() => {
              void handleCaptureStartCoords();
            }}
            visitStarted={visitStarted}
            visitLocked={visitLocked}
            outfallMapsHref={outfallMapsHref}
            syncGuidance={syncGuidance}
            weatherCard={
              <FieldVisitWeatherCard
                visitLocked={visitLocked}
                visitStarted={visitStarted}
                fetchEnabled={isWeatherFetchEnabled()}
                isOnline={isClientOnline}
                coordinateSummary={weatherCoordinateSummary}
                systemWeather={systemWeather}
                systemLoading={systemWeatherLoading}
                systemError={systemWeatherError}
                observedSiteConditions={observedSiteConditions}
                onObservedChange={setObservedSiteConditions}
                onRefreshSystem={() => void fetchSystemWeather({ manual: true })}
                onApplySystemToObserved={handleApplySystemToObserved}
              />
            }
          />
        );
      case 'inspection':
        return (
          <FieldVisitInspectionStep
            inspection={inspection}
            outletInspectionObstructed={outletInspectionObstructed}
            visitLocked={visitLocked}
            onInspectionChange={handleInspectionChange}
            sameAsLastHelpers={sameAsLastHelpers}
            deficiencyPrompts={deficiencyPromptsNode}
          />
        );
      case 'choose_outcome':
        return (
          <FieldVisitOutcomeStep
            outcome={outcome}
            visitLocked={visitLocked}
            potentialForceMajeure={potentialForceMajeure}
            onOutcomeSelect={(nextOutcome) => {
              setOutcome(nextOutcome);
              setOutcomeExplicitlySelected(true);
            }}
          />
        );
      case 'outcome_details':
        return (
          <FieldVisitOutcomeDetailsStep
            outcome={outcome}
            totalPhotoCount={totalPhotoCount}
            pendingPhotoCount={pendingPhotoCount}
            syncedPhotoCount={photoCount}
            isOnline={isClientOnline}
            requirementsCard={
              <FieldVisitRequirementsCard
                stopRequirements={detail.stop_requirements}
                requiredMeasurements={detail.required_field_measurements}
                model={requirementsModel ?? buildFieldVisitRequirementsModel({
                  visit: detail.visit,
                  outcome,
                  stopRequirements: detail.stop_requirements,
                  requiredMeasurements: detail.required_field_measurements,
                })}
              />
            }
            lastContextCard={<FieldVisitLastContextCard context={detail.previous_visit_context} />}
            qaPrompts={qaPromptsNode}
            safetyActions={safetyActionsNode}
            outcomeContent={
              outcome === 'sample_collected'
                ? renderSampleCollectedContent()
                : outcome === 'no_discharge'
                  ? renderNoDischargeContent()
                  : renderAccessIssueContent()
            }
            notesContent={renderOperationalNotes()}
          />
        );
      case 'evidence':
        return (
          <FieldVisitEvidenceStep
            outcome={outcome}
            totalPhotoCount={totalPhotoCount}
            pendingPhotoCount={pendingPhotoCount}
            syncedPhotoCount={photoCount}
            requiredPrompt={evidenceValidation.ok ? 'Required evidence for this outcome is in place. Add more context if the stop conditions are ambiguous.' : evidenceValidation.message}
            focusPrompts={evidenceFocusPrompts}
            evidenceContent={renderEvidenceContent(evidenceCategories)}
          />
        );
      case 'review_complete':
        return (
          <FieldVisitReviewStep
            summaryCards={reviewSummaryCards}
            completionLocation={reviewCompletionLocation}
            checklist={!visitLocked ? <FieldVisitRequiredChecklist items={completionChecklistItems} /> : null}
            reviewHooks={
              <FieldVisitReviewHooksPanel
                hooks={reviewHooks}
                governanceInboxHref={governanceInboxHref}
                governanceDisabledReason={governanceDisabledReason}
              />
            }
            governanceIssues={governanceIssuesNode}
            lockedBanner={lockedBanner}
            forceMajeureBanner={forceMajeureBanner}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            Field Visit
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {detail.visit.permit_number ?? 'Permit'} / {detail.visit.outfall_number ?? 'Outfall'} scheduled for{' '}
            {new Date(`${detail.visit.scheduled_date}T00:00:00`).toLocaleDateString()}
          </p>
          {outboundQueueDiagnostic || evidenceUploadFailures.length > 0 ? (
            <p className="mt-2">
              <a
                href="#field-sync-health"
                className="inline-flex items-center gap-1.5 rounded-full border border-red-400/35 bg-red-500/12 px-2.5 py-1 text-xs font-medium text-red-100 transition-colors hover:bg-red-500/20"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Sync needs attention — view details
              </a>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/field/dispatch"
            className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary"
          >
            Back to field queue
          </Link>
          {outfallMapsHref ? (
            <a
              href={outfallMapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-500/20"
            >
              <Navigation className="h-4 w-4 shrink-0" aria-hidden />
              Open in Maps
              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>

      {detail.scheduled_parameter_label ? (
        <div
          className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm"
          role="region"
          aria-label="Scheduled sample parameter"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Scheduled parameter</p>
          <p className="mt-1 font-medium text-text-primary">{detail.scheduled_parameter_label}</p>
          <p className="mt-1 text-xs text-text-secondary">
            From the sampling calendar for this stop — use when verifying bottles, preservatives, and chain of custody.
          </p>
        </div>
      ) : null}

      {detail.schedule_instructions ? (
        <div
          className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          role="region"
          aria-label="Schedule instructions"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-200/80">Schedule instructions</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">{detail.schedule_instructions}</p>
        </div>
      ) : null}

      {id ? (
        <FieldDataSyncBar
          loading={fieldQueueLoading || detailLoading}
          lastSyncedAt={lastSyncedAt}
          pendingOutboundCount={outboundPendingCount}
          queueFlushDiagnostic={outboundQueueDiagnostic}
          onDismissQueueFlushDiagnostic={clearOutboundQueueDiagnostic}
          onRefresh={handleFieldSyncRefresh}
          auditRefreshPayload={{ surface: 'field_visit', visit_id: id }}
          evidenceSyncFailures={evidenceUploadFailures}
          onRetryEvidenceSync={() => {
            void handleFieldSyncRefresh().catch((err) => {
              toast.error(err instanceof Error ? err.message : 'Retry failed');
            });
          }}
          onDismissEvidenceFailures={() => {
            clearPersistedFieldEvidenceSyncFailuresForVisit(id);
            setEvidenceUploadFailures([]);
          }}
        />
      ) : null}

      {id ? <FieldDispatchLoadAlerts alerts={dispatchLoadAlerts} /> : null}

      {detail && !detailLoading && detailLoadSource && detailLoadSource !== 'live' ? (
        <FieldDataSourceBanner variant="visit" source={detailLoadSource} />
      ) : null}

      {visitOutboundQueuedCount > 0 ? (
        <div
          className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          role="status"
          aria-live="polite"
        >
          <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" aria-hidden />
          <div>
            <p className="font-medium text-amber-50">
              {visitOutboundQueuedCount} queued action{visitOutboundQueuedCount === 1 ? '' : 's'} for this visit
            </p>
            <p className="mt-1 text-xs text-amber-200/85">
              Saved on this device; uploads when you are online. Use Refresh above to retry the outbound queue.
            </p>
          </div>
        </div>
      ) : null}

      {visitNeedsDisposition(detail.visit) ? (
        <div
          className="flex items-start gap-3 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100"
          role="status"
          aria-live="polite"
        >
          <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" aria-hidden />
          <div>
            <p className="font-medium text-cyan-50">Open visit — disposition required</p>
            <p className="mt-1 text-xs text-cyan-200/85">
              This stop is still assigned or in progress. Work top-to-bottom through the guided steps so the route ends with a clear outcome and a complete record.
            </p>
          </div>
        </div>
      ) : null}

      {requirementsModel ? (
        <FieldVisitShortHoldAlert flags={requirementsModel.urgencyFlags} />
      ) : null}

      {weatherStatusBanner}

      <FieldSameOutfallDayWarning
        groups={visitSiblingOutfallConflicts}
        contextLabel="this visit"
      />

      {detail.visit.linked_sampling_event_id ? (
        <div
          className="flex flex-col gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 sm:flex-row sm:items-center sm:justify-between"
          role="region"
          aria-label="Linked sampling event"
        >
          <div className="flex min-w-0 items-start gap-3">
            <Beaker className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium text-emerald-50">Sampling event (lab linkage)</p>
              <p className="mt-1 text-xs text-emerald-200/85">
                This visit is tied to a sampling_events row. Lab EDD imports and results attach to this ID.
              </p>
              <p className="mt-2 break-all font-mono text-xs text-text-primary">
                {detail.visit.linked_sampling_event_id}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleCopySamplingEventId()}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-emerald-400/35 bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-50 transition-colors hover:bg-emerald-500/25"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            Copy ID
          </button>
        </div>
      ) : null}

      <FieldVisitWizardShell
        stepNumber={FIELD_VISIT_WIZARD_STEPS.findIndex((step) => step.id === activeStep) + 1}
        stepTitle={currentStepMeta.label}
        stepDescription={currentStepMeta.description}
        progress={
          <FieldVisitWizardProgress
            activeStep={activeStep}
            steps={progressSteps}
            onStepSelect={handleWizardStepSelect}
          />
        }
        backAction={previousStep ? {
          label: 'Back',
          onClick: () => goToStep(previousStep),
          disabled: saving,
        } : null}
        primaryAction={visitLocked && activeStep === 'review_complete'
          ? null
          : {
              label: activeStep === 'start_visit' && visitStarted
                ? 'Continue to inspection'
                : FIELD_VISIT_WIZARD_COPY[activeStep].primaryActionLabel,
              onClick: () => {
                void handleWizardAdvance();
              },
              disabled:
                saving ||
                (activeStep === 'review_complete' && !canAttemptComplete) ||
                (activeStep === 'choose_outcome' && !outcomeExplicitlySelected),
              variant: activeStep === 'review_complete' ? 'success' : 'primary',
            }}
        stepMeta={!visitLocked ? (
          <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
            {activeStep === recommendedStep
              ? reviewReady
                ? 'Ready for review'
                : 'Recommended now'
              : `Recommended: ${recommendedStepMeta.label}`}
          </div>
        ) : (
          <div className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
            Visit locked
          </div>
        )}
      >
        {currentStepContent}
      </FieldVisitWizardShell>
    </div>
  );
}
