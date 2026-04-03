import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type {
  EmergencyContact,
  EmergencyContactRole,
  ContactAvailability,
  EmergencyProcedure,
  EmergencyIncidentType,
  ProcedureSeverityLevel,
  ProcedureStep,
} from '@/types/database';

// ---------------------------------------------------------------------------
// Emergency Contacts
// ---------------------------------------------------------------------------

interface CreateContactInput {
  contact_name: string;
  contact_role: EmergencyContactRole;
  organization_name?: string;
  phone_primary?: string;
  phone_secondary?: string;
  email?: string;
  availability?: ContactAvailability;
  availability_notes?: string;
  is_primary?: boolean;
  state_code?: string;
  site_id?: string;
}

// ---------------------------------------------------------------------------
// Emergency Procedures
// ---------------------------------------------------------------------------

interface CreateProcedureInput {
  title: string;
  incident_type: EmergencyIncidentType;
  severity_level?: ProcedureSeverityLevel;
  description?: string;
  steps?: ProcedureStep[];
  notification_chain?: Record<string, unknown>[];
  responsible_roles?: string[];
  decree_paragraphs?: string[];
  regulatory_requirements?: string;
  reporting_deadlines?: string;
  state_code?: string;
  site_id?: string;
}

const CONTACT_ROLE_LABELS: Record<EmergencyContactRole, string> = {
  epa_coordinator: 'EPA Coordinator',
  state_dep_contact: 'State DEP Contact',
  legal_counsel: 'Legal Counsel',
  environmental_consultant: 'Environmental Consultant',
  lab_contact: 'Lab Contact',
  contractor: 'Contractor',
  site_manager: 'Site Manager',
  safety_officer: 'Safety Officer',
  emergency_responder: 'Emergency Responder',
  regulatory_liaison: 'Regulatory Liaison',
  media_contact: 'Media Contact',
  other: 'Other',
};

const INCIDENT_TYPE_LABELS: Record<EmergencyIncidentType, string> = {
  spill: 'Spill',
  unauthorized_discharge: 'Unauthorized Discharge',
  equipment_failure: 'Equipment Failure',
  sampling_failure: 'Sampling Failure',
  data_loss: 'Data Loss',
  permit_exceedance: 'Permit Exceedance',
  weather_event: 'Weather Event',
  site_emergency: 'Site Emergency',
  regulatory_inspection: 'Regulatory Inspection',
  media_inquiry: 'Media Inquiry',
  other: 'Other',
};

const SEVERITY_LABELS: Record<ProcedureSeverityLevel, string> = {
  all: 'All Levels',
  minor: 'Minor',
  moderate: 'Moderate',
  major: 'Major',
  critical: 'Critical',
};

export {
  CONTACT_ROLE_LABELS,
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
};

export function useEmergencyProcedures() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const orgId = profile?.organization_id ?? null;

  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [procedures, setProcedures] = useState<EmergencyProcedure[]>([]);
  const [loading, setLoading] = useState(true);

  // -- Contacts --

  const fetchContacts = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('emergency_contacts')
      .select('*')
      .eq('organization_id', orgId)
      .order('is_primary', { ascending: false })
      .order('contact_name');

    if (error) {
      console.error('[emergency] contacts fetch error:', error.message);
    } else {
      setContacts((data ?? []) as EmergencyContact[]);
    }
  }, [orgId]);

  const createContact = useCallback(async (input: CreateContactInput) => {
    if (!orgId || !user) return;
    const { error } = await supabase.from('emergency_contacts').insert({
      organization_id: orgId,
      created_by: user.id,
      ...input,
    });
    if (error) {
      toast.error('Failed to create contact');
      console.error('[emergency] create contact error:', error.message);
      return;
    }
    toast.success('Emergency contact created');
    log('emergency_contact_created', { name: input.contact_name }, { module: 'emergency', tableName: 'emergency_contacts' });
    fetchContacts();
  }, [orgId, user, fetchContacts, log]);

  const updateContact = useCallback(async (id: string, updates: Partial<EmergencyContact>) => {
    const { error } = await supabase.from('emergency_contacts').update(updates).eq('id', id);
    if (error) {
      toast.error('Failed to update contact');
      return;
    }
    toast.success('Contact updated');
    log('emergency_contact_updated', { id }, { module: 'emergency', tableName: 'emergency_contacts', recordId: id });
    fetchContacts();
  }, [fetchContacts, log]);

  const deleteContact = useCallback(async (id: string) => {
    const { error } = await supabase.from('emergency_contacts').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete contact');
      return;
    }
    toast.success('Contact deleted');
    log('emergency_contact_deleted', { id }, { module: 'emergency', tableName: 'emergency_contacts', recordId: id });
    fetchContacts();
  }, [fetchContacts, log]);

  // -- Procedures --

  const fetchProcedures = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('emergency_procedures')
      .select('*')
      .eq('organization_id', orgId)
      .order('incident_type')
      .order('severity_level');

    if (error) {
      console.error('[emergency] procedures fetch error:', error.message);
    } else {
      setProcedures((data ?? []) as EmergencyProcedure[]);
    }
  }, [orgId]);

  const createProcedure = useCallback(async (input: CreateProcedureInput) => {
    if (!orgId || !user) return;
    const { error } = await supabase.from('emergency_procedures').insert({
      organization_id: orgId,
      created_by: user.id,
      ...input,
    });
    if (error) {
      toast.error('Failed to create procedure');
      console.error('[emergency] create procedure error:', error.message);
      return;
    }
    toast.success('Emergency procedure created');
    log('emergency_procedure_created', { title: input.title }, { module: 'emergency', tableName: 'emergency_procedures' });
    fetchProcedures();
  }, [orgId, user, fetchProcedures, log]);

  const updateProcedure = useCallback(async (id: string, updates: Partial<EmergencyProcedure>) => {
    const { error } = await supabase.from('emergency_procedures').update(updates).eq('id', id);
    if (error) {
      toast.error('Failed to update procedure');
      return;
    }
    toast.success('Procedure updated');
    log('emergency_procedure_updated', { id }, { module: 'emergency', tableName: 'emergency_procedures', recordId: id });
    fetchProcedures();
  }, [fetchProcedures, log]);

  const reviewProcedure = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from('emergency_procedures').update({
      last_reviewed_at: new Date().toISOString(),
      last_reviewed_by: user.id,
    }).eq('id', id);
    if (error) {
      toast.error('Failed to mark as reviewed');
      return;
    }
    toast.success('Procedure marked as reviewed');
    log('emergency_procedure_reviewed', { id }, { module: 'emergency', tableName: 'emergency_procedures', recordId: id });
    fetchProcedures();
  }, [user, fetchProcedures, log]);

  // -- Init --

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    Promise.all([fetchContacts(), fetchProcedures()]).finally(() => setLoading(false));
  }, [orgId, fetchContacts, fetchProcedures]);

  // -- Realtime --

  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel('emergency-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'emergency_contacts',
        filter: `organization_id=eq.${orgId}`,
      }, () => fetchContacts())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'emergency_procedures',
        filter: `organization_id=eq.${orgId}`,
      }, () => fetchProcedures())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId, fetchContacts, fetchProcedures]);

  return {
    contacts,
    procedures,
    loading,
    // Contacts
    createContact,
    updateContact,
    deleteContact,
    fetchContacts,
    // Procedures
    createProcedure,
    updateProcedure,
    reviewProcedure,
    fetchProcedures,
  };
}
