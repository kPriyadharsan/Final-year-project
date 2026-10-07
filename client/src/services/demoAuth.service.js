import { API_BASE_URL } from '../config/api'

/**
 * Helper to construct authorized request headers
 */
function getAuthHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
  }
}

/**
 * Retrieves the currently active demo QR session status and generation
 * @param {string} token - Super Admin JWT
 * @returns {Promise<Object>}
 */
export async function fetchDemoStatus(token) {
  const response = await fetch(`${API_BASE_URL}/api/auth/demo/status`, {
    method: 'GET',
    headers: getAuthHeaders(token),
  })

  const data = await response.json()
  if (!response.ok) {
    const error = new Error(data.message || 'Failed to fetch demo session status.')
    error.status = response.status
    error.code = data.code
    throw error
  }

  return data.data
}

/**
 * Generates a brand-new temporary QR credential for the current demo version
 * @param {string} token - Super Admin JWT
 * @returns {Promise<Object>}
 */
export async function generateDemoQr(token) {
  const response = await fetch(`${API_BASE_URL}/api/auth/demo/generate`, {
    method: 'POST',
    headers: getAuthHeaders(token),
  })

  const data = await response.json()
  if (!response.ok) {
    const error = new Error(data.message || 'Failed to generate demo QR code.')
    error.status = response.status
    error.code = data.code
    throw error
  }

  return data.data
}

/**
 * Performs a global reset:
 * Bumps generation, revokes all previous demo sessions & tokens, issues fresh QR
 * @param {string} token - Super Admin JWT
 * @returns {Promise<Object>}
 */
export async function resetDemoSessions(token) {
  const response = await fetch(`${API_BASE_URL}/api/auth/demo/reset`, {
    method: 'POST',
    headers: getAuthHeaders(token),
  })

  const data = await response.json()
  if (!response.ok) {
    const error = new Error(data.message || 'Failed to reset demo presentation sessions.')
    error.status = response.status
    error.code = data.code
    throw error
  }

  return data.data
}

/**
 * Consumes a temporary scanned QR token and exchanges it for a student session JWT
 * @param {string} demoToken - Raw token string from scanned URL
 * @returns {Promise<Object>}
 */
export async function loginWithDemoToken(demoToken) {
  const response = await fetch(`${API_BASE_URL}/api/auth/demo/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ token: demoToken }),
  })

  const data = await response.json()
  if (!response.ok) {
    const error = new Error(data.message || 'Demo authentication failed.')
    error.status = response.status
    error.code = data.code
    throw error
  }

  return data.data
}
