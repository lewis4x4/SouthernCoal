import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldVisitPage } from '@/pages/FieldVisitPage';
import { listFieldEvidenceDrafts } from '@/lib/fieldEvidenceDrafts';
import { serializePhotoEvidenceCategory } from '@/lib/photoEvidenceBuckets';
import type { FieldVisitDetails } from '@/types';

const useFieldOpsMock = vi.fn();
const groupSameOutfallSameDayMock = vi.fn((..._args: any[]) => [] as any[]);
const siblingVisitsSameOutfallSameDayMock = vi.fn((..._args: any[]) => [] as any[]);
const fetchOpenMeteoCurrentSnapshotMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  },
}));

vi.mock('@/hooks/useFieldOps', () => ({
  useFieldOps: () => useFieldOpsMock(),
}));

vi.mock('@/components/field/FieldDataSyncBar', () => ({
  FieldDataSyncBar: () => <div>FieldDataSyncBar</div>,
}));

vi.mock('@/components/field/FieldDispatchLoadAlerts', () => ({
  FieldDispatchLoadAlerts: () => null,
}));

vi.mock('@/components/field/FieldSameOutfallDayWarning', () => ({
  FieldSameOutfallDayWarning: () => null,
}));

vi.mock('@/components/ui/SpotlightCard', () => ({
  SpotlightCard: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

vi.mock('@/components/submissions/EvidenceCaptureUpload', () => ({
  EvidenceCaptureUpload: () => <div>EvidenceCaptureUpload</div>,
}));

vi.mock('@/components/submissions/SubmissionEvidenceViewer', () => ({
  SubmissionEvidenceViewer: () => <div>SubmissionEvidenceViewer</div>,
}));

vi.mock('@/lib/fieldEvidenceDrafts', () => ({
  clearPersistedFieldEvidenceSyncFailuresForVisit: vi.fn(),
  listFieldEvidenceDrafts: vi.fn().mockResolvedValue([]),
  readPersistedFieldEvidenceSyncFailuresForVisit: vi.fn(() => []),
  saveFieldEvidenceDraft: vi.fn(),
}));

vi.mock('@/lib/governanceDeadlines', () => ({
  describeGovernanceDeadline: vi.fn(() => ({ text: 'No deadline', tone: 'none' })),
}));

vi.mock('@/lib/fieldMapsNav', () => ({
  mapsSearchQueryUrl: () => '',
  mapsSearchUrl: () => '',
}));

vi.mock('@/lib/fieldOutboundQueue', () => ({
  countOutboundQueueOpsForVisit: () => 0,
}));

vi.mock('@/lib/fieldSameOutfallDay', () => ({
  groupSameOutfallSameDay: (...args: any[]) => groupSameOutfallSameDayMock(...args),
  siblingVisitsSameOutfallSameDay: (...args: any[]) => siblingVisitsSameOutfallSameDayMock(...args),
}));

vi.mock('@/lib/fieldVisitDisposition', () => ({
  visitNeedsDisposition: () => false,
}));

vi.mock('@/lib/weatherAtVisitStart', () => ({
  fetchOpenMeteoCurrentSnapshot: (...args: unknown[]) => fetchOpenMeteoCurrentSnapshotMock(...args),
  formatWeatherForPersistence: (observed: string) => observed,
  isWeatherFetchEnabled: () => true,
  observedWeatherFromPersisted: (value: string) => value,
}));

function buildDetail(overrides: Partial<FieldVisitDetails> = {}): FieldVisitDetails {
  return {
    visit: {
      id: 'visit-1',
      organization_id: 'org-1',
      permit_id: 'permit-1',
      outfall_id: 'outfall-1',
      assigned_to: 'user-1',
      assigned_by: 'user-2',
      scheduled_date: '2026-04-01',
      visit_status: 'assigned',
      outcome: null,
      started_at: null,
      completed_at: null,
      started_latitude: null,
      started_longitude: null,
      completed_latitude: null,
      completed_longitude: null,
      weather_conditions: null,
      field_notes: null,
      potential_force_majeure: false,
      potential_force_majeure_notes: null,
      linked_sampling_event_id: null,
      sampling_calendar_id: null,
      route_batch_id: null,
      created_at: '2026-04-01T12:00:00Z',
      updated_at: '2026-04-01T12:00:00Z',
      permit_number: 'WV1234567',
      outfall_number: '001',
      assigned_to_name: 'Field User',
      route_stop_sequence: 1,
      outfall_latitude: null,
      outfall_longitude: null,
      scheduled_parameter_label: null,
      schedule_instructions: null,
      route_priority_reason: null,
      ...(overrides.visit ?? {}),
    },
    inspection: overrides.inspection ?? null,
    measurements: overrides.measurements ?? [],
    evidence: overrides.evidence ?? [],
    noDischarge: overrides.noDischarge ?? null,
    accessIssue: overrides.accessIssue ?? null,
    governanceIssues: overrides.governanceIssues ?? [],
    scheduled_parameter_label: overrides.scheduled_parameter_label ?? null,
    schedule_instructions: overrides.schedule_instructions ?? null,
    stop_requirements: overrides.stop_requirements ?? [],
    required_field_measurements: overrides.required_field_measurements ?? [],
    previous_visit_context: overrides.previous_visit_context ?? null,
  };
}

type FieldVisitDetailOverrides =
  Omit<Partial<FieldVisitDetails>, 'visit' | 'inspection'> & {
    visit?: Partial<FieldVisitDetails['visit']>;
    inspection?: FieldVisitDetails['inspection'];
  };

function buildInspection(): NonNullable<FieldVisitDetails['inspection']> {
  return {
    id: 'inspection-1',
    field_visit_id: 'visit-1',
    flow_status: 'flowing',
    signage_condition: 'Readable',
    pipe_condition: 'Clear',
    erosion_observed: false,
    obstruction_observed: false,
    obstruction_details: null,
    inspector_notes: 'No visible issues.',
    created_at: '2026-04-01T12:00:00Z',
    updated_at: '2026-04-01T12:00:00Z',
    created_by: 'user-1',
  };
}

function buildStartedDetail(overrides: FieldVisitDetailOverrides = {}) {
  const base = buildDetail();
  const { visit: visitOverrides, inspection: inspectionOverride, ...restOverrides } = overrides;
  return buildDetail({
    visit: {
      ...base.visit,
      visit_status: 'in_progress',
      started_at: '2026-04-01T12:00:00Z',
      started_latitude: 38.1,
      started_longitude: -81.2,
      ...(visitOverrides ?? {}),
    },
    inspection: inspectionOverride ?? buildInspection(),
    ...restOverrides,
  });
}

function renderPage(detail?: FieldVisitDetails, hookOverrides: Record<string, unknown> = {}) {
  useFieldOpsMock.mockReturnValue({
    detail: detail ?? null,
    detailLoading: false,
    detailLoadSource: detail ? ('live' as const) : null,
    loading: false,
    lastSyncedAt: null,
    outboundPendingCount: 0,
    outboundQueueDiagnostic: null,
    clearOutboundQueueDiagnostic: vi.fn(),
    dispatchLoadAlerts: [],
    visits: [],
    loadVisitDetails: vi.fn().mockResolvedValue(detail ?? null),
    refreshOutboundPendingCount: vi.fn(),
    refresh: vi.fn().mockResolvedValue({ success: false }),
    startVisit: vi.fn().mockResolvedValue({ queued: false }),
    saveInspection: vi.fn().mockResolvedValue({ queued: false }),
    addMeasurement: vi.fn().mockResolvedValue({ queued: false }),
    saveCocPrimaryContainer: vi.fn().mockResolvedValue({ queued: false }),
    recordEvidenceAsset: vi.fn(),
    completeVisit: vi.fn().mockResolvedValue({ queued: false, result: { governance_issue_id: null } }),
    ...hookOverrides,
  });

  return render(
    <MemoryRouter
      initialEntries={['/field/visits/visit-1']}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="/field/visits/:id" element={<FieldVisitPage />} />
        <Route path="/field/dispatch" element={<div>Field queue</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForWizard() {
  await waitFor(() => {
    expect(screen.getByRole('navigation', { name: 'Field visit wizard progress' })).toBeInTheDocument();
  });
}

async function waitForStepHeading(name: RegExp | string) {
  await waitFor(() => {
    expect(screen.getByRole('heading', { name })).toBeInTheDocument();
  });
}

function getWizardButton(label: RegExp | string) {
  return within(screen.getByRole('navigation', { name: 'Field visit wizard progress' })).getByRole('button', {
    name: label,
  });
}

describe('FieldVisitPage wizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
    fetchOpenMeteoCurrentSnapshotMock.mockResolvedValue({
      summary: 'Overcast · 54°F',
      fetchedAtIso: '2026-04-01T12:00:00.000Z',
    });
    groupSameOutfallSameDayMock.mockReturnValue([]);
    siblingVisitsSameOutfallSameDayMock.mockReturnValue([]);
    vi.mocked(listFieldEvidenceDrafts).mockResolvedValue([]);
    useFieldOpsMock.mockReturnValue({
      detail: null,
      detailLoading: false,
      detailLoadSource: null,
      loading: false,
      lastSyncedAt: null,
      outboundPendingCount: 0,
      outboundQueueDiagnostic: null,
      clearOutboundQueueDiagnostic: vi.fn(),
      dispatchLoadAlerts: [],
      visits: [],
      loadVisitDetails: vi.fn().mockResolvedValue(null),
      refreshOutboundPendingCount: vi.fn(),
      refresh: vi.fn().mockResolvedValue({ success: false }),
      startVisit: vi.fn(),
      saveInspection: vi.fn(),
      addMeasurement: vi.fn(),
      saveCocPrimaryContainer: vi.fn(),
      recordEvidenceAsset: vi.fn(),
      completeVisit: vi.fn(),
    });
  });

  it('keeps the loading spinner visible while detail is still loading', async () => {
    vi.mocked(listFieldEvidenceDrafts).mockImplementationOnce(
      () => new Promise(() => {}),
    );
    const loadVisitDetails = vi.fn(() => new Promise(() => {}));
    useFieldOpsMock.mockReturnValue({
      detail: null,
      detailLoading: true,
      detailLoadSource: null,
      loading: false,
      lastSyncedAt: null,
      outboundPendingCount: 0,
      outboundQueueDiagnostic: null,
      clearOutboundQueueDiagnostic: vi.fn(),
      dispatchLoadAlerts: [],
      visits: [],
      loadVisitDetails,
      refreshOutboundPendingCount: vi.fn(),
      refresh: vi.fn().mockResolvedValue({ success: false }),
      startVisit: vi.fn(),
      saveInspection: vi.fn(),
      addMeasurement: vi.fn(),
      saveCocPrimaryContainer: vi.fn(),
      recordEvidenceAsset: vi.fn(),
      completeVisit: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/field/visits/visit-1']}>
        <Routes>
          <Route path="/field/visits/:id" element={<FieldVisitPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(loadVisitDetails).toHaveBeenCalled();
    });
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.queryByText('Field visit unavailable')).not.toBeInTheDocument();
  });

  it('does not crash when a field visit rerenders from loading into the wizard', async () => {
    const loadedDetail = buildStartedDetail({
      visit: {
        id: 'f00000c1-0001-4001-8001-000000000001',
        outcome: 'sample_collected',
      },
    });
    const loadVisitDetails = vi.fn().mockResolvedValue(loadedDetail);
    let hookState = {
      detail: null as FieldVisitDetails | null,
      detailLoading: true,
      detailLoadSource: null as 'live' | 'cache' | 'route_shell' | null,
      loading: false,
      lastSyncedAt: null,
      outboundPendingCount: 0,
      outboundQueueDiagnostic: null,
      clearOutboundQueueDiagnostic: vi.fn(),
      dispatchLoadAlerts: [],
      visits: [],
      loadVisitDetails,
      refreshOutboundPendingCount: vi.fn(),
      refresh: vi.fn().mockResolvedValue({ success: false }),
      startVisit: vi.fn().mockResolvedValue({ queued: false }),
      saveInspection: vi.fn().mockResolvedValue({ queued: false }),
      addMeasurement: vi.fn().mockResolvedValue({ queued: false }),
      saveCocPrimaryContainer: vi.fn().mockResolvedValue({ queued: false }),
      recordEvidenceAsset: vi.fn(),
      completeVisit: vi.fn().mockResolvedValue({ queued: false, result: { governance_issue_id: null } }),
    };
    useFieldOpsMock.mockImplementation(() => hookState);

    const view = render(
      <MemoryRouter initialEntries={['/field/visits/f00000c1-0001-4001-8001-000000000001']}>
        <Routes>
          <Route path="/field/visits/:id" element={<FieldVisitPage />} />
          <Route path="/field/dispatch" element={<div>Field queue</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(loadVisitDetails).toHaveBeenCalledWith('f00000c1-0001-4001-8001-000000000001');
    });
    expect(view.container.querySelector('.animate-spin')).not.toBeNull();

    hookState = {
      ...hookState,
      detail: loadedDetail,
      detailLoading: false,
      detailLoadSource: 'live',
    };

    view.rerender(
      <MemoryRouter initialEntries={['/field/visits/f00000c1-0001-4001-8001-000000000001']}>
        <Routes>
          <Route path="/field/visits/:id" element={<FieldVisitPage />} />
          <Route path="/field/dispatch" element={<div>Field queue</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitForWizard();
    expect(screen.getByRole('heading', { name: 'Outcome Details' })).toBeInTheDocument();
    expect(screen.getByText('Guided custody lane')).toBeInTheDocument();
  });

  it('shows a recoverable unavailable state after a hard visit-load miss', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Field visit unavailable')).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: 'Back to field queue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry visit load' })).toBeInTheDocument();
  });

  it('renders the six wizard steps and starts in the start-visit step', async () => {
    renderPage(buildDetail());

    await waitForWizard();

    const progress = screen.getByRole('navigation', { name: 'Field visit wizard progress' });
    expect(within(progress).getByText('Start Visit')).toBeInTheDocument();
    expect(within(progress).getByText('Outlet Inspection')).toBeInTheDocument();
    expect(within(progress).getByText('Choose Outcome')).toBeInTheDocument();
    expect(within(progress).getByText('Outcome Details')).toBeInTheDocument();
    expect(within(progress).getByText('Evidence')).toBeInTheDocument();
    expect(within(progress).getByText('Review & Complete')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Start Visit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start visit & continue' })).toBeInTheDocument();
  });

  it('blocks jumping ahead when prerequisite wizard steps are incomplete', async () => {
    const user = userEvent.setup();
    renderPage(buildDetail());

    await waitForWizard();

    await user.click(getWizardButton(/Review & Complete/i));

    expect(getWizardButton(/Start Visit/i)).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('heading', { name: 'Start Visit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start visit & continue' })).toBeInTheDocument();
  });

  it('renders the sample-collected outcome details path with custody and field-only measurements', async () => {
    renderPage(buildStartedDetail({
      visit: {
        outcome: 'sample_collected',
      },
      stop_requirements: [
        {
          calendar_id: 'cal-1',
          schedule_id: 'sched-1',
          parameter_id: 'param-1',
          parameter_name: 'pH',
          parameter_short_name: 'pH',
          parameter_label: 'pH',
          category: 'physical',
          default_unit: 's.u.',
          sample_type: 'grab',
          schedule_instructions: 'Collect pH in the field before custody closeout.',
        },
      ],
      required_field_measurements: [
        {
          key: 'ph',
          parameter_name: 'pH',
          display_label: 'pH',
          default_unit: 's.u.',
          rationale: 'Capture pH on site when required by the stop.',
          source_parameter_names: ['pH'],
        },
      ],
    }));

    await waitForWizard();
    await waitForStepHeading('Outcome Details');

    expect(screen.getByText('Guided custody lane')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scan container/i })).toBeInTheDocument();
    expect(screen.getByText('On-Site Field Measurements')).toBeInTheDocument();
    expect(screen.getByText(/on-site meter readings only/i)).toBeInTheDocument();
  });

  it('opens the seeded fake WV UAT visit ids without a hook-order crash', async () => {
    const cases: Array<{
      detail: FieldVisitDetails;
      expectedText: RegExp | string;
    }> = [
      {
        detail: buildStartedDetail({
          visit: {
            id: 'f00000c1-0001-4001-8001-000000000001',
            outcome: 'sample_collected',
          },
        }),
        expectedText: 'Guided custody lane',
      },
      {
        detail: buildStartedDetail({
          visit: {
            id: 'f00000c2-0002-4002-8002-000000000002',
            outcome: 'no_discharge',
          },
        }),
        expectedText: 'No-discharge record',
      },
      {
        detail: buildStartedDetail({
          visit: {
            id: 'f00000c3-0003-4003-8003-000000000003',
            outcome: 'access_issue',
          },
        }),
        expectedText: 'Access issue escalation',
      },
    ];

    for (const testCase of cases) {
      const view = renderPage(testCase.detail);
      await waitForWizard();
      await waitForStepHeading('Outcome Details');
      expect(screen.getAllByText(testCase.expectedText).length).toBeGreaterThan(0);
      view.unmount();
    }
  });

  it('renders no-discharge and access-issue outcome paths without losing the wizard flow', async () => {
    const user = userEvent.setup();
    renderPage(buildStartedDetail());

    await waitForWizard();
    await waitForStepHeading('Choose Outcome');

    await user.click(screen.getByRole('button', { name: /^No discharge/i }));
    await user.click(screen.getByRole('button', { name: 'Continue to outcome details' }));
    await waitForStepHeading('Outcome Details');
    expect(screen.getByText('No-discharge record')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitForStepHeading('Choose Outcome');
    await user.click(screen.getByRole('button', { name: /^Access issue/i }));
    await user.click(screen.getByRole('button', { name: 'Continue to outcome details' }));
    await waitForStepHeading('Outcome Details');
    expect(screen.getAllByText('Access issue escalation').length).toBeGreaterThan(0);
  });

  it('preserves draft state across back and next navigation', async () => {
    const user = userEvent.setup();
    renderPage(buildStartedDetail({
      visit: {
        outcome: 'no_discharge',
      },
    }));

    await waitForWizard();
    await waitForStepHeading('Outcome Details');

    const narrative = screen.getByRole('textbox', { name: /Narrative/i });
    await user.type(narrative, 'Observed no discharge at the actual sampling point.');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitForStepHeading('Choose Outcome');
    expect(screen.getByRole('heading', { name: 'Choose Outcome' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue to outcome details' }));
    await waitForStepHeading('Outcome Details');
    expect(screen.getByRole('textbox', { name: /Narrative/i })).toHaveValue(
      'Observed no discharge at the actual sampling point.',
    );
  });

  it('limits the evidence step to outcome-relevant buckets and keeps offline drafts visible', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    vi.mocked(listFieldEvidenceDrafts).mockResolvedValue([
      {
        id: 'draft-1',
        fieldVisitId: 'visit-1',
        bucket: 'field-inspections',
        pathPrefix: 'org-1/field-visits/',
        fileName: 'dry-channel.jpg',
        fileType: 'image/jpeg',
        evidenceType: 'photo',
        notes: serializePhotoEvidenceCategory('flow_no_flow'),
        createdAt: '2026-04-01T12:00:00Z',
      } as any,
    ]);

    renderPage(buildStartedDetail({
      visit: {
        outcome: 'no_discharge',
      },
      noDischarge: {
        id: 'nd-1',
        field_visit_id: 'visit-1',
        narrative: 'No discharge observed at time of visit.',
        observed_condition: 'Dry channel',
        obstruction_observed: false,
        obstruction_details: null,
        created_at: '2026-04-01T12:00:00Z',
        updated_at: '2026-04-01T12:00:00Z',
        created_by: 'user-1',
      } as NonNullable<FieldVisitDetails['noDischarge']>,
    }));

    await waitForWizard();
    await waitForStepHeading('Outcome Details');
    await user.click(getWizardButton(/Evidence/i));
    await waitForStepHeading('Evidence');

    expect(screen.getByText('Photo evidence buckets')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Flow \/ no-flow/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Outlet \/ signage/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sample containers/i })).not.toBeInTheDocument();
    expect(screen.getByText(/dry-channel\.jpg/i)).toBeInTheDocument();
    expect(screen.getByText(/photo pending sync/i)).toBeInTheDocument();
  });

  it('surfaces QA prompts in the outcome-details step for duplicate and special handling context', async () => {
    const user = userEvent.setup();
    const detail = buildStartedDetail({
      visit: {
        outcome: 'sample_collected',
        route_priority_reason: 'Duplicate route verification for QA handling.',
      },
      stop_requirements: [
        {
          calendar_id: 'cal-1',
          schedule_id: 'sched-1',
          parameter_id: 'param-1',
          parameter_name: 'TSS',
          parameter_short_name: 'TSS',
          parameter_label: 'TSS',
          category: 'chemical',
          default_unit: 'mg/L',
          sample_type: 'grab',
          schedule_instructions: 'Collect duplicate split sample for QA and verify bottle labels.',
        },
      ],
    });
    const siblingVisit = {
      ...detail.visit,
      id: 'visit-2',
      visit_status: 'in_progress' as const,
    };
    siblingVisitsSameOutfallSameDayMock.mockReturnValue([siblingVisit]);
    groupSameOutfallSameDayMock.mockReturnValue([
      {
        outfall_id: detail.visit.outfall_id,
        scheduled_date: detail.visit.scheduled_date,
        visits: [detail.visit, siblingVisit],
      },
    ]);

    renderPage(detail);

    await waitForWizard();
    await waitForStepHeading('Outcome Details');

    expect(screen.getByText('QA prompts')).toBeInTheDocument();
    expect(screen.getByText('Possible duplicate stop')).toBeInTheDocument();
    expect(screen.getByText('Special collection handling')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Append QA note' })[0]!);
    expect(screen.getByDisplayValue(/QA prompt: same-day duplicate visit exists/i)).toBeInTheDocument();
  });

  it('shows a review-ready final step when required data is already in place', async () => {
    renderPage(buildStartedDetail({
      visit: {
        outcome: 'no_discharge',
        completed_latitude: 38.15,
        completed_longitude: -81.25,
      },
      noDischarge: {
        id: 'nd-1',
        field_visit_id: 'visit-1',
        narrative: 'No discharge observed at time of visit.',
        observed_condition: 'Dry channel',
        obstruction_observed: false,
        obstruction_details: null,
        created_at: '2026-04-01T12:00:00Z',
        updated_at: '2026-04-01T12:00:00Z',
        created_by: 'user-1',
      } as NonNullable<FieldVisitDetails['noDischarge']>,
      evidence: [
        {
          id: 'evidence-1',
          field_visit_id: 'visit-1',
          evidence_type: 'photo',
          bucket_name: 'field-inspections',
          storage_path: 'field-visits/flow.jpg',
          latitude: null,
          longitude: null,
          recorded_at: '2026-04-01T12:00:00Z',
          recorded_by: 'user-1',
          notes: serializePhotoEvidenceCategory('flow_no_flow'),
          created_at: '2026-04-01T12:00:00Z',
        },
        {
          id: 'evidence-2',
          field_visit_id: 'visit-1',
          evidence_type: 'photo',
          bucket_name: 'field-inspections',
          storage_path: 'field-visits/outlet.jpg',
          latitude: null,
          longitude: null,
          recorded_at: '2026-04-01T12:00:00Z',
          recorded_by: 'user-1',
          notes: serializePhotoEvidenceCategory('outlet_signage'),
          created_at: '2026-04-01T12:00:00Z',
        },
      ] as any,
    }));

    await waitForWizard();
    await waitForStepHeading('Review & Complete');

    expect(screen.getByText('Completion Readiness')).toBeInTheDocument();
    expect(screen.getByText('Everything required for this outcome is in place.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete visit' })).toBeEnabled();
  });
});
