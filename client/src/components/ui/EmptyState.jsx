import { FolderOpen } from 'lucide-react'

export function EmptyState({
  icon,
  title = 'No records found',
  description = 'There is currently no data available in this section.',
  action,
  className = '',
}) {
  return (
    <div
      className={`p-8 sm:p-12 text-center rounded-3xl border border-dashed border-slate-200 bg-white/50 backdrop-blur-md flex flex-col items-center justify-center max-w-lg mx-auto my-6 shadow-sm ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-400 mb-4 shadow-sm">
        {icon || <FolderOpen className="w-6 h-6 text-slate-400" />}
      </div>

      <h3 className="text-base font-bold text-slate-800 tracking-tight">{title}</h3>

      {description && (
        <p className="text-xs text-slate-500 mt-1.5 max-w-sm leading-relaxed">
          {description}
        </p>
      )}

      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
