import { useRef, useCallback } from 'react'

/**
 * useSwipeGesture
 * Touch swipe detection for mobile screens.
 * Enables swipe-left/swipe-right for tab switching and swipe-down for sheet dismissal.
 */
export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  minSwipeDistance = 50,
  maxSwipeTime = 500,
} = {}) {
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 })

  const onTouchStart = useCallback((e) => {
    if (!e.touches || e.touches.length === 0) return
    const touch = e.touches[0]
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    }
  }, [])

  const onTouchEnd = useCallback(
    (e) => {
      if (!e.changedTouches || e.changedTouches.length === 0) return
      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - touchStartRef.current.x
      const deltaY = touch.clientY - touchStartRef.current.y
      const deltaTime = Date.now() - touchStartRef.current.time

      if (deltaTime > maxSwipeTime) return // Too slow for swipe

      const absX = Math.abs(deltaX)
      const absY = Math.abs(deltaY)

      if (Math.max(absX, absY) < minSwipeDistance) return // Below threshold

      if (absX > absY) {
        // Horizontal swipe
        if (deltaX < 0) {
          onSwipeLeft?.({ deltaX, deltaY, distance: absX })
        } else {
          onSwipeRight?.({ deltaX, deltaY, distance: absX })
        }
      } else {
        // Vertical swipe
        if (deltaY < 0) {
          onSwipeUp?.({ deltaX, deltaY, distance: absY })
        } else {
          onSwipeDown?.({ deltaX, deltaY, distance: absY })
        }
      }
    },
    [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, minSwipeDistance, maxSwipeTime]
  )

  return {
    touchHandlers: {
      onTouchStart,
      onTouchEnd,
    },
  }
}
