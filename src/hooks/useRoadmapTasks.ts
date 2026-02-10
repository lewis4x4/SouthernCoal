import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type { RoadmapTask, RoadmapStatus } from '@/types/roadmap';

export function useRoadmapTasks() {
  const { user } = useAuth();
  const { log } = useAuditLog();
  const [tasks, setTasks] = useState<RoadmapTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from('roadmap_tasks')
      .select('*')
      .order('task_id', { ascending: true });

    if (error) {
      console.error('[roadmap] Failed to fetch tasks:', error.message);
      setLoading(false);
      return;
    }

    setTasks((data ?? []) as RoadmapTask[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const updateStatus = useCallback(async (taskId: string, dbId: string, newStatus: RoadmapStatus, oldStatus: RoadmapStatus) => {
    if (!user) return;

    const updates: Partial<RoadmapTask> & { updated_at: string } = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === 'complete') {
      updates.completed_at = new Date().toISOString();
      updates.completed_by = user.id;
    } else {
      updates.completed_at = null;
      updates.completed_by = null;
    }

    const { error } = await supabase
      .from('roadmap_tasks')
      .update(updates)
      .eq('id', dbId);

    if (error) {
      toast.error('Failed to update task status');
      return;
    }

    log('roadmap_status_change', {
      task_id: taskId,
      old_status: oldStatus,
      new_status: newStatus,
    }, {
      module: 'roadmap',
      tableName: 'roadmap_tasks',
      recordId: dbId,
      oldValues: { status: oldStatus },
      newValues: { status: newStatus },
    });

    toast.success(`Task ${taskId} → ${newStatus.replace('_', ' ')}`);
    fetchTasks();
  }, [user, log, fetchTasks]);

  const updateNotes = useCallback(async (dbId: string, notes: string) => {
    const { error } = await supabase
      .from('roadmap_tasks')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('id', dbId);

    if (error) {
      toast.error('Failed to save notes');
    }
  }, []);

  const updateAssignment = useCallback(async (dbId: string, assignedTo: string | null) => {
    const { error } = await supabase
      .from('roadmap_tasks')
      .update({ assigned_to: assignedTo, updated_at: new Date().toISOString() })
      .eq('id', dbId);

    if (error) {
      toast.error('Failed to update assignment');
      return;
    }

    fetchTasks();
  }, [fetchTasks]);

  return { tasks, loading, updateStatus, updateNotes, updateAssignment, refresh: fetchTasks };
}
