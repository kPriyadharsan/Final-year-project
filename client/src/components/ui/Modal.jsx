import { useEffect } from 'react'
import { X } from 'lucide-react'

const MODAL_SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

/**
 * Apple iOS 27 Liquid Glass Modal / Sheet Component
 */
export function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  closeOnBackdrop = true,
  footer,
  children,
}) {
  // Listen for Escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Prevent background scrolling
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  const sizeClass = MODAL_SIZES[size] || MODAL_SIZES.md

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      {/* Translucent Light Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/25 backdrop-blur-md transition-opacity"
        onClick={() => closeOnBackdrop && onClose?.()}
      />

      {/* Dialog Window - Liquid Glass Sheet */}
      <div
        className={`relative w-full ${sizeClass} bg-white/95 backdrop-blur-3xl border border-white/80 rounded-2xl sm:rounded-[32px] shadow-2xl p-4 sm:p-7 z-10 my-auto max-h-[92vh] flex flex-col overflow-hidden`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 sm:pb-4 border-b border-slate-100 shrink-0">
          <div className="min-w-0 flex-1">
            {title && (
              <h2 className="text-base sm:text-xl font-bold text-slate-900 tracking-tight truncate">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-xs text-slate-500 mt-0.5 sm:mt-1">{description}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body with Internal Scroll */}
        <div className="py-3 sm:py-4 text-sm text-slate-700 overflow-y-auto max-h-[calc(92vh-140px)] pr-1">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="pt-3 sm:pt-4 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2 sm:gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
