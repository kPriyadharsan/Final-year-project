const express = require('express')
const router = express.Router()
const { testGeminiPrompt, getAIStatus } = require('../controllers/ai.controller')

/**
 * @route   POST /api/ai/test
 * @desc    Generate text completion via Google Gemini SDK
 * @access  Public / Testing
 */
router.post('/test', testGeminiPrompt)

/**
 * @route   GET /api/ai/status
 * @desc    Check Gemini AI service status, configured model, and key readiness
 * @access  Public
 */
router.get('/status', getAIStatus)

module.exports = router
