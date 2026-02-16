import { useState, useCallback, useEffect, useRef } from 'react';
import { X, ShieldCheck, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { GlassButton } from '@/components/ui/GlassButton';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface CorrectiveActionSignatureProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  type: 'responsible' | 'approver' | null;
}

/**
 * Digital signature modal with password confirmation.
 * NOT a drawn signature — uses password verification to confirm identity.
 */
export function CorrectiveActionSignature({
  open,
  onClose,
  onConfirm,
  type,
}: CorrectiveActionSignatureProps) {
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setPassword('');
      setError(null);
      // Focus input after modal animates
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!user?.email || !password) {
        setError('Please enter your password');
        return;
      }

      setVerifying(true);
      setError(null);

      try {
        // Verify password by attempting to sign in
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password,
        });

        if (authError) {
          setError('Invalid password. Please try again.');
          setVerifying(false);
          return;
        }

        // Password verified — proceed with signature
        await onConfirm();
      } catch (err) {
        console.error('Signature verification error:', err);
        setError('Verification failed. Please try again.');
      } finally {
        setVerifying(false);
      }
    },
    [user?.email, password, onConfirm]
  );

  if (!open || !type) return null;

  const title =
    type === 'responsible'
      ? 'Sign as Responsible Person'
      : 'Sign as Approver';

  const description =
    type === 'responsible'
      ? 'By signing, you confirm that you are responsible for the completion of this corrective action and that all information provided is accurate.'
      : 'By signing, you approve this corrective action and confirm that it has been properly reviewed and verified.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-surface-elevated border border-white/[0.08] rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              <ShieldCheck className="h-5 w-5 text-cyan-400" />
            </div>
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-white/[0.05] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <p className="text-sm text-text-secondary leading-relaxed">
            {description}
          </p>

          {/* Signature acknowledgment */}
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-text-secondary">
                <p className="font-medium text-amber-400 mb-1">
                  Legal Acknowledgment
                </p>
                <p>
                  This digital signature is legally binding. Your name, user ID,
                  and timestamp will be recorded in the audit trail.
                </p>
              </div>
            </div>
          </div>

          {/* Password input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-secondary">
              Enter your password to confirm
            </label>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className={cn(
                'w-full rounded-lg border px-4 py-3 text-sm transition-colors',
                'bg-white/[0.02] border-white/[0.08]',
                'text-text-primary placeholder:text-text-muted',
                'focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20',
                error && 'border-red-500/40 focus:border-red-500/40 focus:ring-red-500/20'
              )}
            />
            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
          </div>

          {/* User info */}
          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div className="text-xs text-text-muted">Signing as</div>
            <div className="text-sm text-text-primary font-medium">
              {user?.email}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <GlassButton
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={verifying}
            >
              Cancel
            </GlassButton>
            <GlassButton
              type="submit"
              variant="primary"
              loading={verifying ? 'Verifying...' : undefined}
              disabled={!password || verifying}
            >
              Sign Document
            </GlassButton>
          </div>
        </form>
      </div>
    </div>
  );
}
