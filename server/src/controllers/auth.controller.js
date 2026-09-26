const { User } = require('../models/User')
const { generateToken } = require('../utils/jwt.util')

/**
 * @desc    Authenticate user & return JWT token + safe profile
 * @route   POST /api/auth/login
 * @access  Public
 */
async function login(req, res) {
  try {
    const { email, password } = req.body

    // 1. Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide both email and password.',
      })
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Email and password must be valid strings.',
      })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // 2. Query user by email (explicitly selecting passwordHash which is hidden by default)
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash')

    // Generic error message prevents username/email enumeration
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password.',
      })
    }

    // 3. Verify user account is active
    if (!user.isActive) {
      return res.status(403).json({
        status: 'error',
        code: 'ACCOUNT_DEACTIVATED',
        message: 'This account has been deactivated. Please contact an administrator.',
      })
    }

    // 4. Compare bcrypt password
    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password.',
      })
    }

    // 5. Generate JWT with user id and role in payload
    const token = generateToken({
      id: user._id.toString(),
      role: user.role,
    })

    // 6. Return safe user data (passwordHash is completely excluded via user.toJSON())
    const safeUser = user.toJSON()

    return res.status(200).json({
      status: 'success',
      message: 'Authentication successful.',
      token,
      user: safeUser,
    })
  } catch (err) {
    console.error('Login Controller Error:', err)
    return res.status(500).json({
      status: 'error',
      message: 'An unexpected server error occurred during login.',
    })
  }
}

/**
 * @desc    Get currently authenticated user's profile
 * @route   GET /api/auth/me
 * @access  Private (Requires valid JWT Bearer token)
 */
async function getMe(req, res) {
  try {
    // req.user is guaranteed to be attached by the authenticate middleware
    const safeUser = req.user.toJSON()

    return res.status(200).json({
      status: 'success',
      user: safeUser,
    })
  } catch (err) {
    console.error('getMe Controller Error:', err)
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve user profile.',
    })
  }
}

module.exports = {
  login,
  getMe,
}
