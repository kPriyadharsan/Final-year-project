import { Loader2 } from 'lucide-react'

export function LoadingSpinner({ size = 'md', className = '' }) {
  const sizeMap = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  }
  const sizeClass = sizeMap[size] || sizeMap.md

  return (
    <Loader2
      className={`animate-spin text-blue-600 shrink-0 ${sizeClass} ${className}`}
    />
  )
}

export function PageLoading({
  message = 'Loading Smart Classroom data...',
  className = '',
}) {
  return (
    <div
      className={`min-h-[40vh] flex flex-col items-center justify-center p-8 space-y-4 text-center ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200/80 flex items-center justify-center shadow-sm">
        <LoadingSpinner size="lg" />
      </div>
      <p className="text-xs font-medium text-slate-500 animate-pulse tracking-wide">
        {message}
      </p>
    </div>
  )
}

export function SkeletonCard({ className = '' }) {
  return (
    <div
      className={`p-6 rounded-3xl bg-white/70 border border-slate-200/70 animate-pulse space-y-4 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="h-4 w-28 bg-slate-200/70 rounded-full"></div>
        <div className="h-8 w-8 bg-slate-200/70 rounded-xl"></div>
      </div>
      <div className="h-7 w-20 bg-slate-200/70 rounded-xl"></div>
      <div className="h-3 w-40 bg-slate-200/50 rounded-full"></div>
    </div>
  )
}

export function SkeletonTable({ rows = 4, className = '' }) {
  return (
    <div
      className={`rounded-3xl border border-slate-200/70 bg-white/70 p-5 space-y-3.5 animate-pulse shadow-sm ${className}`}
    >
      <div className="h-8 bg-slate-200/70 rounded-xl w-full mb-4"></div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center">
          <div className="h-4 bg-slate-200/70 rounded-full flex-1"></div>
          <div className="h-4 bg-slate-200/60 rounded-full w-24"></div>
          <div className="h-4 bg-slate-200/50 rounded-full w-16"></div>
        </div>
      ))}
    </div>
  )
}
