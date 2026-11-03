import { useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { updateRow } from '@/lib/data'
import { cx } from './ui'

type Common = { table: string; rowId: string; field: string; value: string | number | null | undefined; required?: boolean }

/**
 * An input bound to one column of one row. Saves to the local database on blur
 * (PowerSync syncs it). While not focused it follows the live value, so an edit
 * made by another technician appears immediately.
 */
function useAutoSave({ table, rowId, field, value, required }: Common) {
  const remote = value === null || value === undefined ? '' : String(value)
  const [v, setV] = useState(remote)
  const focused = useRef(false)
  // What the field showed when the technician clicked in. Only a change made by
  // *them* is saved — merely focusing and leaving a field must never write a
  // stale value over someone else's newer edit.
  const atFocus = useRef(remote)
  useEffect(() => {
    if (!focused.current) setV(remote)
  }, [remote])
  return {
    value: v,
    onChange: (e: { target: { value: string } }) => setV(e.target.value),
    onFocus: () => {
      focused.current = true
      atFocus.current = v
    },
    onBlur: async () => {
      focused.current = false
      if (required && v.trim() === '') {
        setV(remote) // can't be empty: put the saved value back instead of sending a change the server would refuse
        return
      }
      if (v !== atFocus.current) {
        await updateRow(table, rowId, { [field]: v }, { [field]: atFocus.current })
      } else if (v !== remote) {
        setV(remote) // untouched: catch up with any change made meanwhile by someone else
      }
    }
  }
}

const base = 'w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-slate-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:hover:border-transparent disabled:text-slate-700'

export function AutoInput({ table, rowId, field, value, required, className, boxed, ...props }: Common & { boxed?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value'>) {
  const bind = useAutoSave({ table, rowId, field, value, required })
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
