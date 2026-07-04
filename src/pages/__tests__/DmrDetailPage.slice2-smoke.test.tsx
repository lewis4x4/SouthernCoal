import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DmrDetailPage } from '@/pages/DmrDetailPage';
import type { DmrValidationResult } from '@/hooks/useDmrSubmissions';
import type { DmrCalculationWarning, DmrSubmissionWithPermit } from '@/lib/dmrSchema';
import type { DmrLineItemWithRelations } from '@/types/database';

const mocks = vi.hoisted(() => ({
  log: vi.fn(),
  supabaseFrom: vi.fn(),
  useDmrSubmissions: vi.fn(),
}));

vi.mock('@/hooks/useAuditLog', () => ({
  useAuditLog: () => ({
    log: mocks.log,
  }),
}));

vi.mock('@/hooks/useDmrSubmissions', () => ({
  useDmrSubmissions: () => mocks.useDmrSubmissions(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.supabaseFrom(...args),
  },
}));

const SYNTHETIC_SUBMISSION_ID = 'f0001002-0002-4002-8002-000000000002';
const SYNTHETIC_TSS_LINE_ID = 'f0001003-0003-4003-8003-000000000003';
const EXPECTED_TSS_MG_L = 18.4;

const syntheticSubmission: DmrSubmissionWithPermit = {
  id: SYNTHETIC_SUBMISSION_ID,
  organization_id: 'org-scc',
  permit_id: 'permit-kyge40869',
  permit_number: 'KYGE40869',
  site_name: 'SYNTHETIC UAT SLICE2',
  monitoring_period_start: '2026-01-01',
  monitoring_period_end: '2026-01-31',
  submission_type: 'monthly',
  status: 'draft',
  no_discharge: false,
  nodi_code: null,
  submitted_by: null,
  submitted_at: null,
  submission_confirmation: null,
  source_file_id: 'slice2-netdmr-import',
  import_id: null,
  created_at: '2026-01-31T00:00:00.000Z',
  updated_at: '2026-01-31T00:00:00.000Z',
};

const validDmrResult: DmrValidationResult = {
  valid: true,
  errors: [],
  warnings: [],
  total_items: 1,
  populated: 1,
  missing: 0,
  exceedances: 0,
};

function makeTssLine(
  overrides: Partial<DmrLineItemWithRelations> & {
    calculation_warnings?: DmrCalculationWarning[];
    mass_loading_lbs_day?: number | null;
  } = {},
): DmrLineItemWithRelations & {
  calculation_warnings: DmrCalculationWarning[];
  mass_loading_lbs_day: number | null;
} {
  return {
    id: SYNTHETIC_TSS_LINE_ID,
    submission_id: SYNTHETIC_SUBMISSION_ID,
    outfall_id: 'outfall-001',
    parameter_id: 'parameter-tss',
    statistical_base: 'maximum',
    limit_value: 70,
    limit_unit: 'mg/L',
    limit_type: 'daily_max',
    measured_value: null,
    measured_unit: 'mg/L',
    nodi_code: null,
    is_exceedance: false,
    exceedance_pct: null,
    sample_count: 1,
    sample_frequency: null,
    storet_code: '00530',
    qualifier: null,
    comments: null,
    created_at: '2026-01-31T00:00:00.000Z',
    submission: {
      permit_id: 'permit-kyge40869',
      monitoring_period_end: '2026-01-31',
      status: 'draft',
    },
    outfall: {
      outfall_number: '001',
      permit_id: 'permit-kyge40869',
    },
    parameter: {
      name: 'Total Suspended Solids',
      short_name: 'TSS',
      storet_code: '00530',
    },
    calculation_warnings: [],
    mass_loading_lbs_day: null,
    ...overrides,
  };
}

function installSupabaseLookupMock() {
  mocks.supabaseFrom.mockImplementation((table: string) => {
    if (table === 'outfalls') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({
            data: [{ id: 'outfall-001' }],
            error: null,
          }),
        })),
      };
    }

    if (table === 'permit_limits') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          })),
        })),
      };
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    };
  });
}

