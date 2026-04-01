import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldVisitPage } from '@/pages/FieldVisitPage';

const useFieldOpsMock = vi.fn();

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

vi.mock('@/components/field/FieldSameOutfallDayWarning', () => ({
  FieldSameOutfallDayWarning: () => null,
}));

vi.mock('@/components/ui/SpotlightCard', () => ({
  SpotlightCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/submissions/EvidenceCaptureUpload', () => ({
  EvidenceCaptureUpload: () => null,
}));

vi.mock('@/components/submissions/SubmissionEvidenceViewer', () => ({
  SubmissionEvidenceViewer: () => null,
}));

vi.mock('@/lib/fieldEvidenceDrafts', () => ({
  clearPersistedFieldEvidenceSyncFailuresForVisit: vi.fn(),
  listFieldEvidenceDrafts: vi.fn().mockResolvedValue([]),
  readPersistedFieldEvidenceSyncFailuresForVisit: vi.fn(() => []),
  saveFieldEvidenceDraft: vi.fn(),
}));

vi.mock('@/lib/governanceDeadlines', () => ({
  describeGovernanceDeadline: vi.fn(),
}));

vi.mock('@/lib/fieldMapsNav', () => ({
  mapsSearchQueryUrl: () => '',
  mapsSearchUrl: () => '',
}));

vi.mock('@/lib/fieldOutboundQueue', () => ({
  countOutboundQueueOpsForVisit: () => 0,
}));

vi.mock('@/lib/fieldSameOutfallDay', () => ({
  groupSameOutfallSameDay: () => [],
  siblingVisitsSameOutfallSameDay: () => [],
}));

vi.mock('@/lib/fieldVisitDisposition', () => ({
  visitNeedsDisposition: () => false,
}));

describe('FieldVisitPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFieldOpsMock.mockReturnValue({
      detail: null,
      detailLoading: false,
      loading: false,
      lastSyncedAt: null,
      outboundPendingCount: 0,
      outboundQueueDiagnostic: null,
      clearOutboundQueueDiagnostic: vi.fn(),
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

  it('shows a recoverable unavailable state after a hard visit-load miss', async () => {
    render(
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

    await waitFor(() => {
      expect(screen.getByText('Field visit unavailable')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/we could not load this visit after checking the scoped cache/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to field queue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry visit load' })).toBeInTheDocument();
  });
});
