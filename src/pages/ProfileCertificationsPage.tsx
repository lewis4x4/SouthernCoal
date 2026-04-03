import { useEffect, useState } from 'react';
import { Award, ShieldCheck, ShieldX, Clock, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { useTraining } from '@/hooks/useTraining';
import { COMPLETION_STATUS_COLORS } from '@/types/training';
import type { TrainingReadinessResult } from '@/types/training';

export function ProfileCertificationsPage() {
  const { user } = useAuth();
  const { catalog, completions, loading, checkUserReadiness } = useTraining();
  const [readiness, setReadiness] = useState<TrainingReadinessResult[]>([]);
  const [readinessLoading, setReadinessLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    checkUserReadiness(user.id).then((results) => {
      setReadiness(results);
      setReadinessLoading(false);
    });
  }, [user?.id, checkUserReadiness]);

  const myCompletions = completions.filter((c) => c.user_id === user?.id);
  const blockingFailing = readiness.filter((r) => r.is_blocking && !r.is_met);
  const expiringSoon = readiness.filter(
    (r) => r.is_met && r.days_until_expiry !== null && r.days_until_expiry <= 30,
  );

  if (loading || readinessLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="inline-flex rounded-xl bg-purple-500/10 p-2.5">
          <Award className="h-6 w-6 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            My Certifications
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Your training completions, certification status, and dispatch readiness.
          </p>
        </div>
      </div>

      {/* Readiness summary */}
      <div className={cn(
        'rounded-xl border p-4',
        blockingFailing.length > 0
          ? 'border-red-500/20 bg-red-500/[0.03]'
          : 'border-emerald-500/20 bg-emerald-500/[0.03]',
      )}>
        <div className="flex items-center gap-2">
          {blockingFailing.length > 0 ? (
            <>
              <ShieldX size={20} className="text-red-400" />
              <span className="text-sm font-medium text-red-300">
                {blockingFailing.length} required training{blockingFailing.length !== 1 ? 's' : ''} incomplete — dispatch may be blocked
              </span>
            </>
          ) : (
            <>
              <ShieldCheck size={20} className="text-emerald-400" />
              <span className="text-sm font-medium text-emerald-300">
                All required training is current
              </span>
            </>
          )}
        </div>

        {/* Expiring soon warnings */}
        {expiringSoon.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {expiringSoon.map((r) => (
              <div key={r.requirement_id} className="flex items-center gap-2 text-xs text-amber-400">
                <Clock size={12} />
                <span>
                  <strong>{r.training_name}</strong> expires in {r.days_until_expiry} days
                  {r.expires_at && ` (${new Date(r.expires_at).toLocaleDateString()})`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Required training status */}
      {readiness.length > 0 && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          <div className="border-b border-white/[0.06] px-5 py-3">
            <h3 className="text-sm font-semibold text-text-primary">Required Training</h3>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {readiness.map((r) => (
              <div key={r.requirement_id} className="flex items-center gap-3 px-5 py-3">
                {r.is_met ? (
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                ) : (
                  <ShieldX size={16} className="text-red-400 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-text-primary">{r.training_name}</span>
                  {r.is_blocking && !r.is_met && (
                    <span className="ml-2 inline-flex rounded-full bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-red-400">
                      Blocking
                    </span>
                  )}
                </div>
                <div className="text-right">
                  {r.is_met ? (
                    r.expires_at ? (
                      <span className={cn(
                        'text-xs',
                        r.days_until_expiry !== null && r.days_until_expiry <= 30
                          ? 'text-amber-400'
                          : 'text-text-muted',
                      )}>
                        Expires {new Date(r.expires_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-xs text-emerald-400">No expiration</span>
                    )
                  ) : (
                    <span className="text-xs text-red-400">Not completed</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My completions */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02]">
        <div className="border-b border-white/[0.06] px-5 py-3">
          <h3 className="text-sm font-semibold text-text-primary">
            Completion History
            <span className="ml-2 text-xs font-normal text-text-muted">
              {myCompletions.length} record{myCompletions.length !== 1 ? 's' : ''}
            </span>
          </h3>
        </div>
        {myCompletions.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-text-muted">
            No training completions recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {myCompletions.map((comp) => {
              const training = catalog.find((c) => c.id === comp.training_id);
              const colors = COMPLETION_STATUS_COLORS[comp.status];
              return (
                <div key={comp.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-text-primary">
                      {training?.name ?? 'Unknown'}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn(
                        'inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase border',
                        colors.bg, colors.border, colors.text,
                      )}>
                        {comp.status.replace('_', ' ')}
                      </span>
                      <span className="text-[11px] text-text-muted">
                        {new Date(comp.completed_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {comp.certificate_file_name && (
                    <span className="text-[11px] text-text-muted truncate max-w-32">
                      {comp.certificate_file_name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProfileCertificationsPage;
