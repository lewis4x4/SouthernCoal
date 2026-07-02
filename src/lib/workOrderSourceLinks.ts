import type { WorkOrderSourceType } from '@/types/database';

export const WORK_ORDER_SOURCE_LABELS: Record<WorkOrderSourceType, string> = {
  field_deficiency: 'Field deficiency',
  inspection: 'Inspection',
  incident: 'Incident',
  exceedance: 'Exceedance',
  manual: 'Manual',
  sampling_gap: 'Sampling gap detector',
  edd_paragraph49: 'CD ¶49 EDD',
  msha_abatement: 'MSHA abatement',
  equipment_maintenance: 'Equipment PM',
};

export function getWorkOrderSourceLink(
  sourceType: WorkOrderSourceType | string,
  sourceId: string | null,
): { label: string; href: string } | null {
  if (!sourceId) {
    switch (sourceType) {
      case 'msha_abatement':
        return { label: 'MSHA coverage panel', href: '/compliance/external-data' };
      case 'equipment_maintenance':
        return { label: 'Equipment admin', href: '/admin/equipment' };
      default:
        return null;
    }
  }

  switch (sourceType) {
    case 'sampling_gap':
      return {
        label: 'View sampling gap',
        href: `/compliance/missed-at-risk?gapId=${sourceId}`,
      };
    case 'edd_paragraph49':
      return {
        label: 'View EDD evaluation',
        href: `/compliance/late-incomplete-edd?evalId=${sourceId}`,
      };
    case 'msha_abatement':
      return { label: 'MSHA coverage panel', href: '/compliance/external-data' };
    case 'equipment_maintenance':
      return { label: 'Equipment admin', href: '/admin/equipment' };
    default:
      return null;
  }
}
