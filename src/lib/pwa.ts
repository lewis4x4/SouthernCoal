import { toast } from 'sonner';
import { registerSW } from 'virtual:pwa-register';

export function registerAppServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  if (!import.meta.env.PROD) {
    return;
  }

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast.message('Update ready', {
        description: 'A newer version of SCC Monitor is available.',
        action: {
          label: 'Reload',
          onClick: () => void updateSW?.(true),
        },
        duration: 120_000,
      });
    },
  });
}
