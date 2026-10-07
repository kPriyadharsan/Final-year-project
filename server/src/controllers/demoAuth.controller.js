const demoAuthService = require('../services/demoAuth.service')

/**
 * @route   POST /api/auth/demo/generate
 * @desc    Generate a new temporary QR-based demo credential
 * @access  Private (SUPER_ADMIN only)
 */
async function generateDemoQr(req, res) {
  try {
    const data = await demoAuthService.generateDemoCredential(req.user)
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
    const data = await demoAuthService.resetDemoSessions(req.user)
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
    const data = await demoAuthService.getDemoStatus()
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
