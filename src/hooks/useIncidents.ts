import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type {
  Incident,
  IncidentEvent,
  IncidentType,
  IncidentSeverity,
  IncidentStatus,
} from '@/types/incidents';

export function useIncidents() {
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentTypes, setIncidentTypes] = useState<IncidentType[]>([]);
  const [loading, setLoading] = useState(true);

  const orgId = profile?.organization_id ?? null;

  const fetchIncidentTypes = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('incident_types')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('category', { ascending: true });

    if (error) {
      console.error('[incidents] types fetch failed:', error.message);
      return;
    }
    setIncidentTypes((data ?? []) as IncidentType[]);
  }, [orgId]);

  const fetchIncidents = useCallback(async (statusFilter?: IncidentStatus[]) => {
    if (!orgId) return;

    let q = supabase
      .from('incidents')
      .select('*')
      .eq('organization_id', orgId)
      .order('reported_at', { ascending: false })
      .limit(100);

    if (statusFilter?.length) {
      q = q.in('status', statusFilter);
    }

    const { data, error } = await q;
    if (error) {
      console.error('[incidents] fetch failed:', error.message);
      return;
    }
    setIncidents((data ?? []) as Incident[]);
  }, [orgId]);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    Promise.all([fetchIncidentTypes(), fetchIncidents()]).then(() => setLoading(false));
  }, [fetchIncidentTypes, fetchIncidents, orgId]);

  // Realtime subscription for new incidents
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`incidents:${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incidents',
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setIncidents((prev) => [payload.new as Incident, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setIncidents((prev) =>
              prev.map((i) => (i.id === (payload.new as Incident).id ? (payload.new as Incident) : i)),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  const createIncident = useCallback(
    async (params: {
      typeCode: string;
      title: string;
      description?: string;
      severity?: IncidentSeverity;
      fieldVisitId?: string;
      decreeParagraphs?: string[];
    }) => {
      const { data, error } = await supabase.rpc('create_incident', {
        p_incident_type_code: params.typeCode,
        p_title: params.title,
        p_description: params.description ?? null,
        p_severity: params.severity ?? null,
        p_field_visit_id: params.fieldVisitId ?? null,
        p_decree_paragraphs: params.decreeParagraphs ?? [],
      });

      if (error) {
        toast.error(`Failed to create incident: ${error.message}`);
        return null;
      }

      log('incident_created', {
        type_code: params.typeCode,
        title: params.title,
      }, {
        module: 'incidents',
        tableName: 'incidents',
        recordId: data as string,
      });

      toast.success('Incident created');
      fetchIncidents();
      return data as string;
    },
    [log, fetchIncidents],
  );

  const escalateIncident = useCallback(
    async (incidentId: string, notes?: string) => {
      const { error } = await supabase.rpc('escalate_incident', {
        p_incident_id: incidentId,
        p_notes: notes ?? null,
      });

      if (error) {
        toast.error(`Escalation failed: ${error.message}`);
        return { error: error.message };
      }

      log('incident_escalated', { incident_id: incidentId }, {
        module: 'incidents',
        tableName: 'incidents',
        recordId: incidentId,
      });

      toast.success('Incident escalated');
      fetchIncidents();
      return { error: null };
    },
    [log, fetchIncidents],
  );

  const resolveIncident = useCallback(
    async (incidentId: string, resolutionNotes: string, status?: IncidentStatus) => {
      const { error } = await supabase.rpc('resolve_incident', {
        p_incident_id: incidentId,
        p_resolution_notes: resolutionNotes,
        p_status: status ?? 'closed',
      });

      if (error) {
        toast.error(`Resolution failed: ${error.message}`);
        return { error: error.message };
      }

      log('incident_resolved', { incident_id: incidentId }, {
        module: 'incidents',
        tableName: 'incidents',
        recordId: incidentId,
      });

      toast.success('Incident resolved');
      fetchIncidents();
      return { error: null };
    },
    [log, fetchIncidents],
  );

  const fetchEvents = useCallback(
    async (incidentId: string): Promise<IncidentEvent[]> => {
      const { data, error } = await supabase
        .from('incident_events')
        .select('*')
        .eq('incident_id', incidentId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[incidents] events fetch failed:', error.message);
        return [];
      }
      return (data ?? []) as IncidentEvent[];
    },
    [],
  );

  const getTypeByCode = useCallback(
    (code: string) => incidentTypes.find((t) => t.code === code) ?? null,
    [incidentTypes],
  );

  return {
    incidents,
    incidentTypes,
    loading,
    createIncident,
    escalateIncident,
    resolveIncident,
    fetchEvents,
    getTypeByCode,
    refresh: () => Promise.all([fetchIncidentTypes(), fetchIncidents()]),
  };
}
