import { cx } from './ui'

/** A small "pick one" button group, e.g. Tension / Compression / Both. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-slate-100 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cx('rounded-md px-3 py-1.5 text-sm font-medium', value === o.value ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900')}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
