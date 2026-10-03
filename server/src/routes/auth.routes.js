const express = require('express')
const router = express.Router()
const { login, getMe, updateProfile, updatePassword } = require('../controllers/auth.controller')
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

/**
 * @route   PUT /api/auth/profile
 * @desc    Update basic user profile details (prevents role modification)
 * @access  Private
 */
router.put('/profile', authenticate, updateProfile)

/**
 * @route   PUT /api/auth/password
 * @desc    Change password with current password verification
 * @access  Private
 */
router.put('/password', authenticate, updatePassword)

module.exports = router
