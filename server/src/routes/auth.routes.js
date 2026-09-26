const express = require('express')
const router = express.Router()
const { login, getMe } = require('../controllers/auth.controller')
const { authenticate } = require('../middleware/auth.middleware')

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user credentials and receive JWT
 * @access  Public
 */
router.post('/login', login)

/**
 * @route   GET /api/auth/me
 * @desc    Retrieve profile of currently authenticated user
 * @access  Private (Requires Bearer token)
 */
router.get('/me', authenticate, getMe)

module.exports = router
