import { useState, useEffect, useCallback, useId } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { GlassButton } from '@/components/ui/GlassButton';
import { usePermissions } from '@/hooks/usePermissions';
import { useCorrectiveActions } from '@/hooks/useCorrectiveActions';
import {
  type CorrectiveAction,
  type WorkflowStep,
  CA_PRIORITIES,
  CA_PRIORITY_LABELS,
  SOURCE_TYPES,
  SOURCE_TYPE_LABELS,
} from '@/types/corrective-actions';

interface CorrectiveActionFormProps {
  action: CorrectiveAction;
  step: WorkflowStep;
  onSave?: () => void;
  className?: string;
}

/**
 * Dynamic form that displays different fields based on workflow step.
 * Only current step is editable; completed steps are read-only.
 */
export function CorrectiveActionForm({
  action,
  step,
  onSave,
  className,
}: CorrectiveActionFormProps) {
  const { can } = usePermissions();
  const { updateStepData } = useCorrectiveActions();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});

  const isCurrentStep = action.workflow_step === step;
  const canEdit = isCurrentStep && can('ca_edit') && action.status !== 'closed';

  // Initialize form data from action
  useEffect(() => {
    setFormData(getStepFormData(action, step));
  }, [action, step]);

  const handleChange = useCallback(
    (field: string, value: string) => {
      if (!canEdit) return;
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    [canEdit]
  );

  const handleSave = useCallback(async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const result = await updateStepData(action.id, step, formData);
      if (result.error) {
        console.error('Failed to save:', result.error);
        toast.error('Failed to save changes', {
          description: result.error,
        });
      } else {
        toast.success('Changes saved');
        onSave?.();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      toast.error('Save failed', { description: message });
    } finally {
      setSaving(false);
    }
  }, [action.id, step, formData, updateStepData, canEdit, onSave]);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Step-specific form fields */}
      {step === 'identification' && (
        <IdentificationForm
          data={formData}
          onChange={handleChange}
          readOnly={!canEdit}
        />
      )}
      {step === 'root_cause_analysis' && (
        <RootCauseForm
          data={formData}
          onChange={handleChange}
          readOnly={!canEdit}
        />
      )}
      {step === 'corrective_action_plan' && (
        <CorrectiveActionPlanForm
          data={formData}
          onChange={handleChange}
          readOnly={!canEdit}
        />
      )}
      {step === 'preventive_action' && (
        <PreventiveActionForm
          data={formData}
          onChange={handleChange}
          readOnly={!canEdit}
        />
      )}
      {step === 'implementation' && (
        <ImplementationForm
          data={formData}
          onChange={handleChange}
          readOnly={!canEdit}
        />
      )}
      {step === 'verification' && (
        <VerificationForm
          data={formData}
          onChange={handleChange}
          readOnly={!canEdit}
        />
      )}
      {step === 'closure' && (
        <ClosureForm action={action} readOnly={!canEdit} />
      )}

      {/* Save button */}
      {canEdit && step !== 'closure' && (
        <div className="flex justify-end pt-4 border-t border-white/[0.06]">
          <GlassButton
            variant="primary"
            onClick={handleSave}
            loading={saving ? 'Saving...' : undefined}
            disabled={saving}
          >
            Save Changes
          </GlassButton>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Form Input Components
// -----------------------------------------------------------------------------

interface FormInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  required?: boolean;
  type?: 'text' | 'date' | 'textarea';
  placeholder?: string;
  rows?: number;
}

function FormInput({
  label,
  value,
  onChange,
  readOnly = false,
  required = false,
  type = 'text',
  placeholder,
  rows = 3,
}: FormInputProps) {
  const id = useId();
  const baseClasses = cn(
    'w-full rounded-lg border px-3 py-2 text-sm transition-colors',
    'bg-white/[0.02] border-white/[0.08]',
    'text-text-primary placeholder:text-text-muted',
    'focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20',
    readOnly && 'opacity-60 cursor-not-allowed'
  );

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-text-secondary">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {type === 'textarea' ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          placeholder={placeholder}
          rows={rows}
          className={baseClasses}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          placeholder={placeholder}
          className={baseClasses}
        />
      )}
    </div>
  );
}

interface FormSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  readOnly?: boolean;
  required?: boolean;
}

