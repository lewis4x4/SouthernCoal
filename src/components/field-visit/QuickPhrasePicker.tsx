import { Check } from 'lucide-react';
import { useState } from 'react';
import type { QuickPhraseTemplate } from '@/lib/fieldVisitTemplates';

interface QuickPhrasePickerProps {
  title: string;
  description: string;
  templates: QuickPhraseTemplate[];
  disabled?: boolean;
  onAppend: (text: string) => void;
  onReplace: (text: string) => void;
}

export function QuickPhrasePicker({
  title,
  description,
  templates,
  disabled = false,
  onAppend,
}: QuickPhrasePickerProps) {
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());

  if (templates.length === 0) return null;

  function handleUse(template: QuickPhraseTemplate) {
    onAppend(template.text);
    setUsedIds((prev) => new Set(prev).add(template.id));
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-4">
      <div className="text-sm font-medium text-text-muted">{title}</div>
      <p className="mt-1 text-sm text-text-secondary">{description}</p>
      <div className="mt-3 space-y-2">
        {templates.map((template) => {
          const used = usedIds.has(template.id);
          return (
            <button
              key={template.id}
              type="button"
              disabled={disabled}
              onClick={() => handleUse(template)}
              className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                used
                  ? 'border-emerald-500/20 bg-emerald-500/[0.06]'
                  : 'border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.05] active:bg-white/[0.08]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-text-primary">{template.label}</span>
                {used ? (
                  <Check className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                ) : (
                  <span className="shrink-0 text-xs text-text-muted">Tap to add</span>
                )}
              </div>
              <div className="mt-1 text-xs leading-5 text-text-secondary">{template.text}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
