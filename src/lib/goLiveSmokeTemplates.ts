/**
 * Go-live smoke test seed templates — operator-run checklists with stable template IDs.
 * Seeded rows use status `pending`; `[tpl:…]` prefix enables dedup and instruction lookup.
 */

import { UPLOAD_DASHBOARD_SMOKE_CHECKS } from '@/lib/uploadDashboardSmokeChecklist';
import type { GoLiveItemModule, SmokeTestType } from '@/types/database';

export type GoLiveSmokeTemplateGroupId =
  | 'upload-dashboard-v6'
  | 'lane-a-m2'
  | 'compliance-validation';

export interface GoLiveSmokeTestTemplate {
  templateId: string;
  groupId: GoLiveSmokeTemplateGroupId;
  testName: string;
  module: GoLiveItemModule;
  testType: SmokeTestType;
  manualSteps: string[];
  /** npm script or Vitest hint for automatable wiring checks (optional). */
  automatedHint?: string;
}

export const GO_LIVE_SMOKE_TEMPLATE_GROUPS: Record<
  GoLiveSmokeTemplateGroupId,
  { label: string; description: string }
> = {
  'upload-dashboard-v6': {
    label: 'Upload Dashboard (v6 §12)',
    description: 'Ten production-readiness checks from the Upload Dashboard handoff smoke checklist.',
  },
  'lane-a-m2': {
    label: 'Lane A M2 field sync (B1–B5)',
    description: 'Manual staging QA for offline route/visit, sync health, flush ordering, conflict holds, and audit trail.',
  },
  'compliance-validation': {
    label: 'Compliance validation harness',
    description: 'Parameter alias STORET validation against org data.',
  },
};

const UPLOAD_SMOKE_TEMPLATES: GoLiveSmokeTestTemplate[] = UPLOAD_DASHBOARD_SMOKE_CHECKS.map(
  (check) => ({
    templateId: `upload-${check.id}`,
    groupId: 'upload-dashboard-v6' as const,
    testName: check.title,
    module: 'upload' as const,
    testType: (check.automatable ? 'integration' : 'manual') as SmokeTestType,
    manualSteps: check.manualSteps,
    automatedHint: check.automatable
      ? 'npm run smoke:upload-dashboard (CI wiring) + manual steps on /compliance'
      : undefined,
  }),
);

const LANE_A_M2_TEMPLATES: GoLiveSmokeTestTemplate[] = [
  {
    templateId: 'lane-a-b1',
    groupId: 'lane-a-m2',
    testName: 'B1 — Durable offline route + visit context',
    module: 'field_ops',
    testType: 'manual',
    manualSteps: [
      'While online, open Today\'s route and one Field visit — confirm live load.',
      'Turn network off (airplane mode or DevTools Offline).',
      'Reload Today\'s route — list/stops still usable from cache.',
      'Open the same visit — shell loads from cache; note cold-start limitation if first load was offline.',
    ],
    automatedHint: 'npm run qa:lane-a-m2 (fieldRouteLocalCache + fieldVisitLocalCache)',
  },
  {
    templateId: 'lane-a-b2',
    groupId: 'lane-a-m2',
    testName: 'B2 — Sync health: queue + evidence drafts',
    module: 'field_ops',
    testType: 'manual',
    manualSteps: [
      'Induce a pending outbound op or failed evidence upload (throttled network if needed).',
      'Confirm FieldDataSyncBar shows counts, last error, and blocking visit.',
      'Confirm FieldOutboundQueueDiagnostic reflects blocked queue state.',
    ],
    automatedHint: 'npm run qa:lane-a-m2 (fieldOutboundQueueDiagnostic + fieldSyncPending)',
  },
  {
    templateId: 'lane-a-b3',
    groupId: 'lane-a-m2',
    testName: 'B3 — Reconnect flush ordering',
    module: 'field_ops',
    testType: 'manual',
    manualSteps: [
      'Queue at least one completion or evidence-bearing path offline, then reconnect.',
      'Confirm failed step surfaces without marking visit completed incorrectly.',
      'Spot-check evidence-before-RPC ordering (dev trace if needed).',
    ],
    automatedHint: 'npm run qa:lane-a-m2 (fieldOutboundQueue ordering tests)',
  },
  {
    templateId: 'lane-a-b4',
    groupId: 'lane-a-m2',
    testName: 'B4 — Conflict hold (no silent overwrite)',
    module: 'field_ops',
    testType: 'manual',
    manualSteps: [
      'Induce conflict-hold (terminal visit on server vs queued client work).',
      'Confirm toast/banner explains hold; user can retry or dismiss.',
      'Confirm server row was not silently overwritten.',
    ],
    automatedHint: 'npm run qa:lane-a-m2 (FieldOutboundConflictHoldError tests)',
  },
  {
    templateId: 'lane-a-b5',
    groupId: 'lane-a-m2',
    testName: 'B5 — Audit trail (client sync actions)',
    module: 'field_ops',
    testType: 'manual',
    manualSteps: [
      'After B2–B4 events, spot-check audit_log for field_outbound_queue_flushed, field_outbound_queue_blocked, field_outbound_conflict_hold.',
      'Use Audit Log UI conflict-hold preset if available.',
    ],
    automatedHint: 'npm run qa:lane-a-m2 + Audit Log preset for field_outbound_conflict_hold',
  },
];

const COMPLIANCE_VALIDATION_TEMPLATES: GoLiveSmokeTestTemplate[] = [
  {
    templateId: 'compliance-parameter-aliases',
    groupId: 'compliance-validation',
    testName: 'Parameter alias harness (STORET validation)',
    module: 'compliance',
    testType: 'automated',
    manualSteps: [
      'Run npm test — parameterAliasValidation.test.ts must pass (shared PARAMETER_MAP).',
      'With service role: npm run validate:parameter-aliases — review unmapped aliases for org.',
      'Confirm /compliance/aliases lists parameter and outfall mappings for the org.',
    ],
    automatedHint: 'npm test parameterAliasValidation && npm run validate:parameter-aliases',
  },
];

export const GO_LIVE_SMOKE_TEMPLATES: GoLiveSmokeTestTemplate[] = [
  ...UPLOAD_SMOKE_TEMPLATES,
  ...LANE_A_M2_TEMPLATES,
  ...COMPLIANCE_VALIDATION_TEMPLATES,
];

export function formatSmokeTestName(templateId: string, title: string): string {
  return `[tpl:${templateId}] ${title}`;
}

export function parseSmokeTestTemplateId(testName: string): string | null {
  const match = testName.match(/^\[tpl:([^\]]+)\]\s/);
  return match?.[1] ?? null;
}

export function getGoLiveSmokeTemplate(templateId: string): GoLiveSmokeTestTemplate | undefined {
  return GO_LIVE_SMOKE_TEMPLATES.find((t) => t.templateId === templateId);
}

export function getGoLiveSmokeTemplates(
  groupIds?: GoLiveSmokeTemplateGroupId[],
): GoLiveSmokeTestTemplate[] {
  if (!groupIds || groupIds.length === 0) return GO_LIVE_SMOKE_TEMPLATES;
  const allowed = new Set(groupIds);
  return GO_LIVE_SMOKE_TEMPLATES.filter((t) => allowed.has(t.groupId));
}

export function displaySmokeTestTitle(testName: string): string {
  return testName.replace(/^\[tpl:[^\]]+\]\s*/, '');
}
