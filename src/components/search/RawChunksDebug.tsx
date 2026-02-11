import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { DocumentChunk } from '@/types/search';

type SortField = 'similarity' | 'source_page' | 'file_name';
type SortDir = 'asc' | 'desc';

interface RawChunksDebugProps {
  chunks: DocumentChunk[];
}

export function RawChunksDebug({ chunks }: RawChunksDebugProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('similarity');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'similarity' ? 'desc' : 'asc');
    }
  }

  const sorted = useMemo(() => {
    return [...chunks].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [chunks, sortField, sortDir]);

  const SortIcon = sortDir === 'asc' ? ChevronUp : ChevronDown;

  return (
    <div className="rounded-xl border border-white/[0.06] overflow-hidden">
      <table className="w-full text-left text-xs">
        <thead className="bg-white/[0.06]">
          <tr>
            <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-text-muted w-8">
              #
            </th>
            <SortHeader
              label="File"
              field="file_name"
              active={sortField}
              icon={SortIcon}
              onClick={handleSort}
            />
            <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-text-muted">
              Type
            </th>
            <SortHeader
              label="Page"
              field="source_page"
              active={sortField}
              icon={SortIcon}
              onClick={handleSort}
            />
            <SortHeader
              label="Similarity"
              field="similarity"
              active={sortField}
              icon={SortIcon}
              onClick={handleSort}
            />
            <th className="px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-text-muted">
              State
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((chunk, i) => {
            const isExpanded = expandedId === chunk.id;
            const simPct = (chunk.similarity * 100).toFixed(1);
            const simColor =
              chunk.similarity >= 0.9
                ? 'text-emerald-400'
                : chunk.similarity >= 0.7
                  ? 'text-text-secondary'
                  : 'text-amber-400';

            return (
              <tr
                key={chunk.id}
                onClick={() => setExpandedId(isExpanded ? null : chunk.id)}
                className={cn(
                  'cursor-pointer border-b border-white/[0.04] transition-colors hover:bg-white/[0.04]',
                  i % 2 === 1 && 'bg-white/[0.02]',
                  isExpanded && 'bg-white/[0.04]',
                )}
              >
                <td className="px-3 py-2 font-mono text-text-muted">{i + 1}</td>
                <td className="px-3 py-2 text-text-secondary max-w-[180px] truncate" title={chunk.file_name}>
                  {chunk.file_name}
                </td>
                <td className="px-3 py-2 text-text-muted">{chunk.document_type || '—'}</td>
                <td className="px-3 py-2 font-mono text-text-secondary">
                  {chunk.source_page > 0 ? chunk.source_page : '—'}
                </td>
                <td className={cn('px-3 py-2 font-mono', simColor)}>
                  {simPct}%
                </td>
                <td className="px-3 py-2 text-text-muted">{chunk.state_code || '—'}</td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-text-muted">
                No chunks returned
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Expanded chunk text */}
      {expandedId && (
        <div className="border-t border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[10px] uppercase tracking-widest text-text-muted font-medium mb-2">
            Full Chunk Text
          </p>
          <pre className="whitespace-pre-wrap text-xs leading-relaxed text-text-secondary font-mono max-h-64 overflow-y-auto">
            {sorted.find((c) => c.id === expandedId)?.chunk_text || ''}
          </pre>
        </div>
      )}
    </div>
  );
}

function SortHeader({
  label,
  field,
  active,
  icon: Icon,
  onClick,
}: {
  label: string;
  field: SortField;
  active: SortField;
  icon: typeof ChevronDown;
  onClick: (f: SortField) => void;
}) {
  return (
    <th
      onClick={() => onClick(field)}
      className="cursor-pointer select-none px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-text-muted hover:text-text-secondary"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active === field && <Icon className="h-3 w-3" />}
      </span>
    </th>
  );
}
