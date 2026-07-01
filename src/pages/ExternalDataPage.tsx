import { EchoCoveragePanel } from '@/components/external-data/EchoCoveragePanel';
import { MshaCoveragePanel } from '@/components/external-data/MshaCoveragePanel';

export function ExternalDataPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <EchoCoveragePanel />
      <MshaCoveragePanel />
    </div>
  );
}
