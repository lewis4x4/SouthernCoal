import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';
import type {
  StateRegulatoryConfig,
  RegulatoryContact,
  StateRegulatoryConfigUpdate,
  RegulatoryContactInput,
  SccStateCode,
} from '@/types/stateRegulatory';

export function useStateRegulatoryConfig() {
  const { log } = useAuditLog();
  const [configs, setConfigs] = useState<StateRegulatoryConfig[]>([]);
  const [contacts, setContacts] = useState<RegulatoryContact[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConfigs = useCallback(async () => {
    const { data, error } = await supabase
      .from('state_regulatory_configs')
      .select('*, states(id, code, name)')
      .order('states(code)', { ascending: true });

    if (error) {
      console.error('[stateRegulatory] config fetch failed:', error.message);
      toast.error('Failed to load state regulatory configs');
      return;
    }

    setConfigs((data ?? []) as StateRegulatoryConfig[]);
  }, []);

  const fetchContacts = useCallback(async () => {
    const { data, error } = await supabase
      .from('regulatory_contacts')
      .select('*')
      .eq('is_active', true)
      .order('agency', { ascending: true });

    if (error) {
      console.error('[stateRegulatory] contacts fetch failed:', error.message);
      toast.error('Failed to load regulatory contacts');
      return;
    }

    setContacts((data ?? []) as RegulatoryContact[]);
  }, []);

  useEffect(() => {
    Promise.all([fetchConfigs(), fetchContacts()]).finally(() => setLoading(false));
  }, [fetchConfigs, fetchContacts]);

  const getConfigByStateCode = useCallback(
    (code: SccStateCode) =>
      configs.find((c) => c.states?.code === code) ?? null,
    [configs],
  );

  const getContactsByStateId = useCallback(
    (stateId: string) => contacts.filter((c) => c.state_id === stateId),
    [contacts],
  );

  const updateConfig = useCallback(
    async (configId: string, updates: StateRegulatoryConfigUpdate, stateCode: string) => {
      const existing = configs.find((c) => c.id === configId);
      if (!existing) return { error: 'Config not found' };

      const { error } = await supabase
        .from('state_regulatory_configs')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', configId);

      if (error) {
        toast.error('Failed to update state config');
        return { error: error.message };
      }

      log(
        'state_regulatory_config_updated',
        { state_code: stateCode, ...updates },
        {
          module: 'admin',
          tableName: 'state_regulatory_configs',
          recordId: configId,
          oldValues: existing as unknown as Record<string, unknown>,
          newValues: { ...existing, ...updates } as unknown as Record<string, unknown>,
        },
      );

      toast.success(`${stateCode} config saved`);
      await fetchConfigs();
      return { error: null };
    },
    [configs, log, fetchConfigs],
  );

  const createContact = useCallback(
    async (input: RegulatoryContactInput) => {
      const { data, error } = await supabase
        .from('regulatory_contacts')
        .insert({
          ...input,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        toast.error('Failed to add contact');
        return { error: error.message, data: null };
      }

      log(
        'regulatory_contact_created',
        { agency: input.agency, contact_type: input.contact_type },
        {
          module: 'admin',
          tableName: 'regulatory_contacts',
          recordId: data.id,
          newValues: data as unknown as Record<string, unknown>,
        },
      );

      toast.success('Contact added');
      await fetchContacts();
      return { error: null, data: data as RegulatoryContact };
    },
    [log, fetchContacts],
  );

  const updateContact = useCallback(
    async (contactId: string, updates: Partial<RegulatoryContactInput>) => {
      const existing = contacts.find((c) => c.id === contactId);
      if (!existing) return { error: 'Contact not found' };

      const { error } = await supabase
        .from('regulatory_contacts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', contactId);

      if (error) {
        toast.error('Failed to update contact');
        return { error: error.message };
      }

      log(
        'regulatory_contact_updated',
        { contact_id: contactId, ...updates },
        {
          module: 'admin',
          tableName: 'regulatory_contacts',
          recordId: contactId,
          oldValues: existing as unknown as Record<string, unknown>,
          newValues: { ...existing, ...updates } as unknown as Record<string, unknown>,
        },
      );

      toast.success('Contact updated');
      await fetchContacts();
      return { error: null };
    },
    [contacts, log, fetchContacts],
  );

  const deleteContact = useCallback(
    async (contactId: string) => {
      const existing = contacts.find((c) => c.id === contactId);
      if (!existing) return { error: 'Contact not found' };

      const { error } = await supabase
        .from('regulatory_contacts')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', contactId);

      if (error) {
        toast.error('Failed to remove contact');
        return { error: error.message };
      }

      log(
        'regulatory_contact_deleted',
        { contact_id: contactId, agency: existing.agency },
        {
          module: 'admin',
          tableName: 'regulatory_contacts',
          recordId: contactId,
          oldValues: existing as unknown as Record<string, unknown>,
        },
      );

      toast.success('Contact removed');
      await fetchContacts();
      return { error: null };
    },
    [contacts, log, fetchContacts],
  );

  return {
    configs,
    contacts,
    loading,
    getConfigByStateCode,
    getContactsByStateId,
    updateConfig,
    createContact,
    updateContact,
    deleteContact,
    refetch: () => Promise.all([fetchConfigs(), fetchContacts()]),
  };
}
