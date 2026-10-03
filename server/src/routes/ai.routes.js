const express = require('express')
const router = express.Router()
const { testGeminiPrompt, parseCommand, getAIStatus } = require('../controllers/ai.controller')
const { optionalAuth } = require('../middleware/auth.middleware')

/**
 * @route   POST /api/ai/test
 * @desc    Generate text completion via Google Gemini SDK
 * @access  Public / Testing
 */
router.post('/test', optionalAuth, testGeminiPrompt)

/**
 * @route   POST /api/ai/parse-command
 * @desc    Parse natural language classroom command into validated structured JSON
 * @access  Public / Testing
 */
router.post('/parse-command', optionalAuth, parseCommand)
router.post('/command', optionalAuth, parseCommand) // Convenient alias

/**
 * @route   GET /api/ai/status
 * @desc    Check Gemini AI service status, configured model, and allowlists
 * @access  Public
 */
router.get('/status', getAIStatus)

module.exports = router
