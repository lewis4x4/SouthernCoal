import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderEvent,
  WorkOrderWithRelations,
} from '@/types/database';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWorkOrders() {
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const orgId = profile?.organization_id ?? null;

  const [workOrders, setWorkOrders] = useState<WorkOrderWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Fetch ───────────────────────────────────────────────────────────────
  const fetchWorkOrders = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('work_orders')
      .select(`
        *,
        site:sites(name),
        outfall:outfalls(outfall_number),
        assignee:user_profiles!work_orders_assigned_to_fkey(first_name, last_name)
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('[work_orders] fetch error:', error.message);
      toast.error('Failed to load work orders');
    } else {
      setWorkOrders(
        (data ?? []).map((wo: Record<string, unknown>) => ({
          ...wo,
          site_name: (wo.site as Record<string, string> | null)?.name ?? null,
          outfall_display: (wo.outfall as Record<string, string> | null)?.outfall_number ?? null,
          assigned_to_name: wo.assignee
            ? `${(wo.assignee as Record<string, string>).first_name ?? ''} ${(wo.assignee as Record<string, string>).last_name ?? ''}`.trim()
            : null,
        })) as WorkOrderWithRelations[],
      );
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    fetchWorkOrders();
  }, [fetchWorkOrders]);

  // ── Realtime ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel('work_orders_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'work_orders',
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          fetchWorkOrders();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, fetchWorkOrders]);

  // ── Create ──────────────────────────────────────────────────────────────
  const createWorkOrder = useCallback(
    async (fields: Partial<WorkOrder>) => {
      if (!orgId || !profile) return null;
      const { data, error } = await supabase
        .from('work_orders')
        .insert({
          ...fields,
          organization_id: orgId,
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) {
        toast.error('Failed to create work order');
        return null;
      }

      // Create initial event
      await supabase.from('work_order_events').insert({
        work_order_id: data.id,
        event_type: 'created',
        new_value: fields.title ?? 'New Work Order',
        created_by: profile.id,
      });

      log('work_order_created', { title: fields.title }, {
        module: 'work_orders',
        tableName: 'work_orders',
        recordId: data.id,
      });

      toast.success('Work order created');
      return data;
    },
    [orgId, profile, log],
  );

  // ── Update Status ───────────────────────────────────────────────────────
  const updateStatus = useCallback(
    async (id: string, newStatus: WorkOrderStatus, notes?: string) => {
      if (!profile) return;
      const wo = workOrders.find((w) => w.id === id);
      const updateFields: Partial<WorkOrder> = { status: newStatus };

      if (newStatus === 'completed') {
        updateFields.completed_by = profile.id;
        updateFields.completed_at = new Date().toISOString();
      } else if (newStatus === 'verified') {
        updateFields.verified_by = profile.id;
        updateFields.verified_at = new Date().toISOString();
      } else if (newStatus === 'assigned' && !wo?.assigned_to) {
        updateFields.assigned_to = profile.id;
        updateFields.assigned_by = profile.id;
        updateFields.assigned_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('work_orders')
        .update(updateFields)
        .eq('id', id);

      if (error) {
        toast.error('Failed to update status');
        return;
      }

      await supabase.from('work_order_events').insert({
        work_order_id: id,
        event_type: 'status_changed',
        old_value: wo?.status,
        new_value: newStatus,
        notes,
        created_by: profile.id,
      });

      log('work_order_status_changed', { from: wo?.status, to: newStatus }, {
        module: 'work_orders',
        tableName: 'work_orders',
        recordId: id,
      });

      toast.success(`Status updated to ${newStatus}`);
    },
    [profile, workOrders, log],
  );

  // ── Assign ──────────────────────────────────────────────────────────────
  const assignWorkOrder = useCallback(
    async (id: string, assigneeId: string) => {
      if (!profile) return;
      const { error } = await supabase
        .from('work_orders')
        .update({
          assigned_to: assigneeId,
          assigned_by: profile.id,
          assigned_at: new Date().toISOString(),
          status: 'assigned',
        })
        .eq('id', id);

      if (error) {
        toast.error('Failed to assign work order');
        return;
      }

      await supabase.from('work_order_events').insert({
        work_order_id: id,
        event_type: 'assigned',
        new_value: assigneeId,
        created_by: profile.id,
      });

      log('work_order_assigned', { assignee: assigneeId }, {
        module: 'work_orders',
        tableName: 'work_orders',
        recordId: id,
      });

      toast.success('Work order assigned');
    },
    [profile, log],
  );

  // ── Update Priority ────────────────────────────────────────────────────
  const updatePriority = useCallback(
    async (id: string, priority: WorkOrderPriority) => {
      if (!profile) return;
      const wo = workOrders.find((w) => w.id === id);
      const { error } = await supabase
        .from('work_orders')
        .update({ priority })
        .eq('id', id);

      if (error) {
        toast.error('Failed to update priority');
        return;
      }

      await supabase.from('work_order_events').insert({
        work_order_id: id,
        event_type: 'priority_changed',
        old_value: wo?.priority,
        new_value: priority,
        created_by: profile.id,
      });

      log('work_order_priority_changed', { from: wo?.priority, to: priority }, {
        module: 'work_orders',
        tableName: 'work_orders',
        recordId: id,
      });
    },
    [profile, workOrders, log],
  );

  // ── Add Note ────────────────────────────────────────────────────────────
  const addNote = useCallback(
    async (id: string, notes: string) => {
      if (!profile) return;
      const { error } = await supabase.from('work_order_events').insert({
        work_order_id: id,
        event_type: 'note_added',
        notes,
        created_by: profile.id,
      });

      if (error) {
        toast.error('Failed to add note');
        return;
      }

      toast.success('Note added');
    },
    [profile],
  );

  // ── Fetch Events ────────────────────────────────────────────────────────
  const fetchEvents = useCallback(async (workOrderId: string) => {
    const { data, error } = await supabase
      .from('work_order_events')
      .select('*')
      .eq('work_order_id', workOrderId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[work_order_events] fetch error:', error.message);
      return [];
    }
    return (data ?? []) as WorkOrderEvent[];
  }, []);

  // ── Status counts ──────────────────────────────────────────────────────
  const statusCounts = {
    open: workOrders.filter((w) => w.status === 'open').length,
    assigned: workOrders.filter((w) => w.status === 'assigned').length,
    in_progress: workOrders.filter((w) => w.status === 'in_progress').length,
    completed: workOrders.filter((w) => w.status === 'completed').length,
    verified: workOrders.filter((w) => w.status === 'verified').length,
    cancelled: workOrders.filter((w) => w.status === 'cancelled').length,
    overdue: workOrders.filter(
      (w) =>
        w.due_date &&
        new Date(w.due_date) < new Date() &&
        !['completed', 'verified', 'cancelled'].includes(w.status),
    ).length,
  };

  return {
    workOrders,
    loading,
    statusCounts,
    createWorkOrder,
    updateStatus,
    assignWorkOrder,
    updatePriority,
    addNote,
    fetchEvents,
    refresh: fetchWorkOrders,
  };
}

export default useWorkOrders;
