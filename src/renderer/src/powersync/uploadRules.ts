// Pure rules used by the upload connector — kept free of Supabase/PowerSync
// imports so they can be unit-tested (tests/unit/uploadRules.test.ts).

export type OpError = { code?: string; message: string; status?: number }

/**
 * Postgres error classes that will never succeed on retry:
 *  22xxx data exception, 23xxx integrity violation, 42501 RLS / permission,
 *  PGRST1xx/2xx request errors. Retrying them would block the upload queue
 *  forever, so they are recorded locally and skipped.
 */
export function isPermanent(error: OpError): boolean {
  // 401 = not (or no longer) signed in. Never drop a change for that — it
  // succeeds once the technician's session is back.
  if (error.status === 401) return false
  const code = error.code ?? ''
  return /^(22|23)/.test(code) || code === '42501' || /^PGRST[12]/.test(code)
}

/** SQLite/forms give '' for empty fields; Postgres numeric/date columns need null. */
export function clean(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data ?? {})) out[k] = v === '' ? null : v
  return out
}
