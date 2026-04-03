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
        description: 'A newer build of SCC Monitor is ready. Reload to switch to the latest release.',
        action: {
          label: 'Reload now',
          onClick: () => void updateSW?.(true),
        },
        duration: 120_000,
        style: {
          background:
            'linear-gradient(135deg, rgba(8, 24, 44, 0.98), rgba(14, 58, 94, 0.96))',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(56, 189, 248, 0.42)',
          boxShadow:
            '0 18px 48px rgba(8, 145, 178, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
          color: '#f8fafc',
          fontFamily: 'Satoshi, system-ui, sans-serif',
        },
        classNames: {
          title: '!text-slate-50 !font-semibold !tracking-[0.01em]',
          description: '!text-cyan-50/90',
          actionButton:
            '!bg-cyan-300 !text-slate-950 !font-semibold !border !border-cyan-100/40 hover:!bg-cyan-200',
        },
      });
    },
  });
}
