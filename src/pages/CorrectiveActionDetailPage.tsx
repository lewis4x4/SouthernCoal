import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';
import { useCorrectiveActions } from '@/hooks/useCorrectiveActions';
import { useWorkflowTransition } from '@/hooks/useWorkflowTransition';
import { useCorrectiveActionsStore } from '@/stores/correctiveActions';
import { CorrectiveActionDetail } from '@/components/corrective-actions/CorrectiveActionDetail';
import { CorrectiveActionSignature } from '@/components/corrective-actions/CorrectiveActionSignature';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export function CorrectiveActionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { can, loading: permissionsLoading } = usePermissions();
  const { allActions, loading, fetchActivities } = useCorrectiveActions();
  const { recordSignature } = useWorkflowTransition();
  const { signatureModalOpen, signatureType, closeSignatureModal } =
    useCorrectiveActionsStore();

  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Find the action by ID
  const action = allActions.find((a) => a.id === id);

  // RBAC gate
  useEffect(() => {
    if (permissionsLoading) return;
    if (!can('ca_view')) {
      navigate('/dashboard', { replace: true });
    }
  }, [can, permissionsLoading, navigate]);

  // Fetch activities when action is loaded
  useEffect(() => {
    if (action?.id) {
      fetchActivities(action.id);
    }
  }, [action?.id, fetchActivities]);

  // Handle PDF generation
  const handleGeneratePdf = async () => {
    if (!action || !session?.access_token) return;

    setGeneratingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'generate-corrective-action-pdf',
        {
          body: { corrective_action_id: action.id },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (error) {
        toast.error(`Failed to generate PDF: ${error.message}`);
        return;
      }

      if (data?.pdf_url) {
        // Open PDF in new tab
        window.open(data.pdf_url, '_blank');
        toast.success('PDF generated successfully');
      }
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Handle signature confirmation
  const handleSignatureConfirm = async () => {
    if (!action || !signatureType) return;

    const result = await recordSignature(action.id, signatureType);

    if (result.error) {
      toast.error(`Failed to record signature: ${result.error}`);
    } else {
      toast.success(
        signatureType === 'responsible'
          ? 'Signed as Responsible Person'
          : 'Signed as Approver'
      );
      closeSignatureModal();
    }
  };

  // Loading state
  if (permissionsLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-text-muted">Loading...</div>
      </div>
    );
  }

  // Not found
  if (!action) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="text-text-muted">Corrective action not found</div>
        <button
          onClick={() => navigate('/corrective-actions')}
          className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          Back to list
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CorrectiveActionDetail
        action={action}
        onGeneratePdf={handleGeneratePdf}
      />

      {/* Signature Modal */}
      <CorrectiveActionSignature
        open={signatureModalOpen}
        onClose={closeSignatureModal}
        onConfirm={handleSignatureConfirm}
        type={signatureType}
      />

      {/* PDF Generation Overlay */}
      {generatingPdf && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-surface-elevated border border-white/[0.06] rounded-xl p-6 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto mb-4" />
            <div className="text-sm text-text-primary">Generating PDF...</div>
            <div className="text-xs text-text-muted mt-1">
              This may take a few seconds
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
