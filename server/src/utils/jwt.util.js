const jwt = require('jsonwebtoken')

const DEFAULT_EXPIRES_IN = '24h'

/**
 * Generates a signed JSON Web Token (JWT).
 *
 * @param {Object} payload - Data to embed in the token (e.g. { id, role }).
 * @param {string} [expiresIn=DEFAULT_EXPIRES_IN] - Token validity duration.
 * @returns {string} The signed JWT string.
 */
function generateToken(payload, expiresIn = DEFAULT_EXPIRES_IN) {
  const secret = process.env.JWT_SECRET

  if (!secret) {
    throw new Error('JWT_SECRET is missing from environment variables.')
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be a non-null object.')
  }

  return jwt.sign(payload, secret, {
    expiresIn,
    issuer: 'SmartClassroom-API',
  })
}

/**
 * Verifies a JSON Web Token and extracts the decoded payload.
 *
 * @param {string} token - The raw JWT token string to verify.
 * @returns {Object} Decoded token payload.
 * @throws {Error} If token is expired, malformed, or signature is invalid.
 */
function verifyToken(token) {
  const secret = process.env.JWT_SECRET

  if (!secret) {
    throw new Error('JWT_SECRET is missing from environment variables.')
  }

  if (!token || typeof token !== 'string') {
    throw new Error('Token must be a non-empty string.')
  }

  return jwt.verify(token, secret, {
    issuer: 'SmartClassroom-API',
  })
}

module.exports = {
  generateToken,
  verifyToken,
  DEFAULT_EXPIRES_IN,
}
