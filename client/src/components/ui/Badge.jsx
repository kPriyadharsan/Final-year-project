const BADGE_VARIANTS = {
  success: {
    container: 'bg-emerald-50/90 text-emerald-700 border-emerald-200/70',
    dot: 'bg-emerald-500',
  },
  warning: {
    container: 'bg-amber-50/90 text-amber-700 border-amber-200/70',
    dot: 'bg-amber-500',
  },
  danger: {
    container: 'bg-rose-50/90 text-rose-700 border-rose-200/70',
    dot: 'bg-rose-500',
  },
  info: {
    container: 'bg-sky-50/90 text-sky-700 border-sky-200/70',
    dot: 'bg-sky-500',
  },
  purple: {
    container: 'bg-purple-50/90 text-purple-700 border-purple-200/70',
    dot: 'bg-purple-500',
  },
  neutral: {
    container: 'bg-slate-100/90 text-slate-700 border-slate-200/70',
    dot: 'bg-slate-500',
  },
}

const BADGE_SIZES = {
  sm: 'text-[11px] px-2.5 py-0.5 rounded-full gap-1.5 font-medium',
  md: 'text-xs px-3 py-1 rounded-full gap-2 font-semibold',
}

/**
 * Apple iOS 27 Status Pill Badge Component
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
      className={`inline-flex items-center border select-none tracking-tight shadow-[0_1px_2px_rgba(0,0,0,0.02)] ${currentVariant.container} ${currentSize} ${className}`}
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
