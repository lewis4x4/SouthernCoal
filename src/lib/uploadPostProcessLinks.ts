import { CATEGORY_BY_DB_KEY } from '@/lib/constants';

export interface UploadPostProcessFollowUp {
  href: string;
  actionLabel: string;
  panelNote: string;
}

const FOLLOW_UPS: Record<string, UploadPostProcessFollowUp> = {
  sampling_matrix: {
    href: '/field/schedule',
    actionLabel: 'Open Field Schedule',
    panelNote:
      'Calendar row import is manual until matrix parser ships — review scheduled events on Field Schedule.',
  },
  consent_decree: {
    href: '/obligations',
    actionLabel: 'Review obligations',
    panelNote: 'Link obligation evidence after counsel confirms CD appendix rates.',
  },
};

export function getUploadPostProcessFollowUp(fileCategory: string): UploadPostProcessFollowUp | null {
  return FOLLOW_UPS[fileCategory] ?? null;
}

export function getArchiveSuccessMessage(fileCategory: string, fileName: string): string {
  const label = CATEGORY_BY_DB_KEY[fileCategory]?.label ?? fileCategory;
  const followUp = getUploadPostProcessFollowUp(fileCategory);
  if (followUp) {
    return `Indexed ${fileName} (${label})`;
  }
  return `Indexed ${fileName} for search`;
}
