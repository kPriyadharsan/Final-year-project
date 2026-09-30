import { FolderOpen } from 'lucide-react'

/**
 * Reusable Empty State Component
 *
 * @param {Object} props
 * @param {React.ReactNode} [props.icon] - Optional Lucide icon element
 * @param {string} props.title - Empty state headline
 * @param {string} [props.description] - Descriptive help text
 * @param {React.ReactNode} [props.action] - Optional action button or element
 * @param {string} [props.className]
 */
export function EmptyState({
  icon,
  title = 'No records found',
  description = 'There is currently no data available in this section.',
  action,
  className = '',
}) {
  return (
    <div
      className={`p-8 sm:p-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 flex flex-col items-center justify-center max-w-lg mx-auto my-6 ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-400 mb-4 shadow-sm">
        {icon || <FolderOpen className="w-6 h-6 text-slate-400" />}
      </div>

      <h3 className="text-base font-semibold text-white tracking-tight">{title}</h3>

      {description && (
        <p className="text-xs text-slate-400 mt-1.5 max-w-sm leading-relaxed">
          {description}
        </p>
      )}

      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
