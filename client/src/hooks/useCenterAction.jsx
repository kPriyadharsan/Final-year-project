import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'

const CenterActionContext = createContext(null)

/**
 * CenterActionProvider
 * Provides state management for the prominent mobile center button.
 * Any page (Voice, Device, Teacher, Admin) can configure the center button's
 * icon, label, pulsing glow, and click callback.
 */
export function CenterActionProvider({ children }) {
  const [centerAction, setCenterActionState] = useState({
    id: 'voice',
    label: 'Voice',
    ariaLabel: 'AI Voice Assistant',
    badge: null,
    isPulsing: true,
    onClick: null,
    gradient: 'from-purple-600 via-indigo-600 to-pink-500',
    shadow: 'shadow-indigo-500/35',
  })

  const registerCenterAction = useCallback((config) => {
    setCenterActionState((prev) => ({
      ...prev,
      ...config,
    }))
  }, [])

  const resetCenterAction = useCallback(() => {
    setCenterActionState({
      id: 'voice',
      label: 'Voice',
      ariaLabel: 'AI Voice Assistant',
      badge: null,
      isPulsing: true,
      onClick: null,
      gradient: 'from-purple-600 via-indigo-600 to-pink-500',
      shadow: 'shadow-indigo-500/35',
    })
  }, [])

  const value = useMemo(
    () => ({
      centerAction,
      registerCenterAction,
      resetCenterAction,
    }),
    [centerAction, registerCenterAction, resetCenterAction]
  )

  return (
    <CenterActionContext.Provider value={value}>
      {children}
    </CenterActionContext.Provider>
  )
}

export function useCenterAction(customConfig) {
  const context = useContext(CenterActionContext)
  if (!context) {
    // Graceful fallback if not inside provider
    return {
      centerAction: {
        id: 'voice',
        label: 'Voice',
        isPulsing: true,
      },
      registerCenterAction: () => {},
      resetCenterAction: () => {},
    }
  }

  // If custom config passed, register it on mount/update
  React.useEffect(() => {
    if (customConfig) {
      context.registerCenterAction(customConfig)
    }
  }, [customConfig, context])

  return context
}
