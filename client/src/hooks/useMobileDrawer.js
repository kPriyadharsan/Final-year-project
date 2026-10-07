import { useState, useCallback, useEffect } from 'react'

/**
 * useMobileDrawer
 * Manages mobile bottom sheet / drawer state,
 * including body scroll locking and backdrop dismiss.
 */
export function useMobileDrawer(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((prev) => !prev), [])

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (typeof document === 'undefined') return

    if (isOpen) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [isOpen])

  return {
    isOpen,
    open,
    close,
    toggle,
    setIsOpen,
  }
}
