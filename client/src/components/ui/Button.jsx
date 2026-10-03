import { Loader2 } from 'lucide-react'

const VARIANTS = {
  primary:
    'bg-[#0071e3] hover:bg-[#0077ed] active:bg-[#0062c4] text-white shadow-sm shadow-blue-500/20 border border-blue-400/20 focus-visible:ring-blue-500',
  secondary:
    'bg-slate-100/90 hover:bg-slate-200/90 active:bg-slate-200 text-slate-800 border border-slate-200/70 focus-visible:ring-slate-400',
  outline:
    'bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 border border-slate-200/80 shadow-sm focus-visible:ring-slate-400',
  ghost:
    'bg-transparent hover:bg-slate-100 active:bg-slate-200/60 text-slate-600 hover:text-slate-900 border border-transparent focus-visible:ring-slate-400',
  danger:
    'bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-sm shadow-rose-500/20 border border-rose-500/30 focus-visible:ring-rose-500',
  success:
    'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-sm shadow-emerald-500/20 border border-emerald-500/30 focus-visible:ring-emerald-500',
}

const SIZES = {
  sm: 'h-8 px-3 text-xs rounded-xl gap-1.5 font-medium',
  md: 'h-9 px-4 text-xs sm:text-sm rounded-2xl gap-2 font-medium',
  lg: 'h-11 px-5 text-sm sm:text-base rounded-2xl gap-2.5 font-semibold',
}

/**
 * Apple iOS 27 Button Component
 */
export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  disabled = false,
  className = '',
  children,
  type = 'button',
  ...rest
}) {
  const variantStyles = VARIANTS[variant] || VARIANTS.primary
  const sizeStyles = SIZES[size] || SIZES.md
  const isDisabled = disabled || isLoading

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center transition-all duration-150 select-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${variantStyles} ${sizeStyles} ${className}`}
      {...rest}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : (
        leftIcon && <span className="shrink-0">{leftIcon}</span>
      )}

      {children && <span>{children}</span>}

      {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  )
}
