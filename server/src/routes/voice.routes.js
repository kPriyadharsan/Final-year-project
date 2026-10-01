const express = require('express')
const router = express.Router()
const { handleVoiceCommand, getVoiceHistory } = require('../controllers/voice.controller')
const { optionalAuth, requireAuth, requireRole, ROLES } = require('../middleware/auth.middleware')

/**
 * @route   POST /api/voice/command
 * @desc    Process natural language voice command, validate intent, execute hardware control or return software intent
 * @access  Public / Authenticated (user attached if token provided)
 */
router.post('/command', optionalAuth, handleVoiceCommand)

/**
 * @route   GET /api/voice/history
 * @desc    Get historical log of voice commands
 * @access  Private (SUPER_ADMIN, TEACHER)
 */
router.get('/history', requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.TEACHER), getVoiceHistory)

module.exports = router
