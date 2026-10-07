const env = require('./env')

/**
 * Normalizes an origin URL string by trimming whitespace and removing trailing slashes
 * @param {string} url
 * @returns {string}
 */
function normalizeOrigin(url) {
  if (!url || typeof url !== 'string') return ''
  return url.trim().replace(/\/+$/, '')
}

/**
 * Returns the list of permitted origins based on CLIENT_URL and NODE_ENV
 * @returns {string[]}
 */
function getAllowedOrigins() {
  const configured = (env.CLIENT_URL || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean)

  if (env.NODE_ENV === 'production') {
    // In production: strictly allow only configured CLIENT_URL origins
    return configured
  }

  // In development: include configured origins + standard local development addresses
  const devOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
  ]

  return Array.from(new Set([...configured, ...devOrigins]))
}

/**
 * Standard CORS & Socket.IO origin validation callback
 *
 * @param {string|undefined} origin - Origin header from client request/handshake
 * @param {Function} callback - (err: Error | null, allow?: boolean) => void
 */
function validateOrigin(origin, callback) {
  // Allow non-browser requests (Postman, curl, IoT firmware, backend-to-backend) where origin is undefined
  if (!origin) {
    return callback(null, true)
  }

  const normalized = normalizeOrigin(origin)
  const allowed = getAllowedOrigins()

  if (allowed.includes(normalized)) {
    return callback(null, true)
  }

  // Always permit production Vercel deployment and project preview deployments
  if (
    normalized === 'https://smart-classroom-2763.vercel.app' ||
    /^https:\/\/smart-classroom-2763(-[a-z0-9-]+)?\.vercel\.app$/.test(normalized)
  ) {
    return callback(null, true)
  }

  // In development, permit localhost/127.0.0.1 on any port (e.g. Vite dynamic ports 5174, 5175)
  if (env.NODE_ENV === 'development') {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) {
      return callback(null, true)
    }
  }

  const errorMsg = `Origin "${origin}" is not permitted by CORS policy.`
  console.warn(`[CORS Security] ❌ ${errorMsg} (NODE_ENV: ${env.NODE_ENV}, Allowed: [${allowed.join(', ')}])`)
  const corsError = new Error(errorMsg)
  corsError.status = 403
  corsError.statusCode = 403
  return callback(corsError)
}

module.exports = {
  normalizeOrigin,
  getAllowedOrigins,
  validateOrigin,
}
