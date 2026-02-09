import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useQueueStore } from '@/stores/queue';
import { useStagingStore } from '@/stores/staging';
import { usePermissions } from '@/hooks/usePermissions';
import { usePermitProcessing } from '@/hooks/usePermitProcessing';
import { useAuditLog } from '@/hooks/useAuditLog';
import { STATES, CATEGORIES } from '@/lib/constants';
import {
  Upload,
  Filter,
  Play,
  RefreshCw,
  Download,
  Trash2,
  Search,
} from 'lucide-react';

/**
 * Command palette (Cmd+K) — fuzzy search over dashboard actions.
 * RBAC-gated actions are filtered based on permissions.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const { can } = usePermissions();
  const setFilters = useQueueStore((s) => s.setFilters);
  const clearAll = useStagingStore((s) => s.clearAll);
  const { processAllQueued } = usePermitProcessing();
  const { log } = useAuditLog();

  // Cmd+K listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  function runAction(action: string, fn: () => void) {
    fn();
    log('command_palette_action', { action });
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Dialog */}
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg">
        <Command
          className="rounded-2xl border border-white/[0.12] bg-crystal-surface/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          label="Command palette"
        >
          <div className="flex items-center gap-2 px-4 border-b border-white/[0.06]">
            <Search size={16} className="text-text-muted" />
            <Command.Input
              placeholder="Type a command..."
              className="flex-1 h-12 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            />
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-text-muted">
              No results found.
            </Command.Empty>

            {/* Filter commands */}
            <Command.Group heading="Filter" className="text-[10px] uppercase tracking-wider text-text-muted px-2 py-1.5">
              {STATES.map((s) => (
                <Command.Item
                  key={`filter-state-${s.code}`}
                  value={`filter state ${s.code} ${s.name}`}
                  onSelect={() =>
                    runAction(`filter_state_${s.code}`, () =>
                      setFilters({ stateCode: s.code }),
                    )
                  }
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-text-primary"
                >
                  <Filter size={12} />
                  Filter by {s.code} — {s.name}
                </Command.Item>
              ))}
              {CATEGORIES.map((c) => (
                <Command.Item
                  key={`filter-cat-${c.dbKey}`}
                  value={`filter category ${c.label} ${c.dbKey}`}
                  onSelect={() =>
                    runAction(`filter_category_${c.dbKey}`, () =>
                      setFilters({ category: c.dbKey }),
                    )
                  }
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-text-primary"
                >
                  <Filter size={12} />
                  Filter by {c.label}
                </Command.Item>
              ))}
              <Command.Item
                value="clear all filters"
                onSelect={() =>
                  runAction('clear_filters', () =>
                    setFilters({ status: 'all', stateCode: 'all', category: 'all' }),
                  )
                }
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-text-primary"
              >
                <Filter size={12} />
                Clear all filters
              </Command.Item>
            </Command.Group>

            {/* Actions */}
            <Command.Group heading="Actions" className="text-[10px] uppercase tracking-wider text-text-muted px-2 py-1.5">
              {can('upload') && (
                <Command.Item
                  value="upload files drag drop"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-text-primary"
                >
                  <Upload size={12} />
                  Upload files (drag & drop)
                </Command.Item>
              )}
              {can('bulk_process') && (
                <Command.Item
                  value="process all queued permits"
                  onSelect={() =>
                    runAction('bulk_process', () => processAllQueued())
                  }
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-text-primary"
                >
                  <Play size={12} />
                  Process all queued permits
                </Command.Item>
              )}
              {can('retry') && (
                <Command.Item
                  value="retry all failed"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-text-primary"
                >
                  <RefreshCw size={12} />
                  Retry all failed
                </Command.Item>
              )}
              {can('export') && (
                <Command.Item
                  value="export matrix csv"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-text-primary"
                >
                  <Download size={12} />
                  Export matrix as CSV
                </Command.Item>
              )}
              <Command.Item
                value="clear staging area"
                onSelect={() =>
                  runAction('staging_clear_all', () => clearAll())
                }
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-text-primary"
              >
                <Trash2 size={12} />
                Clear staging area
              </Command.Item>
            </Command.Group>
          </Command.List>

          <div className="px-4 py-2 border-t border-white/[0.06] text-[10px] text-text-muted flex items-center justify-between">
            <span>Navigate with ↑↓ · Select with ↵ · Close with Esc</span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] font-mono">
              ⌘K
            </kbd>
          </div>
        </Command>
      </div>
    </div>
  );
}
