import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useCorrectiveActionsStore } from '@/stores/correctiveActions';
import {
  WORKFLOW_STEPS,
  STEP_REQUIRED_FIELDS,
  getNextStep,
  type CorrectiveAction,
  type WorkflowStep,
} from '@/types/corrective-actions';

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

      // Determine new status based on step
      let newStatus = ca.status;
      if (ca.status === 'open' && nextStep !== 'identification') {
        newStatus = 'in_progress';
      }
      if (nextStep === 'verification') {
        newStatus = 'completed';
      }
      if (nextStep === 'closure') {
        newStatus = 'verified';
      }

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
    [actions, validateStep, upsertAction, log]
  );

  // -------------------------------------------------------------------------
  // Close the CA (final step)
  // -------------------------------------------------------------------------
  const closeAction = useCallback(
    async (caId: string): Promise<{ error: string | null }> => {
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
          closed_date: new Date().toISOString().split('T')[0],
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
    [actions, validateStep, upsertAction, user, log]
  );

  // -------------------------------------------------------------------------
  // Reopen a closed CA
  // -------------------------------------------------------------------------
  const reopenAction = useCallback(
    async (caId: string, reason: string): Promise<{ error: string | null }> => {
      const ca = actions.find((a) => a.id === caId);
      if (!ca) {
        return { error: 'Corrective action not found' };
      }

      if (ca.status !== 'closed' && ca.status !== 'verified') {
        return { error: 'Can only reopen closed or verified actions' };
      }

      // Reopen to verification step
      const { data, error: updateErr } = await supabase
        .from('corrective_actions')
        .update({
          status: 'in_progress',
          workflow_step: 'verification',
          closed_date: null,
          closed_by: null,
          responsible_person_signed_at: null,
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

      // Audit log
      log(
        'corrective_action_reopened',
        { ca_id: caId, reason },
        {
          module: 'corrective_actions',
          tableName: 'corrective_actions',
          recordId: caId,
          oldValues: { status: ca.status, workflow_step: ca.workflow_step },
          newValues: { status: 'in_progress', workflow_step: 'verification' },
        }
      );

      return { error: null };
    },
    [actions, upsertAction, log]
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
    [user, upsertAction, log]
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
