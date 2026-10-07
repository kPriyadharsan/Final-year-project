const demoAuthService = require('../services/demoAuth.service')

/**
 * Extracts the client application base URL from headers or request payload
 * Ensures QR codes generated from Vercel or any live host always point to the live domain
 */
function extractClientBaseUrl(req) {
  // 1. Explicit body or query parameter
  if (req.body?.baseUrl && typeof req.body.baseUrl === 'string' && req.body.baseUrl.trim() !== '') {
    return req.body.baseUrl.trim().replace(/\/+$/, '')
  }
  if (req.query?.baseUrl && typeof req.query.baseUrl === 'string' && req.query.baseUrl.trim() !== '') {
    return req.query.baseUrl.trim().replace(/\/+$/, '')
  }

  // 2. Custom origin header
  const customOrigin = req.headers['x-client-origin'] || req.headers['x-forwarded-host']
  if (req.headers['x-client-origin'] && typeof req.headers['x-client-origin'] === 'string') {
    return req.headers['x-client-origin'].trim().replace(/\/+$/, '')
  }

  // 3. Request Origin (e.g. https://smart-classroom-2763.vercel.app)
  if (req.headers.origin && typeof req.headers.origin === 'string') {
    const origin = req.headers.origin.trim().replace(/\/+$/, '')
    if (origin && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      return origin
    }
  }

  // 4. Request Referer (e.g. https://smart-classroom-2763.vercel.app/admin)
  if (req.headers.referer && typeof req.headers.referer === 'string') {
    try {
      const u = new URL(req.headers.referer)
      if (u.origin && !u.origin.includes('localhost') && !u.origin.includes('127.0.0.1')) {
        return u.origin
      }
    } catch {
      // ignore
    }
  }

  // 5. If origin is localhost or not provided, return undefined to use default
  if (req.headers.origin && typeof req.headers.origin === 'string') {
    return req.headers.origin.trim().replace(/\/+$/, '')
  }

  return null
}

/**
 * @route   POST /api/auth/demo/generate
 * @desc    Generate a new temporary QR-based demo credential
 * @access  Private (SUPER_ADMIN only)
 */
async function generateDemoQr(req, res) {
  try {
    const baseUrl = extractClientBaseUrl(req)
    const data = await demoAuthService.generateDemoCredential(req.user, { baseUrl })
    return res.status(200).json({
      status: 'success',
      message: 'Demo QR credential generated successfully.',
      data,
    })
  } catch (err) {
    console.error('[DemoAuth Controller] generateDemoQr error:', err)
    return res.status(err.statusCode || 500).json({
      status: 'error',
      code: err.code || 'DEMO_GENERATE_FAILED',
      message: err.message || 'Failed to generate demo QR credential.',
    })
  }
}

/**
 * @route   POST /api/auth/demo/login
 * @desc    Validate temporary QR token and issue student session JWT
 * @access  Public
 */
async function loginDemo(req, res) {
  try {
    const { token } = req.body
    if (!token) {
      return res.status(400).json({
        status: 'error',
        code: 'TOKEN_REQUIRED',
        message: 'Demo login token is required in request body.',
      })
    }

    const data = await demoAuthService.loginWithDemoToken(token, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    })

    return res.status(200).json({
      status: 'success',
      message: 'Demo student authentication successful.',
      data,
    })
  } catch (err) {
    console.warn(`[DemoAuth Controller] loginDemo rejected: [${err.code || 'AUTH_FAILED'}] ${err.message}`)
    return res.status(err.statusCode || 401).json({
      status: 'error',
      code: err.code || 'DEMO_LOGIN_FAILED',
      message: err.message || 'Demo authentication failed.',
    })
  }
}

/**
 * @route   POST /api/auth/demo/reset
 * @desc    Global reset: increment generation, revoke all previous demo sessions & tokens, generate new QR
 * @access  Private (SUPER_ADMIN only)
 */
async function resetDemo(req, res) {
  try {
    const baseUrl = extractClientBaseUrl(req)
    const data = await demoAuthService.resetDemoSessions(req.user, { baseUrl })
    return res.status(200).json({
      status: 'success',
      message: 'Demo sessions reset successfully. All previous demo sessions and QR tokens are now invalidated.',
      data,
    })
  } catch (err) {
    console.error('[DemoAuth Controller] resetDemo error:', err)
    return res.status(err.statusCode || 500).json({
      status: 'error',
      code: err.code || 'DEMO_RESET_FAILED',
      message: err.message || 'Failed to reset demo presentation sessions.',
    })
  }
}

/**
 * @route   GET /api/auth/demo/status
 * @desc    Retrieve demo session status, active QR info, scan count, and expiry
 * @access  Private (SUPER_ADMIN only)
 */
async function getDemoStatus(req, res) {
  try {
    const baseUrl = extractClientBaseUrl(req)
    const data = await demoAuthService.getDemoStatus({ baseUrl })
    return res.status(200).json({
      status: 'success',
      data,
    })
  } catch (err) {
    console.error('[DemoAuth Controller] getDemoStatus error:', err)
    return res.status(err.statusCode || 500).json({
      status: 'error',
      code: err.code || 'DEMO_STATUS_FAILED',
      message: err.message || 'Failed to retrieve demo session status.',
    })
  }
}

module.exports = {
  generateDemoQr,
  loginDemo,
  resetDemo,
  getDemoStatus,
}
