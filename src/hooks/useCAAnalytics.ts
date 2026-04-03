import { useMemo } from 'react';
import type { CorrectiveAction, CAStatus, CAPriority, WorkflowStep, SourceType } from '@/types/corrective-actions';
import { isOverdue, getDaysOpen } from '@/types/corrective-actions';

// ---------------------------------------------------------------------------
// Metric Interfaces
// ---------------------------------------------------------------------------
export interface CAMetrics {
  total: number;
  open: number;
  overdue: number;
  avgDaysToClose: number;
  onTimeClosureRate: number; // percentage
  closedLast30: number;
  openedLast30: number;
}

export interface SourceBreakdown {
  source_type: SourceType;
  count: number;
}

export interface StepBottleneck {
  step: WorkflowStep;
  count: number;
  avgDaysInStep: number;
}

export interface AssigneeOverdue {
  assignee_name: string;
  assignee_id: string;
  overdue_count: number;
  total_assigned: number;
}

export interface TrendPoint {
  month: string;  // YYYY-MM
  opened: number;
  closed: number;
}

export interface RCAFrequency {
  category: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Derives analytics from the full CA list (already fetched by useCorrectiveActions).
 * No additional DB queries — all computed client-side from the action array.
 */
export function useCAAnalytics(actions: CorrectiveAction[]) {
  // -------------------------------------------------------------------------
  // Core Metrics
  // -------------------------------------------------------------------------
  const metrics = useMemo<CAMetrics>(() => {
    const closed = actions.filter((a) => a.status === 'closed');
    const overdue = actions.filter(isOverdue);
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const closedLast30 = closed.filter(
      (a) => a.closed_date && new Date(a.closed_date).getTime() >= thirtyDaysAgo,
    );
    const openedLast30 = actions.filter(
      (a) => new Date(a.created_at).getTime() >= thirtyDaysAgo,
    );

    // Average days to close (only closed CAs)
    let avgDays = 0;
    if (closed.length > 0) {
      const totalDays = closed.reduce((sum, a) => sum + getDaysOpen(a), 0);
      avgDays = Math.round(totalDays / closed.length);
    }

    // On-time closure rate: closed CAs that were closed before or on due_date
    let onTimeRate = 0;
    const closedWithDue = closed.filter((a) => a.due_date);
    if (closedWithDue.length > 0) {
      const onTime = closedWithDue.filter((a) => {
        if (!a.closed_date || !a.due_date) return false;
        return a.closed_date <= a.due_date;
      });
      onTimeRate = Math.round((onTime.length / closedWithDue.length) * 100);
    }

    return {
      total: actions.length,
      open: actions.filter((a) => a.status !== 'closed').length,
      overdue: overdue.length,
      avgDaysToClose: avgDays,
      onTimeClosureRate: onTimeRate,
      closedLast30: closedLast30.length,
      openedLast30: openedLast30.length,
    };
  }, [actions]);

  // -------------------------------------------------------------------------
  // Source Type Breakdown
  // -------------------------------------------------------------------------
  const sourceBreakdown = useMemo<SourceBreakdown[]>(() => {
    const counts = new Map<SourceType, number>();
    for (const a of actions) {
      counts.set(a.source_type, (counts.get(a.source_type) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([source_type, count]) => ({ source_type, count }))
      .sort((a, b) => b.count - a.count);
  }, [actions]);

  // -------------------------------------------------------------------------
  // Workflow Step Bottleneck
  // -------------------------------------------------------------------------
  const stepBottleneck = useMemo<StepBottleneck[]>(() => {
    const openActions = actions.filter((a) => a.status !== 'closed');
    const stepMap = new Map<WorkflowStep, CorrectiveAction[]>();

    for (const a of openActions) {
      const list = stepMap.get(a.workflow_step) ?? [];
      list.push(a);
      stepMap.set(a.workflow_step, list);
    }

    return Array.from(stepMap.entries()).map(([step, items]) => {
      const totalDays = items.reduce((sum, a) => sum + getDaysOpen(a), 0);
      return {
        step,
        count: items.length,
        avgDaysInStep: items.length > 0 ? Math.round(totalDays / items.length) : 0,
      };
    }).sort((a, b) => b.count - a.count);
  }, [actions]);

  // -------------------------------------------------------------------------
  // Overdue by Assignee
  // -------------------------------------------------------------------------
  const overdueByAssignee = useMemo<AssigneeOverdue[]>(() => {
    const assigneeMap = new Map<string, { name: string; overdue: number; total: number }>();
    const openActions = actions.filter((a) => a.status !== 'closed' && a.followup_assigned_to);

    for (const a of openActions) {
      const id = a.followup_assigned_to!;
      const name = a.assigned_to_name ?? 'Unknown';
      const existing = assigneeMap.get(id) ?? { name, overdue: 0, total: 0 };
      existing.total++;
      if (isOverdue(a)) existing.overdue++;
      assigneeMap.set(id, existing);
    }

    return Array.from(assigneeMap.entries())
      .map(([assignee_id, data]) => ({
        assignee_id,
        assignee_name: data.name,
        overdue_count: data.overdue,
        total_assigned: data.total,
      }))
      .filter((a) => a.overdue_count > 0)
      .sort((a, b) => b.overdue_count - a.overdue_count);
  }, [actions]);

  // -------------------------------------------------------------------------
  // Monthly Trend (last 12 months)
  // -------------------------------------------------------------------------
  const monthlyTrend = useMemo<TrendPoint[]>(() => {
    const now = new Date();
    const months: TrendPoint[] = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);

      const opened = actions.filter((a) => {
        const created = new Date(a.created_at);
        return created >= d && created < nextMonth;
      }).length;

      const closed = actions.filter((a) => {
        if (!a.closed_date) return false;
        const closedDate = new Date(a.closed_date);
        return closedDate >= d && closedDate < nextMonth;
      }).length;

      months.push({ month, opened, closed });
    }

    return months;
  }, [actions]);

  // -------------------------------------------------------------------------
  // Priority Distribution (open only)
  // -------------------------------------------------------------------------
  const priorityDistribution = useMemo(() => {
    const open = actions.filter((a) => a.status !== 'closed');
    const counts: Record<CAPriority, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const a of open) {
      counts[a.priority]++;
    }
    return counts;
  }, [actions]);

  // -------------------------------------------------------------------------
  // Status Distribution
  // -------------------------------------------------------------------------
  const statusDistribution = useMemo(() => {
    const counts: Record<CAStatus, number> = {
      open: 0, in_progress: 0, completed: 0, verified: 0, closed: 0,
    };
    for (const a of actions) {
      counts[a.status]++;
    }
    return counts;
  }, [actions]);

  return {
    metrics,
    sourceBreakdown,
    stepBottleneck,
    overdueByAssignee,
    monthlyTrend,
    priorityDistribution,
    statusDistribution,
  };
}
