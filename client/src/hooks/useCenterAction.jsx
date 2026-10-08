import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react'

const CenterActionContext = createContext(null)

const DEFAULT_ACTION = {
  id: 'voice',
  label: 'Voice',
  ariaLabel: 'AI Voice Assistant',
  badge: null,
  isPulsing: true,
  onClick: null,
  gradient: 'from-purple-600 via-indigo-600 to-pink-500',
  shadow: 'shadow-indigo-500/35',
}

/**
 * CenterActionProvider
 * Provides stable state management for the prominent mobile center button.
 * Uses a ref for the onClick callback and guards state updates against shallow equality
 * to prevent infinite re-render loops ("Maximum update depth exceeded").
 */
export function CenterActionProvider({ children }) {
  const [centerAction, setCenterActionState] = useState(DEFAULT_ACTION)
  const clickHandlerRef = useRef(null)

  const registerCenterAction = useCallback((config) => {
    if (!config) return

    // Store click handler in ref so function reference churn never triggers re-renders
    if (typeof config.onClick === 'function') {
      clickHandlerRef.current = config.onClick
    }

    setCenterActionState((prev) => {
      // Compare primitive visual/semantic attributes
      const isUnchanged =
        (config.id === undefined || config.id === prev.id) &&
        (config.label === undefined || config.label === prev.label) &&
        (config.ariaLabel === undefined || config.ariaLabel === prev.ariaLabel) &&
        (config.badge === undefined || config.badge === prev.badge) &&
        (config.isPulsing === undefined || config.isPulsing === prev.isPulsing) &&
        (config.gradient === undefined || config.gradient === prev.gradient) &&
        (config.shadow === undefined || config.shadow === prev.shadow)

      // Returning exact previous state object causes React to bail out of rendering
      if (isUnchanged) {
        return prev
      }

      return {
        ...prev,
        ...config,
      }
    })
  }, [])

  const resetCenterAction = useCallback(() => {
    clickHandlerRef.current = null
    setCenterActionState(DEFAULT_ACTION)
  }, [])

  // Stable click invoker
  const handleActionClick = useCallback((e) => {
    if (typeof clickHandlerRef.current === 'function') {
      clickHandlerRef.current(e)
    }
  }, [])

  const value = useMemo(
    () => ({
      centerAction: {
        ...centerAction,
        onClick: handleActionClick,
      },
      registerCenterAction,
      resetCenterAction,
    }),
    [centerAction, handleActionClick, registerCenterAction, resetCenterAction]
  )

  return (
    <CenterActionContext.Provider value={value}>
      {children}
    </CenterActionContext.Provider>
  )
}

export function useCenterAction(customConfig) {
  const context = useContext(CenterActionContext)
  const configRef = useRef(customConfig)
  configRef.current = customConfig

  // Serialize primitive identifiers to prevent inline object reference churn
  const configKey = customConfig
    ? `${customConfig.id ?? ''}|${customConfig.label ?? ''}|${customConfig.ariaLabel ?? ''}|${customConfig.isPulsing ?? ''}`
    : ''

  const registerFn = context?.registerCenterAction

  useEffect(() => {
    if (configRef.current && registerFn) {
      registerFn(configRef.current)
    }
    // Only re-run when the action's key primitive properties change, NEVER on object identity churn
  }, [configKey, registerFn])

  if (!context) {
    return {
      centerAction: DEFAULT_ACTION,
      registerCenterAction: () => {},
      resetCenterAction: () => {},
    }
  }

  return context
}
