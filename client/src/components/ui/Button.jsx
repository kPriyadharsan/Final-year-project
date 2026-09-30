import { Loader2 } from 'lucide-react'

const VARIANTS = {
  primary:
    'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-sm border border-indigo-500/30 focus-visible:ring-indigo-500',
  secondary:
    'bg-slate-800 hover:bg-slate-700 active:bg-slate-850 text-slate-100 border border-slate-700/80 focus-visible:ring-slate-500',
  outline:
    'bg-transparent hover:bg-slate-800/80 active:bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-600 focus-visible:ring-slate-500',
  ghost:
    'bg-transparent hover:bg-slate-800/70 active:bg-slate-800 text-slate-300 hover:text-white border border-transparent focus-visible:ring-slate-500',
  danger:
    'bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-sm border border-rose-500/30 focus-visible:ring-rose-500',
  success:
    'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-sm border border-emerald-500/30 focus-visible:ring-emerald-500',
}

const SIZES = {
  sm: 'h-8 px-2.5 text-xs rounded-lg gap-1.5',
  md: 'h-9 px-3.5 text-sm rounded-xl gap-2',
  lg: 'h-11 px-5 text-base rounded-xl gap-2.5',
}

/**
 * Reusable Button Component
 *
 * @param {Object} props
 * @param {'primary'|'secondary'|'outline'|'ghost'|'danger'|'success'} [props.variant='primary']
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {boolean} [props.isLoading=false]
 * @param {React.ReactNode} [props.leftIcon]
 * @param {React.ReactNode} [props.rightIcon]
 * @param {boolean} [props.disabled]
 * @param {string} [props.className]
 * @param {React.ReactNode} [props.children]
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
      className={`inline-flex items-center justify-center font-medium transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${variantStyles} ${sizeStyles} ${className}`}
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
