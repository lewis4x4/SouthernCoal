import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type {
  EquipmentCatalogItem,
  EquipmentAssignment,
  CalibrationDueItem,
} from '@/types/equipment';

export function useEquipment() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const [equipment, setEquipment] = useState<EquipmentCatalogItem[]>([]);
  const [assignments, setAssignments] = useState<EquipmentAssignment[]>([]);
  const [calibrationsDue, setCalibrationsDue] = useState<CalibrationDueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const orgId = profile?.organization_id ?? null;

  const fetchEquipment = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('equipment_catalog')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('equipment_type', { ascending: true });

    if (error) {
      console.error('[equipment] catalog fetch failed:', error.message);
      return;
    }
    setEquipment((data ?? []) as EquipmentCatalogItem[]);
  }, [orgId]);

  const fetchAssignments = useCallback(async () => {
    if (!orgId) return;
    // Get active assignments for all org equipment
    const { data: equipIds } = await supabase
      .from('equipment_catalog')
      .select('id')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    if (!equipIds?.length) {
      setAssignments([]);
      return;
    }

    const { data, error } = await supabase
      .from('equipment_assignments')
      .select('*')
      .in('equipment_id', equipIds.map((e) => e.id))
      .is('returned_at', null);

    if (error) {
      console.error('[equipment] assignments fetch failed:', error.message);
      return;
    }
    setAssignments((data ?? []) as EquipmentAssignment[]);
  }, [orgId]);

  const fetchCalibrationsDue = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase.rpc('get_equipment_due_calibration', {
      p_org_id: orgId,
      p_within_days: 14,
    });

    if (error) {
      console.error('[equipment] calibrations due fetch failed:', error.message);
      return;
    }
    setCalibrationsDue((data ?? []) as CalibrationDueItem[]);
  }, [orgId]);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    Promise.all([fetchEquipment(), fetchAssignments(), fetchCalibrationsDue()]).then(() =>
      setLoading(false),
    );
  }, [fetchEquipment, fetchAssignments, fetchCalibrationsDue, orgId]);

  const addEquipment = useCallback(
    async (item: {
      name: string;
      equipment_type: string;
      serial_number?: string;
      model?: string;
      manufacturer?: string;
      requires_calibration?: boolean;
      calibration_interval_days?: number;
    }) => {
      if (!orgId) return { error: 'No org' };

      const { error } = await supabase.from('equipment_catalog').insert({
        organization_id: orgId,
        name: item.name,
        equipment_type: item.equipment_type,
        serial_number: item.serial_number ?? null,
        model: item.model ?? null,
        manufacturer: item.manufacturer ?? null,
        requires_calibration: item.requires_calibration ?? false,
        calibration_interval_days: item.calibration_interval_days ?? null,
      });

      if (error) {
        toast.error('Failed to add equipment');
        return { error: error.message };
      }

      log('equipment_created', { name: item.name, type: item.equipment_type }, {
        module: 'equipment',
        tableName: 'equipment_catalog',
      });

      toast.success('Equipment added');
      fetchEquipment();
      return { error: null };
    },
    [orgId, log, fetchEquipment],
  );

  const assignEquipment = useCallback(
    async (equipmentId: string, assignedTo: string, condition?: string) => {
      if (!user?.id) return { error: 'Not authenticated' };

      const { error } = await supabase.from('equipment_assignments').insert({
        equipment_id: equipmentId,
        assigned_to: assignedTo,
        assigned_by: user.id,
        condition_on_assign: condition ?? 'good',
      });

      if (error) {
        toast.error('Failed to assign equipment');
        return { error: error.message };
      }

      // Update equipment status
      await supabase
        .from('equipment_catalog')
        .update({ status: 'assigned', updated_at: new Date().toISOString() })
        .eq('id', equipmentId);

      log('equipment_assigned', { equipment_id: equipmentId, assigned_to: assignedTo }, {
        module: 'equipment',
        tableName: 'equipment_assignments',
      });

      toast.success('Equipment assigned');
      Promise.all([fetchEquipment(), fetchAssignments()]);
      return { error: null };
    },
    [user?.id, log, fetchEquipment, fetchAssignments],
  );

  const logCalibration = useCallback(
    async (params: {
      equipmentId: string;
      result: string;
      nextDue?: string;
      standardUsed?: string;
      notes?: string;
    }) => {
      if (!user?.id) return { error: 'Not authenticated' };

      const { error } = await supabase.from('calibration_logs').insert({
        equipment_id: params.equipmentId,
        calibrated_by: user.id,
        result: params.result,
        next_calibration_due: params.nextDue ?? null,
        standard_used: params.standardUsed ?? null,
        notes: params.notes ?? null,
      });

      if (error) {
        toast.error('Failed to log calibration');
        return { error: error.message };
      }

      log('calibration_logged', {
        equipment_id: params.equipmentId,
        result: params.result,
      }, {
        module: 'equipment',
        tableName: 'calibration_logs',
      });

      toast.success('Calibration recorded');
      fetchCalibrationsDue();
      return { error: null };
    },
    [user?.id, log, fetchCalibrationsDue],
  );

  return {
    equipment,
    assignments,
    calibrationsDue,
    loading,
    addEquipment,
    assignEquipment,
    logCalibration,
    refresh: () => Promise.all([fetchEquipment(), fetchAssignments(), fetchCalibrationsDue()]),
  };
}
