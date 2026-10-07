const express = require('express')
const router = express.Router()
const { requireAuth, requireRole } = require('../middleware/auth.middleware')
const { ROLES } = require('../models/User')
const {
  generateDemoQr,
  loginDemo,
  resetDemo,
  getDemoStatus,
} = require('../controllers/demoAuth.controller')

/**
 * @route   POST /api/auth/demo/generate
 * @desc    Generate a temporary QR-based demo login token & URL
 * @access  Private (SUPER_ADMIN only)
 */
router.post('/generate', requireAuth, requireRole(ROLES.SUPER_ADMIN), generateDemoQr)

/**
 * @route   POST /api/auth/demo/login
 * @desc    Exchange temporary QR token for a student role session JWT
 * @access  Public
 */
router.post('/login', loginDemo)

/**
 * @route   POST /api/auth/demo/reset
 * @desc    Global reset: bump generation, revoke all demo sessions, issue fresh QR
 * @access  Private (SUPER_ADMIN only)
 */
router.post('/reset', requireAuth, requireRole(ROLES.SUPER_ADMIN), resetDemo)

/**
 * @route   GET /api/auth/demo/status
 * @desc    Inspect active demo session status, current generation, remaining time
 * @access  Private (SUPER_ADMIN only)
 */
router.get('/status', requireAuth, requireRole(ROLES.SUPER_ADMIN), getDemoStatus)

module.exports = router
