import { GlobalDropZone } from '@/components/dashboard/GlobalDropZone';
import { SummaryStats } from '@/components/dashboard/SummaryStats';
import { SmartStaging } from '@/components/dashboard/SmartStaging';
import { ProcessingQueue } from '@/components/dashboard/ProcessingQueue';
import { ComplianceMatrix } from '@/components/dashboard/ComplianceMatrix';
import { PriorityGuide } from '@/components/dashboard/PriorityGuide';
import { CommandPalette } from '@/components/dashboard/CommandPalette';

/**
 * Full Upload Dashboard page.
 * Layout: SummaryStats top → two-column (staging + queue | matrix + guide).
 * GlobalDropZone wraps all. CommandPalette floats as overlay.
 */
export function UploadDashboard() {
  return (
    <GlobalDropZone>
      <div className="space-y-6">
        {/* Page header */}
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Upload Dashboard</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Drag and drop files anywhere to begin uploading compliance documents.
          </p>
        </div>

        {/* Summary stats */}
        <SummaryStats />

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2/3 — Staging + Queue */}
          <div className="lg:col-span-2 space-y-6">
            <SmartStaging />
            <ProcessingQueue />
          </div>

          {/* Right 1/3 — Matrix + Priority Guide */}
          <div className="space-y-6">
            <ComplianceMatrix />
            <PriorityGuide />
          </div>
        </div>
      </div>

      {/* Command palette overlay — Cmd+K */}
      <CommandPalette />
    </GlobalDropZone>
  );
}
