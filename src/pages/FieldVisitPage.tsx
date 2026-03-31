import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Camera, CheckCircle2, Droplets, MapPin, Package, ShieldAlert, Waves, Wind } from 'lucide-react';
import { toast } from 'sonner';
import { FieldDataSyncBar } from '@/components/field/FieldDataSyncBar';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { EvidenceCaptureUpload } from '@/components/submissions/EvidenceCaptureUpload';
import { SubmissionEvidenceViewer } from '@/components/submissions/SubmissionEvidenceViewer';
import { useFieldOps } from '@/hooks/useFieldOps';
import { describeGovernanceDeadline, type GovernanceDeadlineTone } from '@/lib/governanceDeadlines';
import { FIELD_MEASUREMENT_COC_PRIMARY_CONTAINER } from '@/lib/fieldOpsConstants';
import type { FieldVisitOutcome, GovernanceIssueRecord, OutletInspectionRecord } from '@/types';

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

export function FieldVisitPage() {
  const { id } = useParams<{ id: string }>();

  const {
    detail,
    detailLoading,
    loading: fieldQueueLoading,
    outboundPendingCount,
    loadVisitDetails,
    refresh: refreshFieldQueue,
    startVisit,
    saveInspection,
    addMeasurement,
    saveCocPrimaryContainer,
    recordEvidenceAsset,
    completeVisit,
  } = useFieldOps();

  const [inspection, setInspection] = useState<Partial<OutletInspectionRecord>>({
    flow_status: 'unknown',
    signage_condition: '',
    pipe_condition: '',
    erosion_observed: false,
    obstruction_observed: false,
    obstruction_details: '',
    inspector_notes: '',
  });
  const [measurementName, setMeasurementName] = useState('');
  const [measurementValue, setMeasurementValue] = useState('');
  const [measurementText, setMeasurementText] = useState('');
  const [measurementUnit, setMeasurementUnit] = useState('');
  const [cocContainerId, setCocContainerId] = useState('');
  const [cocPreservativeConfirmed, setCocPreservativeConfirmed] = useState(false);
  const [weatherConditions, setWeatherConditions] = useState('');
  const [fieldNotes, setFieldNotes] = useState('');
  const [outcome, setOutcome] = useState<FieldVisitOutcome>('sample_collected');
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) {
      loadVisitDetails(id).catch((error) => {
        console.error('[FieldVisitPage] Failed to load visit details:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to load field visit');
      });
    }
  }, [id, loadVisitDetails]);

  useEffect(() => {
    if (!detail) return;

    setInspection(detail.inspection ?? {
      flow_status: 'unknown',
      signage_condition: '',
      pipe_condition: '',
      erosion_observed: false,
      obstruction_observed: false,
      obstruction_details: '',
      inspector_notes: '',
    });
    setWeatherConditions(detail.visit.weather_conditions ?? '');
    setFieldNotes(detail.visit.field_notes ?? '');
    setOutcome(detail.visit.outcome ?? 'sample_collected');
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
  }, [detail]);

  const photoCount = useMemo(
    () => detail?.evidence.filter((asset) => asset.evidence_type === 'photo').length ?? 0,
    [detail?.evidence],
  );
  const generalMeasurements = useMemo(
    () =>
      detail?.measurements.filter((m) => m.parameter_name !== FIELD_MEASUREMENT_COC_PRIMARY_CONTAINER) ??
      [],
    [detail?.measurements],
  );
  const visitLocked = detail?.visit.visit_status === 'completed';

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

  async function handleStartVisit() {
    if (!detail) return;
    const latitude = Number(startCoords.latitude);
    const longitude = Number(startCoords.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      toast.error('Start latitude and longitude are required');
      return;
    }

    try {
      setSaving(true);
      const { queued } = await startVisit(detail.visit.id, { latitude, longitude });
      toast.success(
        queued
          ? 'Visit started on this device; will sync when you are back online'
          : 'Visit started',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start visit');
    } finally {
      setSaving(false);
    }
  }

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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save inspection');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMeasurement() {
    if (!detail || visitLocked || !measurementName.trim()) {
      toast.error('Parameter name is required');
      return;
    }

    if (measurementName.trim() === FIELD_MEASUREMENT_COC_PRIMARY_CONTAINER) {
      toast.error('Use the Chain of custody section to record the primary container ID');
      return;
    }

    try {
      setSaving(true);
      const { queued } = await addMeasurement(detail.visit.id, {
        parameterName: measurementName.trim(),
        measuredValue: measurementValue ? Number(measurementValue) : undefined,
        measuredText: measurementText.trim() || undefined,
        unit: measurementUnit.trim() || undefined,
      });
      setMeasurementName('');
      setMeasurementValue('');
      setMeasurementText('');
      setMeasurementUnit('');
      toast.success(
        queued
          ? 'Saved on this device; will upload when you are back online'
          : 'Field measurement added',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add field measurement');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCoc() {
    if (!detail || visitLocked) return;
    if (!cocContainerId.trim()) {
      toast.error('Enter a primary container ID');
      return;
    }
    if (!cocPreservativeConfirmed) {
      toast.error('Confirm bottle / preservative match before saving');
      return;
    }

    try {
      setSaving(true);
      await saveCocPrimaryContainer(detail.visit.id, cocContainerId, cocPreservativeConfirmed);
      toast.success('Chain of custody record saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save chain of custody');
    } finally {
      setSaving(false);
    }
  }

  async function handleCompletion() {
    if (!detail) return;

    const latitude = Number(completeCoords.latitude);
    const longitude = Number(completeCoords.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      toast.error('Completion latitude and longitude are required');
      return;
    }

    if (outcome === 'sample_collected') {
      if (!cocContainerId.trim()) {
        toast.error('Record primary container ID before completing a sample-collected visit');
        return;
      }
      if (!cocPreservativeConfirmed) {
        toast.error('Confirm bottle / preservative match before completing');
        return;
      }
    }

    if (outcome === 'no_discharge' && photoCount < 1) {
      toast.error('At least one photo must be uploaded before completing a no-discharge visit');
      return;
    }

    if (outcome === 'access_issue' && photoCount < 1) {
      toast.error('At least one photo must be uploaded before completing an access issue visit');
      return;
    }

    try {
      setSaving(true);
      if (outcome === 'sample_collected') {
        await saveCocPrimaryContainer(detail.visit.id, cocContainerId, cocPreservativeConfirmed);
      }
      const result = await completeVisit(detail.visit, {
        outcome,
        completedCoords: { latitude, longitude },
        weatherConditions,
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
        result.governance_issue_id
          ? 'Visit completed and governance issue created'
          : 'Visit completed',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to complete visit');
    } finally {
      setSaving(false);
    }
  }

  if (detailLoading || !detail) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
      </div>
    );
  }

  const orgScopedPrefix = `${detail.visit.organization_id}/field-visits/`;

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
        </div>
        <Link
          to="/field/dispatch"
          className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary"
        >
          Back to field queue
        </Link>
      </div>

      {id && (
        <FieldDataSyncBar
          loading={fieldQueueLoading || detailLoading}
          pendingOutboundCount={outboundPendingCount}
          onRefresh={async () => {
            await Promise.all([refreshFieldQueue(), loadVisitDetails(id)]);
          }}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <SpotlightCard className="p-6">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Visit Control
              </h2>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-medium text-text-muted">Start latitude</span>
                <input
                  value={startCoords.latitude}
                  onChange={(e) => setStartCoords((prev) => ({ ...prev, latitude: e.target.value }))}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium text-text-muted">Start longitude</span>
                <input
                  value={startCoords.longitude}
                  onChange={(e) => setStartCoords((prev) => ({ ...prev, longitude: e.target.value }))}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={handleCaptureStartCoords}
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary"
              >
                Capture browser GPS
              </button>
            {detail.visit.visit_status === 'assigned' && !visitLocked && (
                <button
                  onClick={handleStartVisit}
                  disabled={saving}
                  className="rounded-xl bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-500/25 disabled:opacity-60"
                >
                  Start visit
                </button>
              )}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-medium text-text-muted">Completion latitude</span>
                <input
                  value={completeCoords.latitude}
                  onChange={(e) => setCompleteCoords((prev) => ({ ...prev, latitude: e.target.value }))}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium text-text-muted">Completion longitude</span>
                <input
                  value={completeCoords.longitude}
                  onChange={(e) => setCompleteCoords((prev) => ({ ...prev, longitude: e.target.value }))}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
                />
              </label>
            </div>

            <div className="mt-4">
              <button
                onClick={handleCaptureCompleteCoords}
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary"
              >
                Capture completion GPS
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-medium text-text-muted">Weather conditions</span>
                <input
                  value={weatherConditions}
                  onChange={(e) => setWeatherConditions(e.target.value)}
                  disabled={visitLocked}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium text-text-muted">Visit outcome</span>
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as FieldVisitOutcome)}
                  disabled={visitLocked}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
                >
                  <option value="sample_collected">Sample collected</option>
                  <option value="no_discharge">No discharge</option>
                  <option value="access_issue">Access issue</option>
                </select>
              </label>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="text-xs font-medium text-text-muted">Field notes</span>
              <textarea
                value={fieldNotes}
                onChange={(e) => setFieldNotes(e.target.value)}
                rows={4}
                disabled={visitLocked}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
              />
            </label>

            <div className="mt-4 flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-300" />
              <div className="flex-1">
                <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
                  <input
                    type="checkbox"
                    checked={potentialForceMajeure}
                    onChange={(e) => setPotentialForceMajeure(e.target.checked)}
                    disabled={visitLocked}
                  />
                  Potential force majeure candidate
                </label>
                <textarea
                  value={potentialForceMajeureNotes}
                  onChange={(e) => setPotentialForceMajeureNotes(e.target.value)}
                  rows={3}
                  disabled={visitLocked}
                  placeholder="Why this may trigger decree notice timing."
                  className="mt-3 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
                />
              </div>
            </div>
          </SpotlightCard>

          <SpotlightCard className="p-6">
            <div className="flex items-center gap-2">
              <Waves className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Outlet Inspection
              </h2>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-medium text-text-muted">Flow status</span>
                <select
                  value={inspection.flow_status ?? 'unknown'}
                  onChange={(e) => setInspection((prev) => ({ ...prev, flow_status: e.target.value as OutletInspectionRecord['flow_status'] }))}
                  disabled={visitLocked}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
                >
                  <option value="unknown">Unknown</option>
                  <option value="flowing">Flowing</option>
                  <option value="no_flow">No flow</option>
                  <option value="obstructed">Obstructed</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium text-text-muted">Signage condition</span>
                <input
                  value={inspection.signage_condition ?? ''}
                  onChange={(e) => setInspection((prev) => ({ ...prev, signage_condition: e.target.value }))}
                  disabled={visitLocked}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium text-text-muted">Pipe condition</span>
                <input
                  value={inspection.pipe_condition ?? ''}
                  onChange={(e) => setInspection((prev) => ({ ...prev, pipe_condition: e.target.value }))}
                  disabled={visitLocked}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium text-text-muted">Obstruction details</span>
                <input
                  value={inspection.obstruction_details ?? ''}
                  onChange={(e) => setInspection((prev) => ({ ...prev, obstruction_details: e.target.value }))}
                  disabled={visitLocked}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-sm text-text-secondary">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={inspection.erosion_observed ?? false}
                  onChange={(e) => setInspection((prev) => ({ ...prev, erosion_observed: e.target.checked }))}
                  disabled={visitLocked}
                />
                Erosion observed
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={inspection.obstruction_observed ?? false}
                  onChange={(e) => setInspection((prev) => ({ ...prev, obstruction_observed: e.target.checked }))}
                  disabled={visitLocked}
                />
                Obstruction observed
              </label>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="text-xs font-medium text-text-muted">Inspection notes</span>
              <textarea
                value={inspection.inspector_notes ?? ''}
                onChange={(e) => setInspection((prev) => ({ ...prev, inspector_notes: e.target.value }))}
                rows={3}
                disabled={visitLocked}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
              />
            </label>

            <button
              onClick={handleSaveInspection}
              disabled={saving || visitLocked}
              className="mt-4 rounded-xl bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-white/[0.1] disabled:opacity-60"
            >
              {visitLocked ? 'Inspection locked' : 'Save inspection'}
            </button>
          </SpotlightCard>

          {(outcome === 'sample_collected' || detail.visit.outcome === 'sample_collected') && (
            <SpotlightCard className="p-6">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-cyan-300" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                  Chain of custody (collection)
                </h2>
              </div>
              <p className="mt-2 text-sm text-text-secondary">
                Primary container ID and preservative confirmation are required before you can complete a
                sample-collected visit. Stored as a field measurement for audit.
              </p>

              <label className="mt-4 block space-y-2">
                <span className="text-xs font-medium text-text-muted">Primary container ID</span>
                <input
                  value={cocContainerId}
                  onChange={(e) => setCocContainerId(e.target.value)}
                  disabled={visitLocked}
                  placeholder="e.g. bottle label / cooler slot ID"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
                />
              </label>

              <label className="mt-4 inline-flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={cocPreservativeConfirmed}
                  onChange={(e) => setCocPreservativeConfirmed(e.target.checked)}
                  disabled={visitLocked}
                />
                Bottle and preservative match the parameters scheduled for this sample
              </label>

              {!visitLocked && (
                <button
                  type="button"
                  onClick={handleSaveCoc}
                  disabled={saving}
                  className="mt-4 rounded-xl bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-white/[0.1] disabled:opacity-60"
                >
                  Save chain of custody
                </button>
              )}
            </SpotlightCard>
          )}

          <SpotlightCard className="p-6">
            <div className="flex items-center gap-2">
              <Droplets className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Field Measurements
              </h2>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <input
              value={measurementName}
              onChange={(e) => setMeasurementName(e.target.value)}
              placeholder="Parameter"
              disabled={visitLocked}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
            />
              <input
              value={measurementValue}
              onChange={(e) => setMeasurementValue(e.target.value)}
              placeholder="Numeric value"
              disabled={visitLocked}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
            />
              <input
              value={measurementText}
              onChange={(e) => setMeasurementText(e.target.value)}
              placeholder="Text value"
              disabled={visitLocked}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
            />
              <input
              value={measurementUnit}
              onChange={(e) => setMeasurementUnit(e.target.value)}
              placeholder="Unit"
              disabled={visitLocked}
              className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-text-primary outline-none"
            />
            </div>

            <button
              onClick={handleAddMeasurement}
              disabled={saving || visitLocked}
              className="mt-4 rounded-xl bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-white/[0.1] disabled:opacity-60"
            >
              {visitLocked ? 'Measurements locked' : 'Add measurement'}
            </button>

            <div className="mt-4 space-y-2">
              {generalMeasurements.map((measurement) => (
                <div key={measurement.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm">
                  <div className="font-medium text-text-primary">{measurement.parameter_name}</div>
                  <div className="mt-1 text-text-secondary">
                    {measurement.measured_value ?? measurement.measured_text ?? '—'} {measurement.unit ?? ''}
                  </div>
                </div>
              ))}
            </div>
          </SpotlightCard>
        </div>

        <div className="space-y-6">
          <SpotlightCard className="p-6">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Evidence
              </h2>
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-text-secondary">
              {photoCount} photo evidence item{photoCount === 1 ? '' : 's'} attached
            </div>

            <div className="mt-4">
              <EvidenceCaptureUpload
                submissionType="field_visit"
                referenceId={detail.visit.id}
                bucket="field-inspections"
                pathPrefix={orgScopedPrefix}
                disabled={visitLocked}
                onUploaded={(path) => {
                  const ext = path.split('.').pop()?.toLowerCase() ?? '';
                  const evidenceType = ['png', 'jpg', 'jpeg', 'heic', 'webp'].includes(ext) ? 'photo' : 'document';
                  recordEvidenceAsset({
                    fieldVisitId: detail.visit.id,
                    storagePath: path,
                    bucket: 'field-inspections',
                    evidenceType,
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

            <div className="mt-4">
              <SubmissionEvidenceViewer
                bucket="field-inspections"
                paths={detail.evidence.map((asset) => asset.storage_path)}
              />
            </div>
          </SpotlightCard>

          {outcome === 'no_discharge' && (
            <SpotlightCard className="p-6">
              <div className="flex items-center gap-2">
                <Wind className="h-4 w-4 text-amber-300" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                  No-Discharge Documentation
                </h2>
              </div>

              <label className="mt-4 block space-y-2">
                <span className="text-xs font-medium text-text-muted">Narrative</span>
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
                <span className="text-xs font-medium text-text-muted">Observed condition</span>
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
                <span className="text-xs font-medium text-text-muted">Obstruction details</span>
                <textarea
                  value={noDischargeObstructionDetails}
                  onChange={(e) => setNoDischargeObstructionDetails(e.target.value)}
                  rows={3}
                  disabled={visitLocked}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-text-primary outline-none"
                />
              </label>
            </SpotlightCard>
          )}

          {outcome === 'access_issue' && (
            <SpotlightCard className="p-6">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-300" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                  Access Issue Escalation
                </h2>
              </div>

              <label className="mt-4 block space-y-2">
                <span className="text-xs font-medium text-text-muted">Issue type</span>
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
                <span className="text-xs font-medium text-text-muted">Obstruction narrative</span>
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
            </SpotlightCard>
          )}

          <SpotlightCard className="p-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Completion Gate
              </h2>
            </div>

            <div className="mt-4 space-y-2 text-sm text-text-secondary">
              <p>Outcome: <span className="font-medium text-text-primary">{outcome.replace('_', ' ')}</span></p>
              <p>Photo evidence count: <span className="font-medium text-text-primary">{photoCount}</span></p>
              <p>Linked governance issues: <span className="font-medium text-text-primary">{detail.governanceIssues.length}</span></p>
              {detail.visit.potential_force_majeure && (
                <p className="text-amber-200/90">
                  Potential force majeure was flagged on this visit. Notice and written targets below are set from completion time (see governance inbox for the official queue).
                </p>
              )}
            </div>

            {detail.governanceIssues.length > 0 && (
              <div className="mt-4 space-y-3">
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
                        {isFm && (
                          <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-200">
                            FM candidate
                          </span>
                        )}
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
                <div className="text-sm text-text-secondary">
                  <Link to="/governance/issues" className="text-cyan-300 hover:text-cyan-200">
                    Open governance inbox
                  </Link>
                </div>
              </div>
            )}

            {visitLocked && (
              <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                This visit record is complete and locked from further field edits.
              </div>
            )}

            <button
              onClick={handleCompletion}
              disabled={saving || visitLocked}
              className="mt-5 w-full rounded-xl bg-emerald-500/15 px-4 py-3 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:opacity-60"
            >
              {visitLocked ? 'Visit already completed' : 'Complete visit'}
            </button>
          </SpotlightCard>
        </div>
      </div>
    </div>
  );
}
