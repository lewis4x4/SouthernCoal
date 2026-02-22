import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { X, Plus } from 'lucide-react';

interface Props {
  reportDef: { id: string; report_key: string; title: string };
}

interface Recipient {
  id: string;
  email: string;
  source: string;
  is_active: boolean;
}

export function ReportRecipientsPanel({ reportDef }: Props) {
  const { log } = useAuditLog();
  const { user } = useAuth();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      const { data } = await supabase
        .from('report_delivery_recipients')
        .select('id, email, source, is_active')
        .eq('report_definition_id', reportDef.id)
        .order('email');
      setRecipients(data ?? []);
      setLoading(false);
    }
    fetch();
  }, [reportDef.id]);

  async function addRecipient() {
    const email = newEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid email address');
      return;
    }
    if (recipients.some((r) => r.email.toLowerCase() === email)) {
      toast.error('Email already added');
      return;
    }

    setAdding(true);
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('organization_id')
      .eq('id', user!.id)
      .single();

    const { data, error } = await supabase
      .from('report_delivery_recipients')
      .insert({
        organization_id: profile?.organization_id,
        report_definition_id: reportDef.id,
        email,
        added_by: user!.id,
        source: 'admin',
        is_active: true,
      })
      .select('id, email, source, is_active')
      .single();

    if (error) {
      toast.error(`Failed to add: ${error.message}`);
    } else if (data) {
      setRecipients((prev) => [...prev, data]);
      setNewEmail('');
      toast.success(`Added ${email}`);
      log('filter_change', {
        report_key: reportDef.report_key,
        action: 'add_report_recipient',
        email,
      });
    }
    setAdding(false);
  }

  async function removeRecipient(id: string, email: string) {
    const { error } = await supabase
      .from('report_delivery_recipients')
      .delete()
      .eq('id', id);
    if (error) {
      toast.error(`Failed to remove: ${error.message}`);
    } else {
      setRecipients((prev) => prev.filter((r) => r.id !== id));
      toast.success(`Removed ${email}`);
      log('filter_change', {
        report_key: reportDef.report_key,
        action: 'remove_report_recipient',
        email,
      });
    }
  }

  async function toggleActive(id: string, currentActive: boolean) {
    const { error } = await supabase
      .from('report_delivery_recipients')
      .update({ is_active: !currentActive })
      .eq('id', id);
    if (error) {
      toast.error(`Failed to update: ${error.message}`);
    } else {
      setRecipients((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_active: !currentActive } : r))
      );
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-text-primary">Email Recipients</h4>
        <p className="text-xs text-text-muted mt-1">
          Who receives this report when generated with email delivery.
        </p>
      </div>

      {/* Add new */}
      <div className="flex gap-2">
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addRecipient()}
          placeholder="email@example.com"
          className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-green-500/40"
        />
        <button
          onClick={addRecipient}
          disabled={adding}
          className="rounded-lg bg-green-500/20 px-3 py-2 text-xs font-semibold text-green-300 hover:bg-green-500/30 transition-colors disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* List */}
      {recipients.length === 0 ? (
        <p className="text-xs text-text-muted py-4 text-center">No recipients configured yet.</p>
      ) : (
        <div className="space-y-1.5">
          {recipients.map((r) => (
            <div
              key={r.id}
              className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-all ${
                r.is_active
                  ? 'bg-white/[0.02] border-white/[0.06]'
                  : 'bg-white/[0.01] border-white/[0.04] opacity-50'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => toggleActive(r.id, r.is_active)}
                  className={`h-3.5 w-3.5 rounded border-2 shrink-0 flex items-center justify-center transition-all ${
                    r.is_active ? 'bg-green-500 border-green-500' : 'border-white/20'
                  }`}
                >
                  {r.is_active && (
                    <svg className="h-2 w-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <span className="text-xs text-text-secondary truncate">{r.email}</span>
                <span className="text-[9px] uppercase tracking-wider text-text-muted shrink-0">
                  {r.source}
                </span>
              </div>
              <button
                onClick={() => removeRecipient(r.id, r.email)}
                className="rounded p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-text-muted">
        {recipients.length} recipient{recipients.length !== 1 ? 's' : ''} &middot;
        {recipients.filter((r) => r.is_active).length} active
      </p>
    </div>
  );
}
