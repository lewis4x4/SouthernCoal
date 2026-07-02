import { Database } from 'lucide-react';
import { EchoCoveragePanel } from '@/components/external-data/EchoCoveragePanel';
import { MshaCoveragePanel } from '@/components/external-data/MshaCoveragePanel';

export function ExternalDataPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Database size={20} className="text-qo-accent" />
          <h1 className="text-xl font-semibold text-text-primary">External Data Sync</h1>
        </div>
        <p className="text-sm text-text-secondary">
          EPA ECHO facility coverage, NPDES registry mapping, and MSHA violation sync — operational aids only.
        </p>
        <p className="inline-flex items-center gap-1.5 rounded-md border border-qo-ochre/30 bg-qo-ochre/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-qo-ochre-text">
          DRAFT — verify all external feeds and mappings before regulatory reliance
        </p>
      </header>

      <EchoCoveragePanel />
      <MshaCoveragePanel />
    </div>
  );
}
