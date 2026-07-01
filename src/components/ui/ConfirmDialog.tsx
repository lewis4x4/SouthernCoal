import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { GlassButton } from './GlassButton';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'warning' | 'danger' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANT_COLORS = {
  warning: 'text-qo-ochre-text',
  danger: 'text-qo-risk',
  info: 'text-blue-400',
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'warning',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60  z-[100]"
            onClick={onCancel}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-[101]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-crystal-surface rounded-xl border border-black/[0.08] shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.08]">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-black/[0.03] ${VARIANT_COLORS[variant]}`}>
                    <AlertTriangle size={18} />
                  </div>
                  <h3 className="text-base font-semibold text-text-primary">{title}</h3>
                </div>
                <button
                  onClick={onCancel}
                  className="p-1.5 rounded-lg hover:bg-black/[0.04] transition-colors"
                  aria-label="Close dialog"
                >
                  <X size={16} className="text-text-muted" />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4">
                <p className="text-sm text-text-secondary leading-relaxed">{message}</p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-black/[0.08] bg-qo-nested">
                <GlassButton variant="ghost" onClick={onCancel}>
                  {cancelLabel}
                </GlassButton>
                <GlassButton
                  variant={variant === 'danger' ? 'danger' : 'primary'}
                  onClick={onConfirm}
                >
                  {confirmLabel}
                </GlassButton>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
