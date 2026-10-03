import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from './Button'

export function ErrorState({
  title = 'Unable to load data',
  message = 'An unexpected error occurred while communicating with the server.',
  onRetry,
  className = '',
}) {
  return (
    <div
      className={`p-8 sm:p-10 text-center rounded-3xl border border-rose-200/80 bg-rose-50/60 backdrop-blur-md flex flex-col items-center justify-center max-w-md mx-auto my-6 shadow-sm ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 mb-4 shadow-sm">
        <AlertTriangle className="w-6 h-6" />
      </div>

      <h3 className="text-base font-bold text-rose-900 tracking-tight">{title}</h3>

      <p className="text-xs text-rose-700/80 mt-1.5 max-w-sm leading-relaxed">
        {message}
      </p>

      {onRetry && (
        <div className="mt-5">
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            className="border-rose-300 text-rose-700 hover:bg-rose-100/60"
          >
            Retry Request
          </Button>
        </div>
      )}
    </div>
  )
}

export function AlertBanner({
  variant = 'danger',
  title,
  message,
  onDismiss,
  className = '',
}) {
  const styles = {
    danger: 'bg-rose-50 border-rose-200 text-rose-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-sky-50 border-sky-200 text-sky-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  }[variant]

  return (
    <div
      className={`p-4 rounded-2xl border text-xs flex items-start gap-3 shadow-sm ${styles} ${className}`}
      role="alert"
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="flex-1">
        {title && <span className="font-bold block mb-0.5">{title}</span>}
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="hover:opacity-75 font-bold cursor-pointer text-base leading-none"
          aria-label="Dismiss alert"
        >
          &times;
        </button>
      )}
    </div>
  )
}
