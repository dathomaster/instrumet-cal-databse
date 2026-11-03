import { useQuery } from '@powersync/react'

/**
 * Row comparator recommended by the PowerSync docs ("Incremental Watch Queries"):
 * rows are matched by `id` (or, for rows without one, by their full contents)
 * and compared by their full JSON.
 * Module-level constant so the hook options stay referentially stable.
 */
export const ROW_COMPARATOR = {
  keyBy: (row: unknown) => {
    const id = (row as { id?: unknown })?.id
    return id != null ? String(id) : JSON.stringify(row)
  },
  compareBy: (row: unknown) => JSON.stringify(row)
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
