const { verifyToken } = require('../utils/jwt.util')
const { User } = require('../models/User')

/**
 * Authentication Middleware
 *
 * Requirements:
 * - Reads Bearer token from Authorization header
 * - Verifies token validity and signature
 * - Attaches the authenticated user document to req.user
 * - Rejects invalid, expired, or missing tokens
 * - Rejects deactivated accounts
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization

    // 1. Check for presence of Authorization header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication token missing. Please provide a Bearer token in the Authorization header.',
      })
    }

    // 2. Extract token string
    const token = authHeader.split(' ')[1]
    if (!token || token.trim() === '') {
      return res.status(401).json({
        status: 'error',
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

    // 4. Ensure payload contains user id
    if (!decoded.id) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token payload: user id missing.',
      })
    }

    // 5. Query user from database (never selecting passwordHash)
    const user = await User.findById(decoded.id)
    if (!user) {
      return res.status(401).json({
        status: 'error',
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
 * Optional Role-based authorization middleware
 * @param  {...string} allowedRoles - List of permitted roles (e.g. 'SUPER_ADMIN', 'TEACHER')
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: User authentication required.',
      })
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: `Forbidden: Role [${req.user.role}] is not authorized to access this resource.`,
      })
    }

    next()
  }
}

module.exports = {
  authenticate,
  authorizeRoles,
}
