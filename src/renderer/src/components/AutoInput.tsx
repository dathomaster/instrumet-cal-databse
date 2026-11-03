import { useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { updateRow } from '@/lib/data'
import { cx } from './ui'

type Common = { table: string; rowId: string; field: string; value: string | number | null | undefined }

/**
 * An input bound to one column of one row. Saves to the local database on blur
 * (PowerSync syncs it). While not focused it follows the live value, so an edit
 * made by another technician appears immediately.
 */
function useAutoSave({ table, rowId, field, value }: Common) {
  const remote = value === null || value === undefined ? '' : String(value)
  const [v, setV] = useState(remote)
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setV(remote)
  }, [remote])
  return {
    value: v,
    onChange: (e: { target: { value: string } }) => setV(e.target.value),
    onFocus: () => { focused.current = true },
    onBlur: async () => {
      focused.current = false
      if (v !== remote) await updateRow(table, rowId, { [field]: v }, { [field]: remote })
    }
  }
}

const base = 'w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-slate-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:hover:border-transparent disabled:text-slate-700'

export function AutoInput({ table, rowId, field, value, className, boxed, ...props }: Common & { boxed?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value'>) {
  const bind = useAutoSave({ table, rowId, field, value })
  return (
    <input
      {...props}
      {...bind}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={cx(base, boxed && 'border-slate-300 bg-white shadow-xs', className)}
    />
  )
}

export function AutoTextarea({ table, rowId, field, value, className, ...props }: Common & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'>) {
  const bind = useAutoSave({ table, rowId, field, value })
  return <textarea rows={3} {...props} {...bind} className={cx(base, 'border-slate-300 bg-white shadow-xs', className)} />
}
