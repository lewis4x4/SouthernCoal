import { toast } from 'sonner';
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
  dmr: {
    href: '/dmr',
    actionLabel: 'Open DMR Submissions',
    panelNote: 'Review draft submissions created from this import before regulatory submit.',
  },
  lab_data: {
    href: '/monitoring',
    actionLabel: 'Open Monitoring',
    panelNote: 'Review imported lab results and exceedances before relying on them for compliance decisions.',
  },
  npdes_permit: {
    href: '/monitoring',
    actionLabel: 'Open Monitoring',
    panelNote: 'Review imported permit limits and outfalls before using them for exceedance or DMR calculations.',
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

export function showPostProcessFollowUpToast(
  message: string,
  fileCategory: string,
  navigate: (path: string) => void,
  options?: { description?: string },
): void {
  const followUp = getUploadPostProcessFollowUp(fileCategory);
  if (followUp) {
    toast.success(message, {
      description: options?.description ?? followUp.panelNote,
      action: {
        label: followUp.actionLabel,
        onClick: () => navigate(followUp.href),
      },
    });
    return;
  }

  toast.success(message);
}

export function showArchiveSuccessToast(
  fileCategory: string,
  fileName: string,
  navigate: (path: string) => void,
): void {
  showPostProcessFollowUpToast(getArchiveSuccessMessage(fileCategory, fileName), fileCategory, navigate);
}
