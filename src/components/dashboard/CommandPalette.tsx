import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { useQueueStore } from '@/stores/queue';
import { useStagingStore } from '@/stores/staging';
import { usePermissions } from '@/hooks/usePermissions';
import { useQueueProcessing } from '@/hooks/useQueueProcessing';
import { useBulkQueueImport } from '@/hooks/useBulkQueueImport';
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
  Database,
} from 'lucide-react';

/**
 * Command palette (Cmd+K) — fuzzy search over dashboard actions.
 * RBAC-gated actions are filtered based on permissions.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { can } = usePermissions();
  const setFilters = useQueueStore((s) => s.setFilters);
  const clearAll = useStagingStore((s) => s.clearAll);
  const {
    processAllPermitPdfs,
    processAllParameterSheets,
    processAllQueuedLabData,
    processAllQueuedDmrs,
    processAllQueuedArchiveDocuments,
    retryFailed,
    canProcessQueueEntry,
  } = useQueueProcessing();
  const { importAllParsed, totalParsedImportable } = useBulkQueueImport();
  const entries = useQueueStore((s) => s.entries);
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
    const stagingClearCount =
      action === 'staging_clear_all' ? useStagingStore.getState().files.length : 0;
    fn();
    if (action === 'staging_clear_all') {
      log(
        'staging_clear_all',
        { source: 'command_palette', file_count: stagingClearCount },
        { module: 'upload_dashboard', tableName: 'upload_staging' },
      );
    }
    log('command_palette_action', { action });
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 "
        onClick={() => setOpen(false)}
      />

      {/* Dialog */}
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg">
        <Command
          className="rounded-2xl border border-black/[0.12] bg-white  shadow-2xl overflow-hidden"
          label="Command palette"
        >
          <div className="flex items-center gap-2 px-4 border-b border-black/[0.06]">
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
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-black/[0.04] data-[selected=true]:text-text-primary"
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
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-black/[0.04] data-[selected=true]:text-text-primary"
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
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-black/[0.04] data-[selected=true]:text-text-primary"
              >
                <Filter size={12} />
                Clear all filters
              </Command.Item>
            </Command.Group>

            {/* Actions */}
            <Command.Group heading="Actions" className="text-[10px] uppercase tracking-wider text-text-muted px-2 py-1.5">
              <Command.Item
                value="search compliance data natural language query"
                onSelect={() =>
                  runAction('navigate_search', () => navigate('/search'))
                }
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-black/[0.04] data-[selected=true]:text-text-primary"
              >
                <Search size={12} />
                Search compliance data
              </Command.Item>
              <Command.Item
                value="upload files drag drop"
                disabled={!can('upload')}
                onSelect={() => {
                  if (!can('upload')) return;
                  runAction('upload_hint', () => {
                    setOpen(false);
                  });
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-black/[0.04] data-[selected=true]:text-text-primary data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed"
                title={can('upload') ? undefined : 'Requires upload permission'}
              >
                <Upload size={12} />
                Upload files (drag & drop anywhere)
              </Command.Item>
              <Command.Item
                value="process all queued permits pdf"
                disabled={!can('bulk_process')}
                onSelect={() => {
                  if (!can('bulk_process')) return;
                  runAction('bulk_process_permits', () => processAllPermitPdfs());
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-black/[0.04] data-[selected=true]:text-text-primary data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed"
                title={can('bulk_process') ? undefined : 'Permission required for bulk processing'}
              >
                <Play size={12} />
                Process all queued permit PDFs
              </Command.Item>
              <Command.Item
                value="process all parameter sheets"
                disabled={!can('bulk_process')}
                onSelect={() => {
                  if (!can('bulk_process')) return;
                  runAction('bulk_process_parameter_sheets', () =>
                    processAllParameterSheets(),
                  );
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-black/[0.04] data-[selected=true]:text-text-primary data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed"
                title={can('bulk_process') ? undefined : 'Permission required for bulk processing'}
              >
                <Play size={12} />
                Process all parameter sheets
              </Command.Item>
              <Command.Item
                value="process all lab data"
                disabled={!can('bulk_process')}
                onSelect={() => {
                  if (!can('bulk_process')) return;
                  runAction('bulk_process_lab_data', () => processAllQueuedLabData());
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-black/[0.04] data-[selected=true]:text-text-primary data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed"
                title={can('bulk_process') ? undefined : 'Permission required for bulk processing'}
              >
                <Play size={12} />
                Process all queued lab data
              </Command.Item>
              <Command.Item
                value="process all dmrs netdmr"
                disabled={!can('bulk_process')}
                onSelect={() => {
                  if (!can('bulk_process')) return;
                  runAction('bulk_process_dmrs', () => processAllQueuedDmrs());
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-black/[0.04] data-[selected=true]:text-text-primary data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed"
                title={can('bulk_process') ? undefined : 'Permission required for bulk processing'}
              >
                <Play size={12} />
                Process all queued DMR exports
              </Command.Item>
              <Command.Item
                value="process all archive documents"
                disabled={!can('bulk_process')}
                onSelect={() => {
                  if (!can('bulk_process')) return;
                  runAction('bulk_process_archive', () => processAllQueuedArchiveDocuments());
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-black/[0.04] data-[selected=true]:text-text-primary data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed"
                title={can('bulk_process') ? undefined : 'Permission required for bulk processing'}
              >
                <Play size={12} />
                Process all archive documents
              </Command.Item>
              <Command.Item
                value="import all parsed to database"
                disabled={!can('process') || totalParsedImportable === 0}
                onSelect={() => {
                  if (!can('process') || totalParsedImportable === 0) return;
                  runAction('bulk_import_parsed', () => void importAllParsed());
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-black/[0.04] data-[selected=true]:text-text-primary data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed"
                title={
                  can('process')
                    ? totalParsedImportable === 0
                      ? 'No parsed files ready to import'
                      : undefined
                    : 'Permission required to import parsed files'
                }
              >
                <Database size={12} />
                Import all parsed to database ({totalParsedImportable})
              </Command.Item>
              <Command.Item
                value="retry all failed"
                disabled={!can('retry')}
                onSelect={() => {
                  if (!can('retry')) return;
                  runAction('retry_all_failed', () => {
                    const failed = entries.filter(
                      (e) => e.status === 'failed' && canProcessQueueEntry(e),
                    );
                    if (failed.length > 0) {
                      log(
                        'bulk_retry',
                        { count: failed.length, source: 'command_palette' },
                        { module: 'upload_dashboard', tableName: 'file_processing_queue' },
                      );
                    }
                    for (const entry of failed) {
                      void retryFailed(entry.id);
                    }
                  });
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-black/[0.04] data-[selected=true]:text-text-primary data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed"
                title={can('retry') ? undefined : 'Permission required to retry failed files'}
              >
                <RefreshCw size={12} />
                Retry all failed
              </Command.Item>
              <Command.Item
                value="export matrix csv"
                disabled={!can('export')}
                onSelect={() => {
                  if (!can('export')) return;
                  runAction('export_matrix_csv', () => {
                    document.dispatchEvent(new CustomEvent('export-matrix-csv'));
                  });
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-black/[0.04] data-[selected=true]:text-text-primary data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed"
                title={can('export') ? undefined : 'Permission required to export matrix'}
              >
                <Download size={12} />
                Export matrix as CSV
              </Command.Item>
              <Command.Item
                value="clear staging area"
                disabled={!can('upload')}
                onSelect={() => {
                  if (!can('upload')) return;
                  runAction('staging_clear_all', () => clearAll());
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-secondary cursor-pointer data-[selected=true]:bg-black/[0.04] data-[selected=true]:text-text-primary data-[disabled=true]:opacity-50 data-[disabled=true]:cursor-not-allowed"
                title={can('upload') ? undefined : 'Requires upload permission to clear staging'}
              >
                <Trash2 size={12} />
                Clear staging area
              </Command.Item>
            </Command.Group>
          </Command.List>

          <div className="px-4 py-2 border-t border-black/[0.06] text-[10px] text-text-muted flex items-center justify-between">
            <span>Navigate with ↑↓ · Select with ↵ · Close with Esc</span>
            <kbd className="px-1.5 py-0.5 rounded bg-black/[0.04] border border-black/[0.08] font-mono">
              ⌘K
            </kbd>
          </div>
        </Command>
      </div>
    </div>
  );
}
