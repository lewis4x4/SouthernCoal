import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const PRESET_SCHEDULES = [
  { label: 'Every Monday 7 AM ET', cron: '0 7 * * 1' },
  { label: '1st of Month 6 AM ET', cron: '0 6 1 * *' },
  { label: 'Daily 6 AM ET', cron: '0 6 * * *' },
  { label: 'Quarterly (Jan/Apr/Jul/Oct 30th)', cron: '0 6 30 1,4,7,10 *' },
  { label: 'Custom', cron: '' },
] as const;

interface Props {
  reportDef: { id: string; report_key: string; title: string };
}

interface Schedule {
  id: string;
  cron_expression: string;
  timezone: string;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
}

export function ReportSchedulePanel({ reportDef }: Props) {
  const { log } = useAuditLog();
  const { user } = useAuth();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cronExpr, setCronExpr] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      const { data } = await supabase
        .from('scheduled_reports')
        .select('id, cron_expression, timezone, is_active, last_run_at, next_run_at')
        .eq('report_definition_id', reportDef.id)
        .limit(1)
        .maybeSingle();
      if (data) {
        setSchedule(data);
        setCronExpr(data.cron_expression);
        setTimezone(data.timezone);
        setIsActive(data.is_active);
      } else {
        setSchedule(null);
        setCronExpr('0 7 * * 1');
        setTimezone('America/New_York');
        setIsActive(false);
      }
      setLoading(false);
    }
    fetch();
  }, [reportDef.id]);

  async function save() {
    if (!cronExpr.trim()) {
      toast.error('Cron expression is required');
      return;
    }
    setSaving(true);

    // Get user's org
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', user!.id)
      .single();

    if (schedule) {
      // Update existing
      const { error } = await supabase
        .from('scheduled_reports')
        .update({ cron_expression: cronExpr, timezone, is_active: isActive })
        .eq('id', schedule.id);
      if (error) {
        toast.error(`Failed to update schedule: ${error.message}`);
      } else {
        toast.success('Schedule updated');
        setSchedule((prev) => prev ? { ...prev, cron_expression: cronExpr, timezone, is_active: isActive } : null);
        log('filter_change', {
          report_key: reportDef.report_key,
          action: 'update_report_schedule',
          cron: cronExpr,
          active: isActive,
        });
      }
    } else {
      // Create new
      const { data, error } = await supabase
        .from('scheduled_reports')
        .insert({
          organization_id: profile?.organization_id,
          report_definition_id: reportDef.id,
          report_config: {},
          cron_expression: cronExpr,
          timezone,
          is_active: isActive,
          created_by: user!.id,
          next_run_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .select('id, cron_expression, timezone, is_active, last_run_at, next_run_at')
        .single();
      if (error) {
        toast.error(`Failed to create schedule: ${error.message}`);
      } else if (data) {
        toast.success('Schedule created');
        setSchedule(data);
        log('filter_change', {
          report_key: reportDef.report_key,
          action: 'create_report_schedule',
          cron: cronExpr,
          active: isActive,
        });
      }
    }
    setSaving(false);
  }

  async function deleteSchedule() {
    if (!schedule) return;
    setSaving(true);
    const { error } = await supabase
      .from('scheduled_reports')
      .delete()
      .eq('id', schedule.id);
    if (error) {
      toast.error(`Failed to delete: ${error.message}`);
    } else {
      toast.success('Schedule deleted');
      setSchedule(null);
      setCronExpr('0 7 * * 1');
      setIsActive(false);
      log('filter_change', {
        report_key: reportDef.report_key,
        action: 'delete_report_schedule',
      });
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-semibold text-text-primary">Report Schedule</h4>
        <p className="text-xs text-text-muted mt-1">
          Configure automated generation using cron expressions.
        </p>
      </div>

      {/* Active toggle */}
      <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
        <span className="text-xs font-medium text-text-secondary">Active</span>
        <button
          onClick={() => setIsActive(!isActive)}
          className={`relative h-5 w-9 rounded-full transition-colors ${
            isActive ? 'bg-green-500' : 'bg-white/10'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
              isActive ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Preset selector */}
      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider text-text-muted">Quick Select</label>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESET_SCHEDULES.map((preset) => (
            <button
              key={preset.label}
              onClick={() => preset.cron && setCronExpr(preset.cron)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] transition-all border ${
                cronExpr === preset.cron
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                  : 'bg-white/[0.02] border-white/[0.06] text-text-muted hover:border-white/[0.1]'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cron expression */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-text-muted">Cron Expression</label>
        <input
          type="text"
          value={cronExpr}
          onChange={(e) => setCronExpr(e.target.value)}
          placeholder="0 7 * * 1"
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-amber-500/40"
        />
        <p className="text-[10px] text-text-muted">min hour day month weekday</p>
      </div>

      {/* Timezone */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-text-muted">Timezone</label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-amber-500/40"
        >
          <option value="America/New_York">Eastern (ET)</option>
          <option value="America/Chicago">Central (CT)</option>
          <option value="America/Denver">Mountain (MT)</option>
          <option value="America/Los_Angeles">Pacific (PT)</option>
          <option value="UTC">UTC</option>
        </select>
      </div>

      {/* Last/Next run info */}
      {schedule && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Last run</span>
            <span className="text-text-secondary font-mono">
              {schedule.last_run_at ? new Date(schedule.last_run_at).toLocaleString() : 'Never'}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Next run</span>
            <span className="text-text-secondary font-mono">
              {schedule.next_run_at ? new Date(schedule.next_run_at).toLocaleString() : 'Not set'}
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 rounded-lg bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : schedule ? 'Update Schedule' : 'Create Schedule'}
        </button>
        {schedule && (
          <button
            onClick={deleteSchedule}
            disabled={saving}
            className="rounded-lg bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
