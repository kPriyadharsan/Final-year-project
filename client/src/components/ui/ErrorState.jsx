import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from './Button'

/**
 * Reusable Error State Component (Panel or Page level)
 *
 * @param {Object} props
 * @param {string} [props.title='Unable to load data']
 * @param {string} [props.message] - Detailed error explanation
 * @param {Function} [props.onRetry] - Callback for retry action
 * @param {string} [props.className]
 */
export function ErrorState({
  title = 'Unable to load data',
  message = 'An unexpected error occurred while communicating with the server.',
  onRetry,
  className = '',
}) {
  return (
    <div
      className={`p-8 sm:p-10 text-center rounded-2xl border border-rose-500/20 bg-rose-500/5 flex flex-col items-center justify-center max-w-md mx-auto my-6 ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4 shadow-sm">
        <AlertTriangle className="w-6 h-6" />
      </div>

      <h3 className="text-base font-semibold text-rose-200 tracking-tight">{title}</h3>

      <p className="text-xs text-slate-400 mt-1.5 max-w-sm leading-relaxed">
        {message}
      </p>

      {onRetry && (
        <div className="mt-5">
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
          >
            Retry Request
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Inline Alert Banner Component
 */
export function AlertBanner({
  variant = 'danger',
  title,
  message,
  onDismiss,
  className = '',
}) {
  const styles = {
    danger: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
    warning: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    info: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300',
    success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
  }[variant]

  return (
    <div
      className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${styles} ${className}`}
      role="alert"
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="flex-1">
        {title && <span className="font-semibold block">{title}</span>}
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="hover:opacity-75 font-bold cursor-pointer text-sm leading-none"
          aria-label="Dismiss alert"
        >
          &times;
        </button>
      )}
    </div>
  )
}
