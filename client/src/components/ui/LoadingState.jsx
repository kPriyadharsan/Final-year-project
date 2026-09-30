import { Loader2 } from 'lucide-react'

/**
 * Standard Circular Spinner
 */
export function LoadingSpinner({ size = 'md', className = '' }) {
  const sizeMap = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  }
  const sizeClass = sizeMap[size] || sizeMap.md

  return (
    <Loader2
      className={`animate-spin text-indigo-400 shrink-0 ${sizeClass} ${className}`}
    />
  )
}

/**
 * Full page / panel loading state
 */
export function PageLoading({
  message = 'Loading Smart Classroom data...',
  className = '',
}) {
  return (
    <div
      className={`min-h-[40vh] flex flex-col items-center justify-center p-8 space-y-3.5 text-center ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
      <p className="text-xs font-mono text-slate-400 animate-pulse tracking-wide">
        {message}
      </p>
    </div>
  )
}

/**
 * Skeleton Card Loading Placeholder
 */
export function SkeletonCard({ className = '' }) {
  return (
    <div
      className={`p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 animate-pulse space-y-4 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="h-4 w-28 bg-slate-800 rounded"></div>
        <div className="h-8 w-8 bg-slate-800 rounded-lg"></div>
      </div>
      <div className="h-7 w-20 bg-slate-800 rounded"></div>
      <div className="h-3 w-40 bg-slate-800/60 rounded"></div>
    </div>
  )
}

/**
 * Skeleton Table Placeholder
 */
export function SkeletonTable({ rows = 4, className = '' }) {
  return (
    <div
      className={`rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-3 animate-pulse ${className}`}
    >
      <div className="h-7 bg-slate-800/80 rounded w-full mb-4"></div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center">
          <div className="h-4 bg-slate-800 rounded flex-1"></div>
          <div className="h-4 bg-slate-800/70 rounded w-24"></div>
          <div className="h-4 bg-slate-800/60 rounded w-16"></div>
        </div>
      ))}
    </div>
  )
}
