/**
 * Centralized API configuration for Smart Classroom Frontend
 * Uses VITE_API_BASE_URL in production (e.g. Render) with localhost fallback for local development.
 * Normalizes the URL by removing any trailing slashes to prevent double slashes in API paths.
 */
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
).replace(/\/+$/, '')

export default API_BASE_URL
