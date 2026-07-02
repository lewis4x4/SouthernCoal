/**
 * Upload Dashboard production-readiness smoke checklist (v6 §12).
 * Manual steps are operator-run; automated assertions live in uploadDashboardSmokeAssertions.ts.
 */

export type UploadSmokeCheckId =
  | 'non_admin_upload'
  | 'realtime_rls'
  | 'duplicate_detection'
  | 'cross_tenant_isolation'
  | 'summary_stats_accuracy'
  | 'matrix_cell_filtering'
  | 'export_audit_trail'
  | 'failed_processing'
  | 'file_type_validation'
  | 'session_expiry';

export interface UploadDashboardSmokeCheck {
  id: UploadSmokeCheckId;
  order: number;
  title: string;
  manualSteps: string[];
  /** When true, vitest + in-app "Run automated" can verify wiring without a browser session. */
  automatable: boolean;
}

export const UPLOAD_DASHBOARD_SMOKE_CHECKS: UploadDashboardSmokeCheck[] = [
  {
    id: 'non_admin_upload',
    order: 1,
    title: 'Non-admin upload test',
    automatable: true,
    manualSteps: [
      'Log in as a user with Upload Dashboard access (COMPLIANCE_UPLOAD roles).',
      'Upload a PDF to the permits bucket for Alabama.',
      'Confirm: file appears in Storage at permits/Alabama/{filename}.pdf.',
      'Confirm: file_processing_queue row visible in Processing Queue.',
    ],
  },
  {
    id: 'realtime_rls',
    order: 2,
    title: 'Realtime fires under RLS',
    automatable: true,
    manualSteps: [
      'Open two browser tabs as the same user.',
      'Upload a file in Tab A.',
      'Confirm: Tab B Processing Queue updates without manual refresh.',
    ],
  },
  {
    id: 'duplicate_detection',
    order: 3,
    title: 'Duplicate detection',
    automatable: true,
    manualSteps: [
      'Upload the same file twice.',
      'Confirm: second upload shows amber "already uploaded" toast.',
      'Confirm: no second row appears in queue.',
    ],
  },
  {
    id: 'cross_tenant_isolation',
    order: 4,
    title: 'Cross-tenant isolation',
    automatable: true,
    manualSteps: [
      'Log in as Tenant A user → upload a file.',
      'Log in as Tenant B user → confirm Tenant A file is NOT visible.',
      'Upload the same file as Tenant B → confirm it succeeds (not "duplicate").',
    ],
  },
  {
    id: 'summary_stats_accuracy',
    order: 5,
    title: 'Summary stats accuracy',
    automatable: true,
    manualSteps: [
      'Query npdes_permits count via SQL. Compare to Total Permits stat card.',
      'Query outfalls count via SQL. Compare to Total Outfalls stat card.',
      'Query permit_limits count via SQL. Compare to Total Limits stat card.',
      'Confirm all match.',
    ],
  },
  {
    id: 'matrix_cell_filtering',
    order: 6,
    title: 'Matrix cell filtering',
    automatable: true,
    manualSteps: [
      'Click a Compliance Matrix cell (e.g., AL + Permits).',
      'Confirm: Processing Queue filters to show only AL permit files.',
      'Repeat for Samp. Matrix or CD column after uploading outreach documents.',
    ],
  },
  {
    id: 'export_audit_trail',
    order: 7,
    title: 'Export audit trail',
    automatable: true,
    manualSteps: [
      'Export Compliance Matrix as CSV.',
      'Query audit_log for the export action.',
      'Confirm: row exists with action matrix_export_csv.',
    ],
  },
  {
    id: 'failed_processing',
    order: 8,
    title: 'Failed processing forensics',
    automatable: true,
    manualSteps: [
      'Upload a non-PDF file to permits bucket (force a processing failure).',
      'Click Process on it.',
      'Confirm: red Failed badge appears.',
      'Expand the row → confirm Error Forensics shows a human-readable message.',
    ],
  },
  {
    id: 'file_type_validation',
    order: 9,
    title: 'File type validation',
    automatable: true,
    manualSteps: [
      'Drag an .exe file onto the window.',
      'Confirm: staging area shows validation error.',
      'Confirm: Upload button is disabled for that file.',
    ],
  },
  {
    id: 'session_expiry',
    order: 10,
    title: 'Session expiry',
    automatable: true,
    manualSteps: [
      'Set a short JWT expiry (or wait).',
      'Attempt upload with expired session.',
      'Confirm: redirect to login with session expired message.',
    ],
  },
];

export function getUploadSmokeCheck(id: UploadSmokeCheckId): UploadDashboardSmokeCheck | undefined {
  return UPLOAD_DASHBOARD_SMOKE_CHECKS.find((c) => c.id === id);
}
