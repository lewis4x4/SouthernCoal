import { describe, it, expect } from 'vitest';
import {
  GO_LIVE_SMOKE_TEMPLATES,
  GO_LIVE_SMOKE_TEMPLATE_GROUPS,
  formatSmokeTestName,
  parseSmokeTestTemplateId,
  getGoLiveSmokeTemplate,
  getGoLiveSmokeTemplates,
  displaySmokeTestTitle,
} from '@/lib/goLiveSmokeTemplates';
import { UPLOAD_DASHBOARD_SMOKE_CHECKS } from '@/lib/uploadDashboardSmokeChecklist';

describe('goLiveSmokeTemplates', () => {
  it('includes all Upload Dashboard v6 §12 checks plus Lane A + compliance harness', () => {
    expect(GO_LIVE_SMOKE_TEMPLATES.length).toBe(UPLOAD_DASHBOARD_SMOKE_CHECKS.length + 5 + 1);
    expect(getGoLiveSmokeTemplates(['upload-dashboard-v6'])).toHaveLength(UPLOAD_DASHBOARD_SMOKE_CHECKS.length);
    expect(getGoLiveSmokeTemplates(['lane-a-m2'])).toHaveLength(5);
    expect(getGoLiveSmokeTemplates(['compliance-validation'])).toHaveLength(1);
  });

  it('uses unique template IDs and valid group metadata', () => {
    const ids = GO_LIVE_SMOKE_TEMPLATES.map((t) => t.templateId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of GO_LIVE_SMOKE_TEMPLATES) {
      expect(GO_LIVE_SMOKE_TEMPLATE_GROUPS[t.groupId]).toBeDefined();
      expect(t.manualSteps.length).toBeGreaterThan(0);
    }
  });

  it('round-trips template ID prefix in test names', () => {
    const formatted = formatSmokeTestName('upload-non_admin_upload', 'Non-admin upload test');
    expect(parseSmokeTestTemplateId(formatted)).toBe('upload-non_admin_upload');
    expect(displaySmokeTestTitle(formatted)).toBe('Non-admin upload test');
    expect(getGoLiveSmokeTemplate('upload-non_admin_upload')?.testName).toBe('Non-admin upload test');
  });

  it('maps each upload smoke check id to a template', () => {
    for (const check of UPLOAD_DASHBOARD_SMOKE_CHECKS) {
      expect(getGoLiveSmokeTemplate(`upload-${check.id}`)).toBeDefined();
    }
  });
});