function FormSelect({
  label,
  value,
  onChange,
  options,
  readOnly = false,
  required = false,
}: FormSelectProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-text-secondary">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
        className={cn(
          'w-full rounded-lg border px-3 py-2 text-sm transition-colors',
          'bg-white/[0.02] border-white/[0.08]',
          'text-text-primary',
          'focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20',
          readOnly && 'opacity-60 cursor-not-allowed'
        )}
      >
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Step-Specific Forms
// -----------------------------------------------------------------------------

interface StepFormProps {
  data: Record<string, string>;
  onChange: (field: string, value: string) => void;
  readOnly?: boolean;
}

function IdentificationForm({ data, onChange, readOnly }: StepFormProps) {
  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-text-secondary mb-3">
        Section 1-2: Incident Identification
      </div>
      <FormInput
        label="Title"
        value={data.title || ''}
        onChange={(v) => onChange('title', v)}
        readOnly={readOnly}
        required
        placeholder="Brief description of the incident"
      />
      <FormInput
        label="Description"
        value={data.description || ''}
        onChange={(v) => onChange('description', v)}
        readOnly={readOnly}
        required
        type="textarea"
        rows={4}
        placeholder="Detailed description of what occurred..."
      />
      <div className="grid grid-cols-2 gap-4">
        <FormInput
          label="Date Received"
          value={data.date_received || ''}
          onChange={(v) => onChange('date_received', v)}
          readOnly={readOnly}
          type="date"
        />
        <FormSelect
          label="Priority"
          value={data.priority || ''}
          onChange={(v) => onChange('priority', v)}
          readOnly={readOnly}
          required
          options={CA_PRIORITIES.map((p) => ({
            value: p,
            label: CA_PRIORITY_LABELS[p],
          }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormSelect
          label="Source Type"
          value={data.source_type || ''}
          onChange={(v) => onChange('source_type', v)}
          readOnly={readOnly}
          options={SOURCE_TYPES.map((s) => ({
            value: s,
            label: SOURCE_TYPE_LABELS[s],
          }))}
        />
        <FormInput
          label="Regulation Cited"
          value={data.regulation_cited || ''}
          onChange={(v) => onChange('regulation_cited', v)}
          readOnly={readOnly}
          placeholder="e.g., 40 CFR 122.41"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormInput
          label="Issuing Agency"
          value={data.issuing_agency || ''}
          onChange={(v) => onChange('issuing_agency', v)}
          readOnly={readOnly}
          placeholder="e.g., EPA, ADEM"
        />
        <FormInput
          label="Issuing Person"
          value={data.issuing_person || ''}
          onChange={(v) => onChange('issuing_person', v)}
          readOnly={readOnly}
          placeholder="Inspector name"
        />
      </div>
    </div>
  );
}

function RootCauseForm({ data, onChange, readOnly }: StepFormProps) {
  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-text-secondary mb-3">
        Section 3: Root Cause Analysis
      </div>
      <FormInput
        label="Contributing Factors"
        value={data.contributing_factors || ''}
        onChange={(v) => onChange('contributing_factors', v)}
        readOnly={readOnly}
        type="textarea"
        rows={4}
        placeholder="List factors that contributed to the incident..."
      />
      <FormInput
        label="Root Cause"
        value={data.root_cause || ''}
        onChange={(v) => onChange('root_cause', v)}
        readOnly={readOnly}
        required
        type="textarea"
        rows={4}
        placeholder="Identify the fundamental cause of the issue..."
      />
    </div>
  );
}

function CorrectiveActionPlanForm({ data, onChange, readOnly }: StepFormProps) {
  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-text-secondary mb-3">
        Section 4: Corrective Action Plan
      </div>
      <FormInput
        label="Immediate Mitigation"
        value={data.immediate_mitigation || ''}
        onChange={(v) => onChange('immediate_mitigation', v)}
        readOnly={readOnly}
        required
        type="textarea"
        rows={4}
        placeholder="Immediate actions taken to address the issue..."
      />
      <FormInput
        label="Corrective Action Taken"
        value={data.action_taken || ''}
        onChange={(v) => onChange('action_taken', v)}
        readOnly={readOnly}
        type="textarea"
        rows={4}
        placeholder="Detailed corrective actions to be implemented..."
      />
    </div>
  );
}

function PreventiveActionForm({ data, onChange, readOnly }: StepFormProps) {
  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-text-secondary mb-3">
        Section 5: Preventive Action
      </div>
      <FormInput
        label="Preventive Action"
        value={data.preventive_action || ''}
        onChange={(v) => onChange('preventive_action', v)}
        readOnly={readOnly}
        required
        type="textarea"
        rows={4}
        placeholder="Actions to prevent recurrence..."
      />
      <FormInput
        label="Documents Requiring Revision"
        value={data.documents_requiring_revision || ''}
        onChange={(v) => onChange('documents_requiring_revision', v)}
        readOnly={readOnly}
        type="textarea"
        rows={3}
        placeholder="List any SOPs, manuals, or procedures that need updating..."
      />
    </div>
  );
}

