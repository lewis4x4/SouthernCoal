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
    <div className="min-h-screen flex flex-col px-4">
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            SCC Compliance Monitor
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Sign in to access the Upload Dashboard
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl space-y-4"
        >
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:border-status-queued/50 transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-text-secondary mb-1.5"
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
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:border-status-queued/50 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-status-failed">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-xl bg-status-queued/20 text-status-queued font-semibold text-sm border border-status-queued/20 hover:bg-status-queued/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
