import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { DisclaimerFooter } from '@/components/legal/DisclaimerFooter';

export function LoginPage() {
  const { signIn, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show session expired toast if redirected from auth failure
  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'session_expired') {
      toast.error('Your session has expired. Please sign in again.');
    } else if (reason === 'refresh_failed') {
      toast.error('Session refresh failed. Please sign in again.');
    }
  }, [searchParams]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !loading) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await signIn(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-text-muted border-t-status-queued rounded-full animate-spin" />
        </div>
        <DisclaimerFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-qo-canvas px-4">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-qo-accent font-mono text-[13px] font-semibold text-[#F4EFE6]">
            SC
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Site Command
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Sign in to the operations console
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-qo border border-black/[0.08] bg-white p-6"
        >
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="qo-input w-full"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-text-secondary"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="qo-input w-full"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-status-failed">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-qo-sm border border-qo-accent bg-qo-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-qo-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        </div>
      </div>
      <DisclaimerFooter />
    </div>
  );
}
