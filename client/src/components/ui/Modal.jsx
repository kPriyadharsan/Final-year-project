import { useEffect } from 'react'
import { X } from 'lucide-react'

const MODAL_SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

/**
 * Reusable Base Modal Component
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {Function} props.onClose - Function to trigger when closing modal
 * @param {string} [props.title] - Modal title
 * @param {string} [props.description] - Supporting subtitle
 * @param {'sm'|'md'|'lg'|'xl'} [props.size='md'] - Max width size
 * @param {boolean} [props.closeOnBackdrop=true]
 * @param {React.ReactNode} [props.footer] - Optional footer action buttons
 * @param {React.ReactNode} props.children - Modal body content
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
  // Listen for Escape key to close modal
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

  // Prevent background scrolling when open
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={() => closeOnBackdrop && onClose?.()}
      />

      {/* Dialog Window */}
      <div
        className={`relative w-full ${sizeClass} bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-7 z-10 my-8 overflow-hidden`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            {title && (
              <h2 className="text-lg font-bold text-white tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-xs text-slate-400 mt-1">{description}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="py-4 text-sm text-slate-300">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