function installDmrHookMock(overrides: {
  fetchLineItems: ReturnType<typeof vi.fn>;
  autoPopulate?: ReturnType<typeof vi.fn>;
  validateSubmission?: ReturnType<typeof vi.fn>;
}) {
  mocks.useDmrSubmissions.mockReturnValue({
    submissions: [],
    loading: false,
    statusCounts: {
      draft: 0,
      pending: 0,
      submitted: 0,
      accepted: 0,
      rejected: 0,
    },
    createSubmission: vi.fn(),
    updateSubmission: vi.fn().mockResolvedValue({ error: null }),
    submitDmr: vi.fn().mockResolvedValue({ error: null }),
    markSubmitted: vi.fn().mockResolvedValue({ error: null }),
    fetchSubmissionById: vi.fn().mockResolvedValue(syntheticSubmission),
    fetchLineItems: overrides.fetchLineItems,
    updateLineItem: vi.fn().mockResolvedValue({ error: null }),
    createLineItem: vi.fn().mockResolvedValue({ error: null, id: 'new-line' }),
    autoPopulate:
      overrides.autoPopulate ??
      vi.fn().mockResolvedValue({
        status: 'calculated',
        line_count: 1,
        populated: 1,
        missing: 0,
        exceedances: 0,
        conversion_warnings: 0,
      }),
    validateSubmission:
      overrides.validateSubmission ?? vi.fn().mockResolvedValue(validDmrResult),
    refetch: vi.fn(),
  });
}

function renderSyntheticDmrRoute() {
  return render(
    <MemoryRouter initialEntries={[`/dmr/${SYNTHETIC_SUBMISSION_ID}`]}>
      <Routes>
        <Route path="/dmr/:id" element={<DmrDetailPage />} />
        <Route path="/dmr" element={<div>DMR submissions</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Slice 2 DMR UI smoke for KYGE40869', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSupabaseLookupMock();
  });

  it('runs the acceptance path: Auto-Populate TSS to 18.4 mg/L, then Validate cleanly', async () => {
    const fetchLineItems = vi
      .fn()
      .mockResolvedValueOnce([makeTssLine()])
      .mockResolvedValueOnce([
        makeTssLine({
          measured_value: EXPECTED_TSS_MG_L,
          measured_unit: 'mg/L',
          calculation_warnings: [],
        }),
      ]);
    const autoPopulate = vi.fn().mockResolvedValue({
      status: 'calculated',
      line_count: 1,
      populated: 1,
      missing: 0,
      exceedances: 0,
      conversion_warnings: 0,
    });
    const validateSubmission = vi.fn().mockResolvedValue(validDmrResult);
    installDmrHookMock({ fetchLineItems, autoPopulate, validateSubmission });

    renderSyntheticDmrRoute();

    await screen.findByRole('heading', { name: /KYGE40869/i });
    expect(screen.getByText(/2026-01-01/)).toBeInTheDocument();
    expect(screen.getByText(/2026-01-31/)).toBeInTheDocument();

    const tssRow = screen.getByRole('row', { name: /Total Suspended Solids/i });
    const measuredInput = within(tssRow).getByRole('spinbutton', {
      name: /Measured value for Total Suspended Solids/i,
    });
    expect(measuredInput).toHaveValue(null);

    await userEvent.click(screen.getByRole('button', { name: /Auto-Populate/i }));

    await waitFor(() => {
      expect(autoPopulate).toHaveBeenCalledWith(SYNTHETIC_SUBMISSION_ID);
      expect(fetchLineItems).toHaveBeenCalledTimes(2);
    });
    expect(
      within(screen.getByRole('row', { name: /Total Suspended Solids/i })).getByRole(
        'spinbutton',
        { name: /Measured value for Total Suspended Solids/i },
      ),
    ).toHaveValue(EXPECTED_TSS_MG_L);
    expect(screen.queryByText(/unit conversion warning/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Validate/i }));

    await screen.findByText('Ready for submission');
    expect(validateSubmission).toHaveBeenCalledWith(SYNTHETIC_SUBMISSION_ID);
    expect(
      screen.getByText(/1 items.*1 populated.*0 missing.*0 exceedances/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/conversion warning/i)).not.toBeInTheDocument();
  });

  it('surfaces calculation warning state when a line item has a missing unit conversion', async () => {
    const missingConversionMessage =
      'No unit conversion from mg/L to lbs/day for Total Suspended Solids -- raw lab value retained';
    const fetchLineItems = vi.fn().mockResolvedValue([
      makeTssLine({
        measured_value: EXPECTED_TSS_MG_L,
        measured_unit: 'lbs/day',
        limit_unit: 'lbs/day',
        calculation_warnings: [
          {
            type: 'missing_unit_conversion',
            message: missingConversionMessage,
            from_unit: 'mg/L',
            to_unit: 'lbs/day',
            parameter_id: 'parameter-tss',
          },
        ],
      }),
    ]);
    installDmrHookMock({ fetchLineItems });

    renderSyntheticDmrRoute();

    await screen.findByRole('heading', { name: /KYGE40869/i });
    expect(screen.getByText('1 unit conversion warning(s)')).toBeInTheDocument();

    const warningStatus = screen.getByText('Unit conversion');
    expect(warningStatus).toBeInTheDocument();
    expect(warningStatus).toHaveAttribute('title', missingConversionMessage);
  });
});
