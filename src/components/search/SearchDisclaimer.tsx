export const SEARCH_DISCLAIMER_TEXT =
  'Search results are generated from your compliance database and may not reflect the most current data. Verify all results before use in regulatory submissions. This is a monitoring tool — not legal or environmental advice.';

export function SearchDisclaimer() {
  return (
    <p className="mt-4 text-[11px] italic leading-relaxed text-white/30">
      {SEARCH_DISCLAIMER_TEXT}
    </p>
  );
}
