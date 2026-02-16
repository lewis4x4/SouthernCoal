import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  Clock,
  FileText,
  MapPin,
  User,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { GlassBadge } from '@/components/ui/GlassBadge';
import { GlassButton } from '@/components/ui/GlassButton';
import { CorrectiveActionWorkflow } from './CorrectiveActionWorkflow';
import { CorrectiveActionForm } from './CorrectiveActionForm';
import { usePermissions } from '@/hooks/usePermissions';
import { useWorkflowTransition } from '@/hooks/useWorkflowTransition';
import { useCorrectiveActionsStore } from '@/stores/correctiveActions';
import {
  type CorrectiveAction,
  type WorkflowStep,
  WORKFLOW_STEP_LABELS,
  CA_PRIORITY_LABELS,
  CA_STATUS_LABELS,
  SOURCE_TYPE_LABELS,
  isOverdue,
  getDaysOverdue,
  getDaysOpen,
} from '@/types/corrective-actions';

interface CorrectiveActionDetailProps {
  action: CorrectiveAction;
  onGeneratePdf?: () => void;
  onOpenSignature?: (type: 'responsible' | 'approver') => void;
}

/**
 * Detail view for a corrective action.
 * Left panel: Form sections
 * Right panel: Workflow stepper, source info, metadata
 */
