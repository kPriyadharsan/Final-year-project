import { useCallback } from 'react'

/**
 * useHaptics
 * Provides native mobile vibration haptic feedback patterns
 * for buttons, toggles, gestures, and confirmations.
 */
export function useHaptics() {
  const triggerHaptic = useCallback((pattern = 'light') => {
    if (typeof window === 'undefined' || !navigator.vibrate) return false

    try {
      switch (pattern) {
        case 'light':
        case 'selection':
          navigator.vibrate(10)
          break
        case 'medium':
          navigator.vibrate(22)
          break
        case 'heavy':
        case 'impact':
          navigator.vibrate(45)
          break
        case 'success':
          navigator.vibrate([15, 60, 20])
          break
        case 'warning':
          navigator.vibrate([25, 40, 25])
          break
        case 'error':
          navigator.vibrate([40, 60, 40, 60, 40])
          break
        default:
          if (typeof pattern === 'number' || Array.isArray(pattern)) {
            navigator.vibrate(pattern)
          } else {
            navigator.vibrate(12)
          }
      }
      return true
    } catch {
      return false
    }
  }, [])

  return { triggerHaptic }
}
