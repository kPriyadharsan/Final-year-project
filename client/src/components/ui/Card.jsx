/**
 * Reusable Card Components
 */

export function Card({ className = '', children, ...rest }) {
  return (
    <div
      className={`bg-slate-900/60 border border-slate-800/80 rounded-2xl backdrop-blur-md shadow-sm transition-all ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className = '', children, ...rest }) {
  return (
    <div
      className={`p-5 sm:p-6 pb-4 border-b border-slate-800/60 flex items-start justify-between gap-4 ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardTitle({ className = '', children, ...rest }) {
  return (
    <h3
      className={`text-base font-semibold text-white tracking-tight ${className}`}
      {...rest}
    >
      {children}
    </h3>
  )
}

export function CardDescription({ className = '', children, ...rest }) {
  return (
    <p
      className={`text-xs text-slate-400 mt-1 leading-relaxed ${className}`}
      {...rest}
    >
      {children}
    </p>
  )
}

export function CardContent({ className = '', children, ...rest }) {
  return (
    <div className={`p-5 sm:p-6 ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function CardFooter({ className = '', children, ...rest }) {
  return (
    <div
      className={`p-4 sm:p-6 pt-4 border-t border-slate-800/60 flex items-center justify-between gap-3 ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

/**
 * Educational Technology Stat / Metric Card
 *
 * @param {Object} props
 * @param {string} props.title - Metric title (e.g. "Active Classrooms")
 * @param {string|number} props.value - Display value (e.g. "12 / 14")
 * @param {React.ReactNode} [props.icon] - Lucide icon element
 * @param {string} [props.description] - Subtitle or supporting note
 * @param {React.ReactNode} [props.badge] - Optional status badge component
 * @param {string} [props.className]
 */
export function StatCard({
  title,
  value,
  icon,
  description,
  badge,
  className = '',
  ...rest
}) {
  return (
    <Card className={`p-5 sm:p-6 relative overflow-hidden ${className}`} {...rest}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
            {title}
          </span>
          <div className="mt-2 text-2xl font-bold font-mono text-white tracking-tight">
            {value}
          </div>
          {description && (
            <p className="text-xs text-slate-400 mt-1">{description}</p>
          )}
        </div>

        {icon && (
          <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-indigo-400 shrink-0">
            {icon}
          </div>
        )}
      </div>

      {badge && <div className="mt-4 pt-3 border-t border-slate-800/60">{badge}</div>}
    </Card>
  )
}
