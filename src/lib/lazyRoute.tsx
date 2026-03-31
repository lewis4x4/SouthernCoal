import { lazy, type ComponentType } from 'react';

/**
 * Lazy route loader with a catch boundary so a failed dynamic import does not
 * leave React in an unhandled-rejection state.
 */
export function lazyRoute<T extends Record<string, ComponentType<unknown>>>(
  loader: () => Promise<T>,
  exportName: keyof T & string,
) {
  return lazy(() =>
    loader()
      .then((mod) => {
        const C = mod[exportName] as ComponentType<unknown>;
        return { default: C };
      })
      .catch((err: unknown) => {
        console.error(`[lazyRoute] Failed to load "${exportName}"`, err);
        return {
          default: function RouteLoadError() {
            return (
              <div className="mx-auto flex min-h-[320px] max-w-md flex-col items-center justify-center gap-3 p-8 text-center text-sm text-red-300">
                <p>This screen failed to load. Check your connection and refresh the page.</p>
              </div>
            );
          },
        };
      }),
  );
}
