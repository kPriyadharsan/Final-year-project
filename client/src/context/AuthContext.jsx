import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { tokenStorage, loginUser, fetchCurrentUser } from '../services/auth.service'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState(null)

  // Clear any existing error messages
  const clearError = useCallback(() => {
    setAuthError(null)
  }, [])

  // Logout action: resets state and removes token from storage
  const logout = useCallback(() => {
    tokenStorage.clear()
    setToken(null)
    setUser(null)
    setAuthError(null)
  }, [])

  // Restore authenticated session on page load/refresh via GET /api/auth/me
  useEffect(() => {
    let isMounted = true

    async function restoreSession() {
      const storedToken = tokenStorage.get()

      if (!storedToken) {
        if (isMounted) setIsLoading(false)
        return
      }

      try {
        const currentUser = await fetchCurrentUser(storedToken)
        if (isMounted) {
          setToken(storedToken)
          setUser(currentUser)
          setAuthError(null)
        }
      } catch (err) {
        console.warn('Session restoration failed:', err.message)
        // Token was invalid, expired, or user deleted -> clear from storage
        tokenStorage.clear()
        if (isMounted) {
          setToken(null)
          setUser(null)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    restoreSession()

    return () => {
      isMounted = false
    }
  }, [])

  // Login action: calls POST /api/auth/login, stores token, and updates state
  const login = async (email, password) => {
    setIsLoading(true)
    setAuthError(null)

    try {
      const response = await loginUser(email, password)
      const receivedToken = response.token
      const receivedUser = response.user

      tokenStorage.set(receivedToken)
      setToken(receivedToken)
      setUser(receivedUser)
      return { success: true, user: receivedUser }
    } catch (err) {
      const message = err.message || 'Login failed. Please check your credentials.'
      setAuthError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const value = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isLoading,
    authError,
    login,
    logout,
    clearError,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Custom hook to consume the AuthContext safely
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