export function CorrectiveActionDetail({
  action,
  onGeneratePdf,
  onOpenSignature,
}: CorrectiveActionDetailProps) {
  const { can } = usePermissions();
  const { advanceStep, closeAction, reopenAction, validateStep } =
    useWorkflowTransition();
  const { openSignatureModal } = useCorrectiveActionsStore();

  const [activeStep, setActiveStep] = useState<WorkflowStep>(
    action.workflow_step
  );
  const [advancing, setAdvancing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);

  const validation = validateStep(action);
  const isAtClosure = action.workflow_step === 'closure';
  const isClosed = action.status === 'closed';

  // Handle advance step
  const handleAdvance = async () => {
    setAdvancing(true);
    const result = await advanceStep(action.id);
    setAdvancing(false);
    if (result.error) {
      console.error('Failed to advance:', result.error);
    }
  };

  // Handle close action
  const handleClose = async () => {
    setClosing(true);
    const result = await closeAction(action.id);
    setClosing(false);
    if (result.error) {
      console.error('Failed to close:', result.error);
    }
  };

  // Handle reopen
  const handleReopen = async () => {
    setReopening(true);
    const result = await reopenAction(action.id, 'Reopened for review');
    setReopening(false);
    if (result.error) {
      console.error('Failed to reopen:', result.error);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left Panel: Form */}
      <div className="flex-1 lg:w-[60%] space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Link
              to="/corrective-actions"
              className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors mb-3"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to List
            </Link>
            <h1 className="text-xl font-semibold text-text-primary">
              {action.title}
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <GlassBadge variant={getPriorityVariant(action.priority)}>
                {CA_PRIORITY_LABELS[action.priority]}
              </GlassBadge>
              <GlassBadge variant={getStatusVariant(action.status)}>
                {CA_STATUS_LABELS[action.status]}
              </GlassBadge>
              {isOverdue(action) && (
                <GlassBadge variant="failed">
                  {getDaysOverdue(action)}d Overdue
                </GlassBadge>
              )}
            </div>
          </div>
        </div>

        {/* Form Section */}
        <SpotlightCard className="p-6">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/[0.06]">
            <h2 className="text-sm font-medium text-text-secondary">
              {WORKFLOW_STEP_LABELS[activeStep]}
            </h2>
            {activeStep !== action.workflow_step && (
              <button
                onClick={() => setActiveStep(action.workflow_step)}
                className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                Go to current step
              </button>
            )}
          </div>
          <CorrectiveActionForm action={action} step={activeStep} />
        </SpotlightCard>

        {/* Action Bar */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center gap-2">
            {/* Signature buttons for closure step */}
            {isAtClosure && !isClosed && (
              <>
                {can('ca_sign_responsible') &&
                  !action.responsible_person_signed_at && (
                    <GlassButton
                      variant="primary"
                      onClick={() => {
                        openSignatureModal('responsible');
                        onOpenSignature?.('responsible');
                      }}
                    >
                      Sign as Responsible
                    </GlassButton>
                  )}
                {can('ca_sign_approver') && !action.approved_by_signed_at && (
                  <GlassButton
                    variant="primary"
                    onClick={() => {
                      openSignatureModal('approver');
                      onOpenSignature?.('approver');
                    }}
                    disabled={!action.responsible_person_signed_at}
                    title={
                      !action.responsible_person_signed_at
                        ? 'Responsible person must sign first'
                        : undefined
                    }
                  >
                    Sign as Approver
                  </GlassButton>
                )}
              </>
            )}

            {/* Reopen button for closed actions */}
            {isClosed && can('ca_reopen') && (
              <GlassButton
                variant="ghost"
                onClick={handleReopen}
                loading={reopening ? 'Reopening...' : undefined}
              >
                Reopen Action
              </GlassButton>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Generate PDF */}
            {can('ca_generate_pdf') && (
              <GlassButton variant="ghost" onClick={onGeneratePdf}>
                <FileText className="h-4 w-4 mr-1.5" />
                Generate PDF
              </GlassButton>
            )}

            {/* Advance / Close buttons */}
            {!isClosed && can('ca_advance_workflow') && (
              <>
                {isAtClosure ? (
                  <GlassButton
                    variant="success"
                    onClick={handleClose}
                    loading={closing ? 'Closing...' : undefined}
                    disabled={!validation.valid}
                    title={
                      !validation.valid
                        ? `Missing: ${validation.missing.join(', ')}`
                        : undefined
                    }
                  >
                    Close Action
                  </GlassButton>
                ) : (
                  <GlassButton
                    variant="primary"
                    onClick={handleAdvance}
                    loading={advancing ? 'Advancing...' : undefined}
                    disabled={!validation.valid}
                    title={
                      !validation.valid
                        ? `Missing: ${validation.missing.join(', ')}`
                        : undefined
                    }
                  >
                    Advance Step
                  </GlassButton>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel: Sidebar */}
      <div className="lg:w-[40%] space-y-6">
        {/* Workflow Stepper */}
        <SpotlightCard className="p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-4">
            Workflow Progress
          </h3>
          <CorrectiveActionWorkflow
            action={action}
            onStepClick={setActiveStep}
          />
        </SpotlightCard>

        {/* Source Information */}
        <SpotlightCard className="p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-4">
            Source Information
          </h3>
          <div className="space-y-3">
            <InfoRow
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Source Type"
              value={SOURCE_TYPE_LABELS[action.source_type]}
            />
            {action.site_name && (
              <InfoRow
                icon={<MapPin className="h-4 w-4" />}
                label="Site"
                value={action.site_name}
              />
            )}
            {action.permit_number && (
              <InfoRow
                icon={<FileText className="h-4 w-4" />}
                label="Permit"
                value={action.permit_number}
              />
            )}
            {action.state && (
              <InfoRow
                icon={<MapPin className="h-4 w-4" />}
                label="State"
                value={action.state}
              />
            )}
            {action.source_id && (
              <div className="pt-2 border-t border-white/[0.06]">
                <button className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors inline-flex items-center gap-1">
                  View Source Record
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </SpotlightCard>

        {/* Metadata */}
        <SpotlightCard className="p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-4">
            Details
          </h3>
          <div className="space-y-3">
            {action.assigned_to_name && (
              <InfoRow
                icon={<User className="h-4 w-4" />}
                label="Assigned To"
                value={action.assigned_to_name}
              />
            )}
            {action.due_date && (
              <InfoRow
                icon={<Calendar className="h-4 w-4" />}
                label="Due Date"
                value={formatDate(action.due_date)}
                variant={isOverdue(action) ? 'error' : undefined}
              />
            )}
            <InfoRow
              icon={<Clock className="h-4 w-4" />}
              label="Days Open"
              value={`${getDaysOpen(action)} days`}
            />
            <InfoRow
              icon={<Calendar className="h-4 w-4" />}
              label="Created"
              value={formatDate(action.created_at)}
            />
            {action.closed_date && (
              <InfoRow
                icon={<Calendar className="h-4 w-4" />}
                label="Closed"
                value={formatDate(action.closed_date)}
              />
            )}
          </div>
        </SpotlightCard>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helper Components
// -----------------------------------------------------------------------------

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  variant?: 'default' | 'error';
}

function InfoRow({ icon, label, value, variant = 'default' }: InfoRowProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-text-muted">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-text-muted">{label}</div>
        <div
          className={cn(
            'text-sm truncate',
            variant === 'error' ? 'text-red-400' : 'text-text-primary'
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getPriorityVariant(
  priority: string
): 'failed' | 'processing' | 'queued' | 'parsed' {
  switch (priority) {
    case 'critical':
      return 'failed';
    case 'high':
      return 'processing';
    case 'medium':
      return 'parsed';
    default:
      return 'queued';
  }
}

function getStatusVariant(
  status: string
): 'queued' | 'processing' | 'parsed' | 'verified' | 'imported' {
  switch (status) {
    case 'open':
      return 'queued';
    case 'in_progress':
      return 'processing';
    case 'completed':
      return 'parsed';
    case 'verified':
      return 'verified';
    case 'closed':
      return 'imported';
    default:
      return 'queued';
  }
}
