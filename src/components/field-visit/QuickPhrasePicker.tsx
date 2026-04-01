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
    <div className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{title}</div>
      <p className="mt-2 text-sm text-text-secondary">{description}</p>
      <div className="mt-4 space-y-3">
        {templates.map((template) => (
          <div key={template.id} className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-3">
            <div className="text-sm font-medium text-text-primary">{template.label}</div>
            <div className="mt-2 text-sm leading-6 text-text-secondary">{template.text}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAppend(template.text)}
                className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-white/[0.08] disabled:opacity-60"
              >
                Append
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onReplace(template.text)}
                className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-500/20 disabled:opacity-60"
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
