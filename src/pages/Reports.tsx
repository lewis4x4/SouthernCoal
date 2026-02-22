import { useState } from 'react';
import { FileText, LayoutGrid, History, Sparkles, Unlock, Lock } from 'lucide-react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useReportDefinitions } from '@/hooks/useReportDefinitions';
import { ReportHubTab } from '@/components/reports/ReportHubTab';
import { ReportHistoryTab } from '@/components/reports/ReportHistoryTab';
import { ReportAssistantTab } from '@/components/reports/ReportAssistantTab';

type Tab = 'hub' | 'history' | 'assistant';

export function Reports() {
  const [tab, setTab] = useState<Tab>('hub');
  const { definitions, accessible, unlocked, locked } = useReportDefinitions();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="inline-flex rounded-xl bg-emerald-500/10 p-2.5">
          <FileText className="h-6 w-6 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Report Engine
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            30 compliance reports across 5 tiers. Generate, schedule, and deliver court-ready outputs.
          </p>
        </div>
      </div>

      {/* Health Bar */}
      <div className="grid grid-cols-3 gap-3">
        <SpotlightCard
          spotlightColor="rgba(16, 185, 129, 0.08)"
          className="p-4"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-500/10 p-2">
              <Unlock className="h-4 w-4 text-green-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Available Now</p>
              <p className="text-3xl font-light tracking-tight bg-gradient-to-br from-white to-white/50 bg-clip-text text-transparent">
                {unlocked.length}
              </p>
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard
          spotlightColor="rgba(245, 158, 11, 0.08)"
          className="p-4"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2">
              <Lock className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Locked</p>
              <p className="text-3xl font-light tracking-tight bg-gradient-to-br from-white to-white/50 bg-clip-text text-transparent">
                {locked.length}
              </p>
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard
          spotlightColor="rgba(168, 85, 247, 0.08)"
          className="p-4"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-500/10 p-2">
              <FileText className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Your Access</p>
              <p className="text-3xl font-light tracking-tight bg-gradient-to-br from-white to-white/50 bg-clip-text text-transparent">
                {accessible.length}
                <span className="text-lg font-normal text-white/30 ml-1">/{definitions.length}</span>
              </p>
            </div>
          </div>
        </SpotlightCard>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-white/[0.03] p-1 border border-white/[0.06]">
        {[
          { key: 'hub' as Tab, label: 'Report Hub', icon: LayoutGrid },
          { key: 'assistant' as Tab, label: 'AI Assistant', icon: Sparkles },
          { key: 'history' as Tab, label: 'History', icon: History },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${tab === key
                ? 'bg-white/[0.08] text-text-primary'
                : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.03]'
              }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'hub' && <ReportHubTab />}
      {tab === 'assistant' && <ReportAssistantTab />}
      {tab === 'history' && <ReportHistoryTab />}
    </div>
  );
}
