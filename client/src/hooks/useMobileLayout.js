import { useState, useEffect } from 'react'

/**
 * useMobileLayout
 * Comprehensive responsive hook for detecting mobile viewport,
 * screen breakpoints, orientation, touch capabilities, and dynamic viewport height.
 */
export function useMobileLayout() {
  const [dimensions, setDimensions] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  }))

  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [orientation, setOrientation] = useState('portrait')

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Detect touch device
    const touchCheck =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches
    setIsTouchDevice(touchCheck)

    const handleResize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      setDimensions({ width: w, height: h })
      setOrientation(w > h ? 'landscape' : 'portrait')

      // Fix mobile browser address bar jump (100vh issue)
      const vh = h * 0.01
      document.documentElement.style.setProperty('--vh', `${vh}px`)
      document.documentElement.style.setProperty('--app-height', `${h}px`)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [])

  const { width, height } = dimensions

  // Industry-standard breakpoints
  const isSmallMobile = width < 480
  const isMobile = width < 768
  const isTablet = width >= 768 && width < 1024
  const isDesktop = width >= 1024
  const isLargeDesktop = width >= 1440

  return {
    width,
    height,
    isSmallMobile,
    isMobile,
    isTablet,
    isDesktop,
    isLargeDesktop,
    orientation,
    isTouchDevice,
  }
}
