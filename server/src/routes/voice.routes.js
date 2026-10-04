const express = require('express')
const router = express.Router()
const { handleVoiceCommand, getVoiceHistory } = require('../controllers/voice.controller')
const {
  createGeminiLiveToken,
  getLiveAssistantConfig,
  handleLiveDeviceCommand,
  handleLiveRgbCommand,
  handleLiveGetState,
} = require('../controllers/geminiLive.controller')
const { optionalAuth, requireAuth, requireRole, ROLES } = require('../middleware/auth.middleware')

/**
 * @route   POST /api/voice/command
 * @desc    Process natural language voice command, validate intent, execute hardware control or return software intent
 * @access  Public / Authenticated (user attached if token provided)
 */
router.post('/command', optionalAuth, handleVoiceCommand)

/**
 * @route   POST /api/voice/live/token
 * @desc    Generate a short-lived ephemeral token for Gemini Live API WebSocket sessions
 * @access  Protected / Authenticated (matches existing voice command auth middleware)
 */
router.post('/live/token', optionalAuth, createGeminiLiveToken)

/**
 * @route   GET /api/voice/live/config
 * @desc    Get centralized assistant prompt, tool definitions, capabilities, and device states
 * @access  Public / Authenticated
 */
router.get('/live/config', optionalAuth, getLiveAssistantConfig)

/**
 * @route   GET /api/voice/live/state
 * @route   POST /api/voice/live/state
 * @desc    Get authoritative real-time classroom device state for Gemini Live get_classroom_device_state tool
 * @access  Public / Authenticated
 */
router.get('/live/state', optionalAuth, handleLiveGetState)
router.post('/live/state', optionalAuth, handleLiveGetState)

/**
 * @route   POST /api/voice/live/command
 * @desc    Execute batch classroom device commands requested by Gemini Live tool calls
 * @access  Protected / Authenticated (matches existing voice command auth middleware)
 */
router.post('/live/command', optionalAuth, handleLiveDeviceCommand)

/**
 * @route   POST /api/voice/live/rgb
 * @desc    Execute dedicated RGB LED control requested by Gemini Live set_classroom_rgb tool
 * @access  Protected / Authenticated (matches existing voice command auth middleware)
 */
router.post('/live/rgb', optionalAuth, handleLiveRgbCommand)


/**
 * @route   GET /api/voice/history
 * @desc    Get historical log of voice commands
 * @access  Private (SUPER_ADMIN, TEACHER)
 */
router.get('/history', requireAuth, requireRole(ROLES.SUPER_ADMIN, ROLES.TEACHER), getVoiceHistory)

module.exports = router

