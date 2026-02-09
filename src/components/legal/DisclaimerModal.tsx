import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { DISCLAIMER_FULL } from '@/lib/disclaimer';

interface DisclaimerModalProps {
  open: boolean;
  onClose: () => void;
}

export function DisclaimerModal({ open, onClose }: DisclaimerModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl max-h-[80vh] mx-4 rounded-2xl border border-white/[0.08] bg-crystal-surface/95 backdrop-blur-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="text-lg font-semibold text-text-primary">
            Software Disclaimer & Limitation of Liability
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-white/[0.05] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto max-h-[calc(80vh-64px)]">
          <pre className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary font-sans">
            {DISCLAIMER_FULL}
          </pre>
        </div>
      </div>
    </div>
  );
}
