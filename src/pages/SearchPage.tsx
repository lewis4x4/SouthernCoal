import { Search } from 'lucide-react';
import { ComplianceSearch } from '@/components/search/ComplianceSearch';

export function SearchPage() {
  return (
    <div className="space-y-8 py-8">
      {/* Header */}
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-2xl bg-blue-500/10 p-3">
            <Search className="h-7 w-7 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Compliance Search
            </h1>
            <p className="text-sm text-text-secondary">
              Ask questions about permits, exceedances, penalties, sampling, and facilities in plain English.
            </p>
          </div>
        </div>
      </div>

      {/* Search interface */}
      <ComplianceSearch />
    </div>
  );
}
