import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface SearchSQLPreviewProps {
  sql: string;
  description: string;
}

export function SearchSQLPreview({ sql, description }: SearchSQLPreviewProps) {
  const [expanded, setExpanded] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(sql);
    toast.success('SQL copied to clipboard');
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-muted transition-colors hover:text-text-secondary"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        View generated SQL
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.06] px-3 py-3">
              <p className="mb-2 text-xs text-text-secondary">{description}</p>
              <div className="relative">
                <pre className="overflow-x-auto rounded-md bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-emerald-300/80">
                  {sql}
                </pre>
                <button
                  onClick={handleCopy}
                  className="absolute top-2 right-2 rounded p-1 text-text-muted transition-colors hover:bg-white/[0.06] hover:text-text-secondary"
                  title="Copy SQL"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
