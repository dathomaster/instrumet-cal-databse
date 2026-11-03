import { useQuery } from '@powersync/react'

/**
 * Row comparator for incremental watch queries ("Incremental Watch Queries" in
 * the PowerSync docs). This is an exact copy of PowerSync's own built-in
 * DEFAULT_ROW_COMPARATOR (@powersync/shared-internals, DifferentialQueryProcessor),
 * which the SDK marks @internal and doesn't export: rows are keyed by their
 * string `id` (or their full JSON if they have none) and compared by full JSON.
 * Module-level constant so the hook options stay referentially stable.
 */
export const ROW_COMPARATOR = {
  keyBy: (item: unknown): string => {
    if (item && typeof item == 'object' && typeof (item as Record<string, unknown>)['id'] == 'string') {
      return (item as Record<string, string>)['id']
    }
    return JSON.stringify(item)
  },
  compareBy: (item: unknown): string => JSON.stringify(item)
}

/**
 * `useQuery` with incremental updates: the component only re-renders when the
 * query result actually changes, and unchanged rows keep the same object
 * reference so `React.memo` row components skip re-rendering.
 * The returned array is read-only.
 */
export function useRows<T>(sql: string, parameters: unknown[] = []) {
  return useQuery<T>(sql, parameters, { rowComparator: ROW_COMPARATOR })
}
