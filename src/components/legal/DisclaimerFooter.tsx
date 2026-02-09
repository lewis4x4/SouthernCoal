import { useState } from 'react';
import { DISCLAIMER_SHORT } from '@/lib/disclaimer';
import { DisclaimerModal } from './DisclaimerModal';

export function DisclaimerFooter() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <footer className="px-6 py-4 border-t border-white/[0.04]">
        <p className="text-[11px] leading-relaxed text-text-muted max-w-5xl">
          {DISCLAIMER_SHORT}{' '}
          <button
            onClick={() => setModalOpen(true)}
            className="underline hover:text-text-secondary transition-colors"
          >
            Full Disclaimer
          </button>
        </p>
      </footer>
      <DisclaimerModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
