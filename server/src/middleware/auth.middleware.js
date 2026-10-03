const mongoose = require('mongoose')
const { verifyToken } = require('../utils/jwt.util')
const { User, ROLES } = require('../models/User')

/**
 * Authentication Middleware: requireAuth
 *
 * Requirements:
 * - Reads Bearer token from Authorization header
 * - Verifies token validity, issuer, and signature
 * - Attaches the authenticated user document to req.user
 * - Rejects invalid, expired, or missing tokens with 401
 * - Rejects deactivated accounts with 403
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization

    // 1. Check for presence of Authorization header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        code: 'TOKEN_MISSING',
        message: 'Authentication token missing. Please provide a Bearer token in the Authorization header.',
      })
    }

    // 2. Extract token string
    const token = authHeader.split(' ')[1]
    if (!token || token.trim() === '') {
      return res.status(401).json({
        status: 'error',
        code: 'TOKEN_MALFORMED',
        message: 'Malformed Authorization header. Format: Bearer <token>',
      })
    }

    // 3. Verify JWT signature & expiration
    let decoded
    try {
      decoded = verifyToken(token)
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          status: 'error',
          code: 'TOKEN_EXPIRED',
          message: 'Authentication token has expired. Please log in again.',
        })
      }
      return res.status(401).json({
        status: 'error',
        code: 'TOKEN_INVALID',
        message: 'Invalid authentication token.',
      })
    }

    // 4. Ensure payload contains valid MongoDB user id
    if (!decoded.id || !mongoose.Types.ObjectId.isValid(decoded.id)) {
      return res.status(401).json({
        status: 'error',
        code: 'TOKEN_PAYLOAD_INVALID',
        message: 'Invalid token payload: valid user id missing.',
      })
    }

    // 5. Query user from database (never selecting passwordHash)
    const user = await User.findById(decoded.id)
    if (!user) {
      return res.status(401).json({
        status: 'error',
        code: 'USER_NOT_FOUND',
        message: 'The user belonging to this token no longer exists.',
      })
    }

    // 6. Verify account is active
    if (!user.isActive) {
      return res.status(403).json({
        status: 'error',
        code: 'ACCOUNT_DEACTIVATED',
        message: 'User account is deactivated. Please contact an administrator.',
      })
    }

    // 7. Attach authenticated user to request
    req.user = user
    next()
  } catch (err) {
    console.error('Auth Middleware Internal Error:', err)
    return res.status(500).json({
      status: 'error',
      message: 'Internal authentication error.',
    })
  }
}

/**
 * Role-Based Authorization Middleware Factory: requireRole
 *
 * Requirements:
 * - Checks if the authenticated user has one of the allowed roles
 * - NEVER trusts client-supplied roles (e.g. from req.body, req.headers, or query parameters)
 * - Exclusively evaluates req.user.role verified from the authenticated JWT session
 * - Returns 401 if unauthenticated, 403 if unauthorized role
 *
 * @param {...string} allowedRoles - Permitted roles (e.g. ROLES.SUPER_ADMIN, ROLES.TEACHER)
 * @returns {Function} Express middleware function
 */
function requireRole(...allowedRoles) {
  // Flatten array in case an array was passed as a single argument: requireRole([ROLE1, ROLE2])
  const roles = allowedRoles.flat()

  return (req, res, next) => {
    // 1. Ensure user is authenticated
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        code: 'UNAUTHORIZED',
        message: 'Unauthorized: Authentication required before checking role authorization.',
      })
    }

    // 2. Derive role strictly from authenticated database user (never trust frontend input)
    const authenticatedRole = req.user.role

    // 3. Verify user's role against permitted roles
    if (!roles.includes(authenticatedRole)) {
      return res.status(403).json({
        status: 'error',
        code: 'FORBIDDEN',
        message: `Forbidden: Access restricted to authorized roles [${roles.join(', ')}]. Your authenticated role is [${authenticatedRole}].`,
        requiredRoles: roles,
        userRole: authenticatedRole,
      })
    }

    // 4. Role verified successfully
    next()
  }
}

/**
 * Optional Authentication Middleware: optionalAuth
 * Attaches user to req.user if valid token provided; does not reject if absent
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null
      return next()
    }

    const token = authHeader.split(' ')[1]
    if (!token || token.trim() === '') {
      req.user = null
      return next()
    }

    try {
      const decoded = verifyToken(token)
      if (decoded && decoded.id && mongoose.Types.ObjectId.isValid(decoded.id)) {
        const user = await User.findById(decoded.id)
        if (user && user.isActive) {
          req.user = user
        }
      }
    } catch {
      req.user = null
    }
    next()
  } catch {
    req.user = null
    next()
  }
}

module.exports = {
  requireAuth,
  requireRole,
  optionalAuth,
  // Aliases for backwards compatibility
  authenticate: requireAuth,
  authorizeRoles: requireRole,
  ROLES,
}
