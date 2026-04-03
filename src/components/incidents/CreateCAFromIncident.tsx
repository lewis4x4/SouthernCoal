import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type { Incident } from '@/types/incidents';

interface CreateCAFromIncidentProps {
  incident: Incident;
  onCreated?: (caId: string) => void;
}

/**
 * Button + inline form to manually create a CA from an incident.
 * Uses the create_ca_from_incident RPC for org-scoped, authorized creation.
 */
export function CreateCAFromIncident({ incident, onCreated }: CreateCAFromIncidentProps) {
  const navigate = useNavigate();
  const { log } = useAuditLog();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('');
  const [creating, setCreating] = useState(false);

  const hasLinkedCA = !!incident.corrective_action_id;

  async function handleCreate() {
    setCreating(true);
    const { data, error } = await supabase.rpc('create_ca_from_incident', {
      p_incident_id: incident.id,
      p_title: title.trim() || null,
      p_priority: priority || null,
    });

    if (error) {
      toast.error(`Failed to create CA: ${error.message}`);
      setCreating(false);
      return;
    }

    const caId = data as string;

    log('corrective_action_created', {
      source: 'incident',
      incident_id: incident.id,
      ca_id: caId,
    }, {
      module: 'corrective_actions',
      tableName: 'corrective_actions',
      recordId: caId,
    });

    toast.success('Corrective Action created');
    setShowForm(false);
    setTitle('');
    setPriority('');
    setCreating(false);
    onCreated?.(caId);
  }

  // Already has linked CA — show link instead
  if (hasLinkedCA) {
    return (
      <button
        onClick={() => navigate(`/corrective-actions/${incident.corrective_action_id}`)}
        className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/20 transition-colors"
      >
        <ExternalLink size={14} />
        View Linked CA
      </button>
    );
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/20 transition-colors"
      >
        <ClipboardCheck size={14} />
        Create Corrective Action
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4 space-y-3">
      <h4 className="text-sm font-semibold text-text-primary">Create Corrective Action</h4>
      <p className="text-xs text-text-muted">
        A CA will be created linked to this incident. Leave fields blank to use defaults from the incident.
      </p>

      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">
          Title (optional override)
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`Incident: ${incident.title}`}
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-cyan-400/30"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">
          Priority (optional override)
        </label>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none focus:border-cyan-400/30"
          aria-label="CA priority"
        >
          <option value="">Use incident severity ({incident.severity})</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-1.5 rounded-lg bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50 transition-colors"
        >
          {creating ? 'Creating...' : 'Create CA'}
        </button>
        <button
          onClick={() => { setShowForm(false); setTitle(''); setPriority(''); }}
          className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
