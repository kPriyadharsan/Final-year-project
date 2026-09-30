const BADGE_VARIANTS = {
  success: {
    container: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
    dot: 'bg-emerald-400',
  },
  warning: {
    container: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
    dot: 'bg-amber-400',
  },
  danger: {
    container: 'bg-rose-500/10 text-rose-300 border-rose-500/25',
    dot: 'bg-rose-400',
  },
  info: {
    container: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25',
    dot: 'bg-cyan-400',
  },
  purple: {
    container: 'bg-purple-500/10 text-purple-300 border-purple-500/25',
    dot: 'bg-purple-400',
  },
  neutral: {
    container: 'bg-slate-800 text-slate-300 border-slate-700/80',
    dot: 'bg-slate-400',
  },
}

const BADGE_SIZES = {
  sm: 'text-[11px] px-2 py-0.5 rounded-md gap-1.5',
  md: 'text-xs px-2.5 py-1 rounded-lg gap-2',
}

/**
 * Reusable Status Badge Component
 *
 * @param {Object} props
 * @param {'success'|'warning'|'danger'|'info'|'purple'|'neutral'} [props.variant='neutral']
 * @param {'sm'|'md'} [props.size='sm']
 * @param {boolean} [props.dot=false]
 * @param {boolean} [props.pulse=false]
 * @param {string} [props.className]
 * @param {React.ReactNode} [props.children]
 */
export function Badge({
  variant = 'neutral',
  size = 'sm',
  dot = false,
  pulse = false,
  className = '',
  children,
  ...rest
}) {
  const currentVariant = BADGE_VARIANTS[variant] || BADGE_VARIANTS.neutral
  const currentSize = BADGE_SIZES[size] || BADGE_SIZES.sm

  return (
    <span
      className={`inline-flex items-center font-medium border font-mono tracking-tight select-none ${currentVariant.container} ${currentSize} ${className}`}
      {...rest}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {pulse && (
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${currentVariant.dot}`}
            ></span>
          )}
          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${currentVariant.dot}`}></span>
        </span>
      )}
      {children}
    </span>
  )
}
