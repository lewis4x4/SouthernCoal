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
  onReplace,
}: QuickPhrasePickerProps) {
  if (templates.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-4">
      <div className="text-sm font-medium text-text-muted">{title}</div>
      <p className="mt-1 text-sm text-text-secondary">{description}</p>
      <div className="mt-4 space-y-3">
        {templates.map((template) => (
          <div key={template.id} className="rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
            <div className="text-sm font-medium text-text-primary">{template.label}</div>
            <div className="mt-2 text-sm leading-6 text-text-secondary">{template.text}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAppend(template.text)}
                className="min-h-12 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm font-medium text-text-primary transition-colors hover:bg-white/[0.08] active:bg-white/[0.12] disabled:opacity-60"
              >
                Append
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onReplace(template.text)}
                className="min-h-12 rounded-2xl border border-cyan-500/25 bg-cyan-500/10 px-4 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-500/20 active:bg-cyan-500/25 disabled:opacity-60"
              >
                Replace
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
