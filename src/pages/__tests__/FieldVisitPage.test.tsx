import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldVisitPage } from '@/pages/FieldVisitPage';
import { listFieldEvidenceDrafts } from '@/lib/fieldEvidenceDrafts';
import { serializePhotoEvidenceCategory } from '@/lib/photoEvidenceBuckets';
import type { FieldEvidenceDraft } from '@/lib/fieldEvidenceDrafts';
import type { FieldEvidenceAssetRecord, FieldVisitDetails, OutletInspectionRecord } from '@/types';
import { toast } from 'sonner';

const useFieldOpsMock = vi.fn();
const getEffectiveRoleMock = vi.fn(() => 'field_sampler');
const groupSameOutfallSameDayMock = vi.fn((...args: unknown[]) => {
  void args;
  return [] as unknown[];
});
const siblingVisitsSameOutfallSameDayMock = vi.fn((...args: unknown[]) => {
  void args;
  return [] as FieldVisitDetails['visit'][];
});
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

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    getEffectiveRole: getEffectiveRoleMock,
  }),
}));

vi.mock('@/hooks/useAuditLog', () => ({
  useAuditLog: () => ({ log: vi.fn() }),
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
  groupSameOutfallSameDay: (...args: unknown[]) => groupSameOutfallSameDayMock(...args),
  siblingVisitsSameOutfallSameDay: (...args: unknown[]) => siblingVisitsSameOutfallSameDayMock(...args),
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
      outfall_type: 'Outfall',
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
    signage_condition: 'Good',
    pipe_condition: 'Good',
    erosion_observed: false,
    obstruction_observed: false,
    obstruction_details: null,
    inspector_notes: 'No visible issues.',
    flow_category: null,
    flow_estimate_cfs: null,
    flow_method: null,
    flow_safety_warning_shown: null,
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
    getEffectiveRoleMock.mockReturnValue('field_sampler');
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
    expect(screen.getByRole('heading', { name: 'Sample Collection' })).toBeInTheDocument();
    expect(screen.getByText('Sample collected')).toBeInTheDocument();
    expect(screen.getByText('Finish custody and field-only readings for this stop.')).toBeInTheDocument();
  });

  it('shows a recoverable unavailable state after a hard visit-load miss', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Field visit unavailable')).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: 'Back to field queue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry visit load' })).toBeInTheDocument();
  });

  it('renders the five wizard steps and starts in the start-visit step', async () => {
    renderPage(buildDetail());

    await waitForWizard();

    const progress = screen.getByRole('navigation', { name: 'Field visit wizard progress' });
    expect(within(progress).getByRole('button', { name: 'Start Visit' })).toBeInTheDocument();
    expect(within(progress).getByRole('button', { name: 'Site Assessment' })).toBeInTheDocument();
    expect(within(progress).getByRole('button', { name: 'Sample Collection' })).toBeInTheDocument();
    expect(within(progress).getByRole('button', { name: 'Evidence' })).toBeInTheDocument();
    expect(within(progress).getByRole('button', { name: 'Review & Complete' })).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Start Visit' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Welcome/i })).toBeInTheDocument();
    expect(screen.getByText('Are you at the following outfall?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('blocks jumping ahead when prerequisite wizard steps are incomplete', async () => {
    const user = userEvent.setup();
    renderPage(buildDetail());

    await waitForWizard();

    await user.click(getWizardButton(/Review & Complete/i));

    expect(getWizardButton(/Start Visit/i)).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('heading', { name: 'Start Visit' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Welcome/i })).toBeInTheDocument();
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
    await waitForStepHeading('Sample Collection');

    expect(screen.getByText('Sample collected')).toBeInTheDocument();
    expect(screen.getByText('Finish custody first, then save only the field readings required for this stop.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scan container/i })).toBeInTheDocument();
    expect(screen.getByText('On-Site Field Measurements')).toBeInTheDocument();
    expect(screen.getByText(/on-site meter readings only/i)).toBeInTheDocument();
    expect(screen.getByText('Collection notes')).toBeInTheDocument();
    expect(screen.getByText('Need help with this stop?')).toBeInTheDocument();
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
        expectedText: 'Sample collected',
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
      await waitForStepHeading('Sample Collection');
      expect(screen.getAllByText(testCase.expectedText).length).toBeGreaterThan(0);
      view.unmount();
    }
  });

  it('renders the site assessment decision tree with reachability and condition questions', async () => {
    const user = userEvent.setup();
    renderPage(buildStartedDetail());

    await waitForWizard();
    await user.click(getWizardButton(/Site Assessment/i));
    await waitForStepHeading('Site Assessment');

    expect(screen.getByText('Are you able to reach the inspection site?')).toBeInTheDocument();

    const yesButtons = screen.getAllByRole('button', { name: 'Yes' });
    expect(yesButtons.length).toBeGreaterThan(0);
    expect(yesButtons[0]).toHaveAttribute('aria-pressed', 'true');

    expect(screen.getByText('What condition is present at the designated monitoring point?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Flowing discharge' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Standing water' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No water present' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inaccessible' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Other' })).toBeInTheDocument();
  });

  it('shows obstruction details when site is not reachable', async () => {
    const user = userEvent.setup();
    renderPage(buildStartedDetail());

    await waitForWizard();
    await user.click(getWizardButton(/Site Assessment/i));
    await waitForStepHeading('Site Assessment');

    const noButtons = screen.getAllByRole('button', { name: 'No' });
    await user.click(noButtons[0]!);

    expect(screen.getByText('Obstruction type')).toBeInTheDocument();
    expect(screen.getByText(/Describe the obstruction/i)).toBeInTheDocument();
    expect(screen.queryByText('What condition is present at the designated monitoring point?')).not.toBeInTheDocument();
  });

  it('shows flowing discharge confirmation when flowing is selected', async () => {
    const user = userEvent.setup();
    renderPage(buildStartedDetail());

    await waitForWizard();
    await user.click(getWizardButton(/Site Assessment/i));
    await waitForStepHeading('Site Assessment');

    await user.click(screen.getByRole('button', { name: 'Flowing discharge' }));

    expect(screen.getByText(/Flowing discharge confirmed — proceed to sample collection/i)).toBeInTheDocument();
  });

  it('shows stream flow estimation for receiving-stream outfall types before confirmation', async () => {
    const user = userEvent.setup();
    renderPage(
      buildStartedDetail({
        visit: { outfall_type: 'Receiving Stream' },
        inspection: null,
      }),
    );

    await waitForWizard();
    await user.click(getWizardButton(/Site Assessment/i));
    await waitForStepHeading('Site Assessment');

    await user.click(screen.getByRole('button', { name: 'Flowing discharge' }));

    expect(screen.getByText('Estimated Stream Flow')).toBeInTheDocument();
    expect(screen.queryByText(/Stream flow estimate captured/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Moderate Flow/i }));
    await user.click(screen.getByRole('button', { name: /Visual only/i }));
    expect(screen.getByText(/Stream flow estimate captured — proceed to sample collection/i)).toBeInTheDocument();
  });

  it('shows standing water sub-questions and sampleable confirmation when all pass', async () => {
    const user = userEvent.setup();
    renderPage(buildStartedDetail());

    await waitForWizard();
    await user.click(getWizardButton(/Site Assessment/i));
    await waitForStepHeading('Site Assessment');

    await user.click(screen.getByRole('button', { name: 'Standing water' }));

    expect(screen.getByText('Standing water verification')).toBeInTheDocument();
    expect(screen.getByText(/Was sufficient water present/i)).toBeInTheDocument();

    const yesButtons = screen.getAllByRole('button', { name: 'Yes' });
    await user.click(yesButtons[1]!);

    expect(screen.getByText(/Could the sample be collected without disturbing sediment/i)).toBeInTheDocument();
    const yesButtons2 = screen.getAllByRole('button', { name: 'Yes' });
    await user.click(yesButtons2[2]!);

    expect(screen.getByText(/Was the designated monitoring point verified/i)).toBeInTheDocument();
    const yesButtons3 = screen.getAllByRole('button', { name: 'Yes' });
    await user.click(yesButtons3[3]!);

    expect(screen.getByText(/Standing water is sampleable — proceed to collection/i)).toBeInTheDocument();
  });

  it('shows not-collectable form when standing water sub-check fails', async () => {
    const user = userEvent.setup();
    renderPage(buildStartedDetail());

    await waitForWizard();
    await user.click(getWizardButton(/Site Assessment/i));
    await waitForStepHeading('Site Assessment');

    await user.click(screen.getByRole('button', { name: 'Standing water' }));

    const noButtons = screen.getAllByRole('button', { name: 'No' });
    await user.click(noButtons[1]!);

    expect(screen.getByText(/Sample cannot be collected/i)).toBeInTheDocument();
    expect(screen.getByText('Why was the sample not collectable?')).toBeInTheDocument();
  });

  it('shows not-collectable form for no-water-present condition', async () => {
    const user = userEvent.setup();
    renderPage(buildStartedDetail());

    await waitForWizard();
    await user.click(getWizardButton(/Site Assessment/i));
    await waitForStepHeading('Site Assessment');

    await user.click(screen.getByRole('button', { name: 'No water present' }));

    expect(screen.getByText('Why was the sample not collectable?')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Describe what you observed at the monitoring point')).toBeInTheDocument();
  });

  it('preserves inspection notes across back and next navigation', async () => {
    const user = userEvent.setup();
    renderPage(buildStartedDetail());

    await waitForWizard();
    await user.click(getWizardButton(/Site Assessment/i));
    await waitForStepHeading('Site Assessment');

    const notes = screen.getByRole('textbox', { name: /Inspection notes/i });
    await user.clear(notes);
    await user.type(notes, 'Custom inspection note for persistence test.');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitForStepHeading('Start Visit');

    await user.click(getWizardButton(/Site Assessment/i));
    await waitForStepHeading('Site Assessment');
    expect(screen.getByRole('textbox', { name: /Inspection notes/i })).toHaveValue(
      'Custom inspection note for persistence test.',
    );
  });

  it('shows an explicit error toast after start if system weather fails to load', async () => {
    const user = userEvent.setup();
    const startVisit = vi.fn().mockResolvedValue({ queued: false });
    fetchOpenMeteoCurrentSnapshotMock.mockReset();
    fetchOpenMeteoCurrentSnapshotMock.mockRejectedValue(
      new Error('Weather service returned 503'),
    );
    const base = buildDetail();
    const unstartedWithCoords = buildDetail({
      visit: {
        ...base.visit,
        outfall_latitude: 38.1,
        outfall_longitude: -81.2,
      },
    });
    const hookState = {
      detail: unstartedWithCoords as FieldVisitDetails | null,
      detailLoading: false,
      detailLoadSource: 'live' as const,
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
      startVisit,
      saveInspection: vi.fn().mockResolvedValue({ queued: false }),
      addMeasurement: vi.fn().mockResolvedValue({ queued: false }),
      saveCocPrimaryContainer: vi.fn().mockResolvedValue({ queued: false }),
      recordEvidenceAsset: vi.fn(),
      completeVisit: vi.fn().mockResolvedValue({ queued: false, result: { governance_issue_id: null } }),
    };
    useFieldOpsMock.mockImplementation(() => hookState);

    render(
      <MemoryRouter initialEntries={['/field/visits/visit-1']}>
        <Routes>
          <Route path="/field/visits/:id" element={<FieldVisitPage />} />
          <Route path="/field/dispatch" element={<div>Field queue</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitForWizard();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(startVisit).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('System weather did not load: Weather service returned 503'),
      );
    });
  });

  it('limits the evidence step to outcome-relevant buckets and keeps offline drafts visible', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    const offlineDraft: FieldEvidenceDraft = {
      id: 'draft-1',
      fieldVisitId: 'visit-1',
      bucket: 'field-inspections',
      pathPrefix: 'org-1/field-visits/',
      fileName: 'dry-channel.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024,
      evidenceType: 'photo',
      notes: serializePhotoEvidenceCategory('flow_no_flow'),
      latitude: null,
      longitude: null,
      createdAt: '2026-04-01T12:00:00Z',
    };
    vi.mocked(listFieldEvidenceDrafts).mockResolvedValue([offlineDraft]);

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
    await waitForStepHeading('Sample Collection');
    await user.click(getWizardButton(/Evidence/i));
    await waitForStepHeading('Evidence');

    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Flow \/ no-flow/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Outlet \/ signage/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sample containers/i })).not.toBeInTheDocument();
    expect(screen.getByText(/dry-channel\.jpg/i)).toBeInTheDocument();
    expect(screen.getByText(/pending sync/i)).toBeInTheDocument();
  });

  it('surfaces QA prompts in the sample collection step for duplicate and special handling context', async () => {
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
    await waitForStepHeading('Sample Collection');

    const qaToggle = screen.getByRole('button', { name: 'QA prompts' });
    expect(screen.getByText('Need help with this stop?')).toBeInTheDocument();
    expect(qaToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Possible duplicate stop')).not.toBeInTheDocument();

    await user.click(qaToggle);
    expect(qaToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Possible duplicate stop')).toBeInTheDocument();
    expect(screen.getByText('Special collection handling')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Append QA note' })[0]!);
    expect(screen.getByDisplayValue(/QA prompt: same-day duplicate visit exists/i)).toBeInTheDocument();
  });

  it('keeps only one outcome helper section expanded at a time', async () => {
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
    await waitForStepHeading('Sample Collection');

    const qaToggle = screen.getByRole('button', { name: 'QA prompts' });
    const safetyToggle = screen.getByRole('button', { name: 'Safety actions' });

    await user.click(qaToggle);
    expect(qaToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Possible duplicate stop')).toBeInTheDocument();

    await user.click(safetyToggle);
    expect(safetyToggle).toHaveAttribute('aria-expanded', 'true');
    expect(qaToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Possible duplicate stop')).not.toBeInTheDocument();
  });

  it('renders the site assessment reachability toggle with correct initial state', async () => {
    const user = userEvent.setup();
    renderPage(buildStartedDetail({
      inspection: {
        ...buildInspection(),
        obstruction_observed: true,
        obstruction_details: 'Vegetation: brush packed against the pipe opening',
      },
    }));

    await waitForWizard();
    await user.click(getWizardButton(/Site Assessment/i));
    await waitForStepHeading('Site Assessment');

    expect(screen.getByText('Are you able to reach the inspection site?')).toBeInTheDocument();
    expect(screen.getByText('Obstruction type')).toBeInTheDocument();
    expect(screen.getByText(/Describe the obstruction/i)).toBeInTheDocument();
    expect(screen.queryByText('What condition is present at the designated monitoring point?')).not.toBeInTheDocument();
  });

  it('keeps structured inspection notes after save-and-continue and rerender', async () => {
    const user = userEvent.setup();
    const expectedInspectionNote = 'Signage damaged and outlet partially blocked.';
    const saveInspection = vi.fn().mockImplementation(async (_visitId: string, inspection: Partial<OutletInspectionRecord>) => {
      hookState = {
        ...hookState,
        detail: buildStartedDetail({
          inspection: {
            id: 'inspection-saved',
            field_visit_id: 'visit-1',
            flow_status: inspection.flow_status ?? 'flowing',
            signage_condition: inspection.signage_condition ?? 'Good',
            pipe_condition: inspection.pipe_condition ?? 'Good',
            erosion_observed: inspection.erosion_observed ?? false,
            obstruction_observed: inspection.obstruction_observed ?? false,
            obstruction_details: inspection.obstruction_details ?? null,
            inspector_notes: expectedInspectionNote,
            flow_category: inspection.flow_category ?? null,
            flow_estimate_cfs: inspection.flow_estimate_cfs ?? null,
            flow_method: inspection.flow_method ?? null,
            flow_safety_warning_shown: inspection.flow_safety_warning_shown ?? null,
            created_at: '2026-04-01T12:00:00Z',
            updated_at: '2026-04-01T12:05:00Z',
            created_by: 'user-1',
          },
        }),
      };
      return { queued: false };
    });
    let hookState = {
      detail: buildStartedDetail() as FieldVisitDetails | null,
      detailLoading: false,
      detailLoadSource: 'live' as const,
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
      startVisit: vi.fn().mockResolvedValue({ queued: false }),
      saveInspection,
      addMeasurement: vi.fn().mockResolvedValue({ queued: false }),
      saveCocPrimaryContainer: vi.fn().mockResolvedValue({ queued: false }),
      recordEvidenceAsset: vi.fn(),
      completeVisit: vi.fn().mockResolvedValue({ queued: false, result: { governance_issue_id: null } }),
    };
    useFieldOpsMock.mockImplementation(() => hookState);

    const view = render(
      <MemoryRouter initialEntries={['/field/visits/visit-1']}>
        <Routes>
          <Route path="/field/visits/:id" element={<FieldVisitPage />} />
          <Route path="/field/dispatch" element={<div>Field queue</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitForWizard();
    await user.click(getWizardButton(/Site Assessment/i));
    await waitForStepHeading('Site Assessment');

    await user.click(screen.getByRole('button', { name: 'Flowing discharge' }));

    fireEvent.change(screen.getByRole('textbox', { name: /Inspection notes/i }), {
      target: { value: expectedInspectionNote },
    });
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /Inspection notes/i })).toHaveValue(expectedInspectionNote);
    });

    await user.click(screen.getByRole('button', { name: 'Continue to sample collection' }));
    await waitFor(() => {
      expect(saveInspection).toHaveBeenCalled();
    });
    await waitForStepHeading('Sample Collection');

    view.rerender(
      <MemoryRouter initialEntries={['/field/visits/visit-1']}>
        <Routes>
          <Route path="/field/visits/:id" element={<FieldVisitPage />} />
          <Route path="/field/dispatch" element={<div>Field queue</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitForStepHeading('Sample Collection');
    await user.click(getWizardButton(/Site Assessment/i));
    await waitForStepHeading('Site Assessment');

    expect(screen.getByRole('textbox', { name: /Inspection notes/i })).toHaveValue(expectedInspectionNote);
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
          organization_id: 'org-1',
          field_visit_id: 'visit-1',
          governance_issue_id: null,
          evidence_type: 'photo',
          bucket: 'field-inspections',
          storage_path: 'field-visits/flow.jpg',
          uploaded_by: 'user-1',
          captured_at: '2026-04-01T12:00:00Z',
          latitude: null,
          longitude: null,
          notes: serializePhotoEvidenceCategory('flow_no_flow'),
          created_at: '2026-04-01T12:00:00Z',
        },
        {
          id: 'evidence-2',
          organization_id: 'org-1',
          field_visit_id: 'visit-1',
          governance_issue_id: null,
          evidence_type: 'photo',
          bucket: 'field-inspections',
          storage_path: 'field-visits/outlet.jpg',
          uploaded_by: 'user-1',
          captured_at: '2026-04-01T12:00:00Z',
          latitude: null,
          longitude: null,
          notes: serializePhotoEvidenceCategory('outlet_signage'),
          created_at: '2026-04-01T12:00:00Z',
        },
      ] satisfies FieldEvidenceAssetRecord[],
    }));

    await waitForWizard();
    await waitForStepHeading('Review & Complete');

    expect(screen.getByText('Completion Readiness')).toBeInTheDocument();
    expect(screen.getByText('Everything required for this outcome is in place.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete visit' })).toBeEnabled();
  });
});
