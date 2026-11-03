import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
      <ChevronLeft size={16} />{label}
    </Link>
  )
}
