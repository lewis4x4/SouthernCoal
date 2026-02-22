import { useState } from 'react';
import { FileText, LayoutGrid, History, Sparkles } from 'lucide-react';
import { ReportHubTab } from '@/components/reports/ReportHubTab';
import { ReportHistoryTab } from '@/components/reports/ReportHistoryTab';
import { ReportAssistantTab } from '@/components/reports/ReportAssistantTab';

type Tab = 'hub' | 'history' | 'assistant';

export function Reports() {
  const [tab, setTab] = useState<Tab>('hub');

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
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
              tab === key
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
