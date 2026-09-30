const express = require('express')
const router = express.Router()
const { requireAuth, requireRole } = require('../middleware/auth.middleware')
const { ROLES } = require('../models/User')
const { getDevices, getDeviceById } = require('../controllers/device.controller')

// Restrict all device endpoints to authenticated SUPER_ADMIN and TEACHER users
router.use(requireAuth)
router.use(requireRole(ROLES.SUPER_ADMIN, ROLES.TEACHER))

/**
 * @route   GET /api/devices
 * @desc    Get list of devices with optional filtering by classroom, type, state, isOnline
 * @access  Private (SUPER_ADMIN, TEACHER)
 */
router.get('/', getDevices)

/**
 * @route   GET /api/devices/:id
 * @desc    Get single device by MongoDB _id or hardware deviceId
 * @access  Private (SUPER_ADMIN, TEACHER)
 */
router.get('/:id', getDeviceById)

module.exports = router