function ImplementationForm({ data, onChange, readOnly }: StepFormProps) {
  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-text-secondary mb-3">
        Section 6: Implementation
      </div>
      <FormInput
        label="Completion Date"
        value={data.completed_date || ''}
        onChange={(v) => onChange('completed_date', v)}
        readOnly={readOnly}
        required
        type="date"
      />
      <FormInput
        label="Implementation Notes"
        value={data.notes || ''}
        onChange={(v) => onChange('notes', v)}
        readOnly={readOnly}
        type="textarea"
        rows={4}
        placeholder="Notes on implementation progress and completion..."
      />
    </div>
  );
}

function VerificationForm({ data, onChange, readOnly }: StepFormProps) {
  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-text-secondary mb-3">
        Section 7: Verification
      </div>
      <FormInput
        label="Effectiveness Assessment"
        value={data.effectiveness_assessment || ''}
        onChange={(v) => onChange('effectiveness_assessment', v)}
        readOnly={readOnly}
        required
        type="textarea"
        rows={4}
        placeholder="Assessment of whether corrective actions were effective..."
      />
      <div className="grid grid-cols-2 gap-4">
        <FormInput
          label="Verified By"
          value={data.verified_by || ''}
          onChange={(v) => onChange('verified_by', v)}
          readOnly={readOnly}
          required
          placeholder="Name of verifier"
        />
        <FormInput
          label="Verified Date"
          value={data.verified_date || ''}
          onChange={(v) => onChange('verified_date', v)}
          readOnly={readOnly}
          required
          type="date"
        />
      </div>
    </div>
  );
}

interface ClosureFormProps {
  action: CorrectiveAction;
  readOnly?: boolean;
}

function ClosureForm({ action, readOnly }: ClosureFormProps) {
  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-text-secondary mb-3">
        Section 8: Closure Signatures
      </div>
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
        <SignatureBlock
          label="Responsible Person"
          signedBy={action.responsible_person_name}
          signedAt={action.responsible_person_signed_at}
          required
        />
        <SignatureBlock
          label="Approved By"
          signedBy={action.approved_by_name}
          signedAt={action.approved_by_signed_at}
          required
        />
      </div>
      {!readOnly && !action.responsible_person_signed_at && (
        <p className="text-xs text-text-muted">
          Use the signature buttons in the action bar to record signatures.
        </p>
      )}
    </div>
  );
}

interface SignatureBlockProps {
  label: string;
  signedBy?: string | null;
  signedAt?: string | null;
  required?: boolean;
}

function SignatureBlock({
  label,
  signedBy,
  signedAt,
  required,
}: SignatureBlockProps) {
  const isSigned = signedAt && signedBy;

  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium text-text-primary">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </div>
        {isSigned ? (
          <div className="text-xs text-emerald-400">
            Signed by {signedBy} on{' '}
            {new Date(signedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </div>
        ) : (
          <div className="text-xs text-text-muted">Awaiting signature</div>
        )}
      </div>
      <div
        className={cn(
          'w-6 h-6 rounded-full flex items-center justify-center',
          isSigned
            ? 'bg-emerald-500/20 border border-emerald-500/30'
            : 'bg-amber-500/20 border border-amber-500/30'
        )}
      >
        <span
          className={cn(
            'w-2 h-2 rounded-full',
            isSigned ? 'bg-emerald-400' : 'bg-amber-400'
          )}
        />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getStepFormData(
  action: CorrectiveAction,
  step: WorkflowStep
): Record<string, string> {
  switch (step) {
    case 'identification':
      return {
        title: action.title || '',
        description: action.description || '',
        date_received: action.date_received || '',
        priority: action.priority || '',
        source_type: action.source_type || '',
        regulation_cited: action.regulation_cited || '',
        issuing_agency: action.issuing_agency || '',
        issuing_person: action.issuing_person || '',
      };
    case 'root_cause_analysis':
      return {
        contributing_factors: action.contributing_factors || '',
        root_cause: action.root_cause || '',
      };
    case 'corrective_action_plan':
      return {
        immediate_mitigation: action.immediate_mitigation || '',
        action_taken: action.action_taken || '',
      };
    case 'preventive_action':
      return {
        preventive_action: action.preventive_action || '',
        documents_requiring_revision: action.documents_requiring_revision || '',
      };
    case 'implementation':
      return {
        completed_date: action.completed_date || '',
        notes: action.notes || '',
      };
    case 'verification':
      return {
        effectiveness_assessment: action.effectiveness_assessment || '',
        verified_by: action.verified_by || '',
        verified_date: action.verified_date || '',
      };
    case 'closure':
      return {};
    default:
      return {};
  }
}
