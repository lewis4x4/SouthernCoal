import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { usePermissions } from '@/hooks/usePermissions';
import { useCorrectiveActionsStore } from '@/stores/correctiveActions';
import {
  WORKFLOW_STEPS,
  STEP_REQUIRED_FIELDS,
  getNextStep,
  type CorrectiveAction,
  type WorkflowStep,
  type CAStatus,
} from '@/types/corrective-actions';

// Issue #7 Fix: Explicit status transitions for advanceStep
// Note: 'closed' status is set by closeAction(), not advanceStep()
const STATUS_TRANSITIONS: Record<WorkflowStep, CAStatus> = {
  identification: 'open',
  root_cause_analysis: 'in_progress',
  corrective_action_plan: 'in_progress',
  preventive_action: 'in_progress',
  implementation: 'in_progress',
  verification: 'completed',
  closure: 'verified',
};

interface ValidationResult {
  valid: boolean;
  missing: string[];
}

/**
 * Hook for workflow step transitions.
 * Handles validation, advancement, and reopening of corrective actions.
 */
export function useWorkflowTransition() {
  const { user } = useAuth();
  const { log } = useAuditLog();
  const { can } = usePermissions();
  const { actions, upsertAction } = useCorrectiveActionsStore();

  // -------------------------------------------------------------------------
  // Validate current step before advancing
  // -------------------------------------------------------------------------
  const validateStep = useCallback(
    (ca: CorrectiveAction): ValidationResult => {
      const requiredFields = STEP_REQUIRED_FIELDS[ca.workflow_step] || [];
      const missing: string[] = [];

      for (const field of requiredFields) {
        const value = ca[field as keyof CorrectiveAction];
        if (value === null || value === undefined || value === '') {
          missing.push(formatFieldName(field));
        }
      }

      return { valid: missing.length === 0, missing };
    },
    []
  );

  // -------------------------------------------------------------------------
  // Get validation status for a specific step
  // -------------------------------------------------------------------------
  const getStepValidation = useCallback(
    (ca: CorrectiveAction, step: WorkflowStep): ValidationResult => {
      const requiredFields = STEP_REQUIRED_FIELDS[step] || [];
      const missing: string[] = [];

      for (const field of requiredFields) {
        const value = ca[field as keyof CorrectiveAction];
        if (value === null || value === undefined || value === '') {
          missing.push(formatFieldName(field));
        }
      }

      return { valid: missing.length === 0, missing };
    },
    []
  );

  // -------------------------------------------------------------------------
  // Advance to next workflow step
  // -------------------------------------------------------------------------
  const advanceStep = useCallback(
    async (caId: string): Promise<{ error: string | null }> => {
      // RBAC check: require ca_advance_workflow permission
      if (!can('ca_advance_workflow')) {
        return { error: 'You do not have permission to advance workflow steps' };
      }

      const ca = actions.find((a) => a.id === caId);
      if (!ca) {
        return { error: 'Corrective action not found' };
      }

      // Validate current step
      const validation = validateStep(ca);
      if (!validation.valid) {
        return {
          error: `Missing required fields: ${validation.missing.join(', ')}`,
        };
      }

      // Get next step
      const nextStep = getNextStep(ca.workflow_step);
      if (!nextStep) {
        return { error: 'Already at final step' };
      }

      // Determine new status based on next step (using explicit state machine)
      const newStatus = STATUS_TRANSITIONS[nextStep] ?? ca.status;

      // Update in database
      const { data, error: updateErr } = await supabase
        .from('corrective_actions')
        .update({
          workflow_step: nextStep,
          workflow_step_completed_at: new Date().toISOString(),
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', caId)
        .select()
        .single();

      if (updateErr) {
        return { error: updateErr.message };
      }

      if (data) {
        upsertAction(data as CorrectiveAction);
      }

      // Audit log
      log(
        'corrective_action_step_advanced',
        {
          ca_id: caId,
          from_step: ca.workflow_step,
          to_step: nextStep,
          new_status: newStatus,
        },
        {
          module: 'corrective_actions',
          tableName: 'corrective_actions',
          recordId: caId,
          oldValues: { workflow_step: ca.workflow_step, status: ca.status },
          newValues: { workflow_step: nextStep, status: newStatus },
        }
      );

      return { error: null };
    },
    [actions, validateStep, upsertAction, log, can]
  );

  // -------------------------------------------------------------------------
  // Close the CA (final step)
  // -------------------------------------------------------------------------
  const closeAction = useCallback(
    async (caId: string): Promise<{ error: string | null }> => {
      // RBAC check: require ca_advance_workflow permission (closing is final step advancement)
      if (!can('ca_advance_workflow')) {
        return { error: 'You do not have permission to close corrective actions' };
      }

      const ca = actions.find((a) => a.id === caId);
      if (!ca) {
        return { error: 'Corrective action not found' };
      }

      // Must be at closure step
      if (ca.workflow_step !== 'closure') {
        return { error: 'Must be at closure step to close' };
      }

      // Validate closure requirements (signatures)
      const validation = validateStep(ca);
      if (!validation.valid) {
        return {
          error: `Missing required fields: ${validation.missing.join(', ')}`,
        };
      }

      // Update to closed
      const { data, error: updateErr } = await supabase
        .from('corrective_actions')
        .update({
          status: 'closed',
          // Issue #12 Fix: Use full timestamp for consistency with other date fields
          closed_date: new Date().toISOString(),
          closed_by: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', caId)
        .select()
        .single();

      if (updateErr) {
        return { error: updateErr.message };
      }

      if (data) {
        upsertAction(data as CorrectiveAction);
      }

      // Audit log
      log(
        'corrective_action_closed',
        { ca_id: caId },
        {
          module: 'corrective_actions',
          tableName: 'corrective_actions',
          recordId: caId,
          newValues: { status: 'closed' },
        }
      );

      return { error: null };
    },
    [actions, validateStep, upsertAction, user, log, can]
  );

  // -------------------------------------------------------------------------
  // Reopen a closed CA
  // -------------------------------------------------------------------------
  const reopenAction = useCallback(
    async (caId: string, reason: string): Promise<{ error: string | null }> => {
      // RBAC check: require ca_reopen permission
      if (!can('ca_reopen')) {
        return { error: 'You do not have permission to reopen corrective actions' };
      }

      const ca = actions.find((a) => a.id === caId);
      if (!ca) {
        return { error: 'Corrective action not found' };
      }

      if (ca.status !== 'closed' && ca.status !== 'verified') {
        return { error: 'Can only reopen closed or verified actions' };
      }

      // Track signatures being cleared for audit trail
      const clearedSignatures = {
        responsible_person_signed_at: ca.responsible_person_signed_at,
        approved_by_signed_at: ca.approved_by_signed_at,
      };

      // Reopen to verification step
      // Issue #3 Fix: Clear signature IDs as well as timestamps
      const { data, error: updateErr } = await supabase
        .from('corrective_actions')
        .update({
          status: 'in_progress',
          workflow_step: 'verification',
          closed_date: null,
          closed_by: null,
          responsible_person_id: null,
          responsible_person_signed_at: null,
          approved_by_id: null,
          approved_by_signed_at: null,
          notes: `Reopened: ${reason}\n\n${ca.notes || ''}`.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', caId)
        .select()
        .single();

      if (updateErr) {
        return { error: updateErr.message };
      }

      if (data) {
        upsertAction(data as CorrectiveAction);
      }

      // Audit log - include signature clearing for compliance trail
      log(
        'corrective_action_reopened',
        { ca_id: caId, reason, signatures_cleared: clearedSignatures },
        {
          module: 'corrective_actions',
          tableName: 'corrective_actions',
          recordId: caId,
          oldValues: {
            status: ca.status,
            workflow_step: ca.workflow_step,
            ...clearedSignatures,
          },
          newValues: {
            status: 'in_progress',
            workflow_step: 'verification',
            responsible_person_id: null,
            responsible_person_signed_at: null,
            approved_by_id: null,
            approved_by_signed_at: null,
          },
        }
      );

      return { error: null };
    },
    [actions, upsertAction, log, can]
  );

  // -------------------------------------------------------------------------
  // Record digital signature
  // -------------------------------------------------------------------------
  const recordSignature = useCallback(
    async (
      caId: string,
      type: 'responsible' | 'approver'
    ): Promise<{ error: string | null }> => {
      if (!user) {
        return { error: 'Not authenticated' };
      }

      // RBAC check: require appropriate signature permission based on type
      const requiredPermission = type === 'responsible' ? 'ca_sign_responsible' : 'ca_sign_approver';
      if (!can(requiredPermission)) {
        return { error: `You do not have permission to sign as ${type}` };
      }

      // Issue #1 Fix: Prevent same user from signing both roles
      const ca = actions.find((a) => a.id === caId);
      if (ca) {
        const otherIdField =
          type === 'responsible' ? 'approved_by_id' : 'responsible_person_id';
        if (ca[otherIdField] === user.id) {
          return { error: 'Cannot sign as both responsible person and approver' };
        }
      }

      const field =
        type === 'responsible'
          ? 'responsible_person_signed_at'
          : 'approved_by_signed_at';
      const idField =
        type === 'responsible' ? 'responsible_person_id' : 'approved_by_id';

      const { data, error: updateErr } = await supabase
        .from('corrective_actions')
        .update({
          [idField]: user.id,
          [field]: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', caId)
        .select()
        .single();

      if (updateErr) {
        return { error: updateErr.message };
      }

      if (data) {
        upsertAction(data as CorrectiveAction);
      }

      // Audit log
      log(
        'corrective_action_signed',
        { ca_id: caId, signature_type: type, signer_id: user.id },
        {
          module: 'corrective_actions',
          tableName: 'corrective_actions',
          recordId: caId,
          newValues: { [idField]: user.id, [field]: new Date().toISOString() },
        }
      );

      return { error: null };
    },
    [actions, user, upsertAction, log, can]
  );

  // -------------------------------------------------------------------------
  // Check if step is complete
  // -------------------------------------------------------------------------
  const isStepComplete = useCallback(
    (ca: CorrectiveAction, step: WorkflowStep): boolean => {
      const currentIndex = WORKFLOW_STEPS.indexOf(ca.workflow_step);
      const targetIndex = WORKFLOW_STEPS.indexOf(step);
      return targetIndex < currentIndex;
    },
    []
  );

  // -------------------------------------------------------------------------
  // Check if step is current
  // -------------------------------------------------------------------------
  const isCurrentStep = useCallback(
    (ca: CorrectiveAction, step: WorkflowStep): boolean => {
      return ca.workflow_step === step;
    },
    []
  );

  return {
    validateStep,
    getStepValidation,
    advanceStep,
    closeAction,
    reopenAction,
    recordSignature,
    isStepComplete,
    isCurrentStep,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFieldName(field: string): string {
  return field
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
