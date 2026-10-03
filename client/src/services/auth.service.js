import { API_BASE_URL } from '../config/api'
const TOKEN_STORAGE_KEY = 'smart_classroom_token'

/**
 * Token Storage Helpers (Development Persistence)
 */
export const tokenStorage = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY)
    } catch {
      return null
    }
  },
  set: (token) => {
    try {
      if (token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, token)
      }
    } catch (err) {
      console.error('Failed to save auth token to localStorage:', err)
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
    } catch (err) {
      console.error('Failed to clear auth token from localStorage:', err)
    }
  },
}

/**
 * Sends login credentials to the backend API
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ token: string, user: Object }>}
 */
export async function loginUser(email, password) {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  const data = await response.json()

  if (!response.ok) {
    const error = new Error(data.message || 'Authentication failed. Please check your credentials.')
    error.status = response.status
    error.code = data.code
    throw error
  }

  return data
}

/**
 * Fetches the currently authenticated user's profile to restore session
 * @param {string} token
 * @returns {Promise<Object>}
 */
export async function fetchCurrentUser(token) {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  })

  const data = await response.json()

  if (!response.ok) {
    const error = new Error(data.message || 'Session verification failed.')
    error.status = response.status
    error.code = data.code
    throw error
  }

  return data.user
}

/**
 * Helper to test protected role-based test endpoints
 * @param {string} path e.g. '/api/admin/test' or '/api/teacher/test'
 * @param {string} token
 */
export async function testProtectedRoute(path, token) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  })

  const data = await response.json()
  return {
    status: response.status,
    ok: response.ok,
    data,
  }
}
