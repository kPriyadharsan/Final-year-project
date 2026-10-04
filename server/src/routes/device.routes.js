const express = require('express')
const router = express.Router()
const { requireAuth, requireRole } = require('../middleware/auth.middleware')
const { ROLES } = require('../models/User')
const {
  getDevices,
  getDeviceById,
  sendDeviceCommand,
  sendDeviceColor,
  simulateDeviceStatus,
} = require('../controllers/device.controller')

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

/**
 * @route   POST /api/devices/:id/command
 * @desc    Send control command (ON/OFF) to a device, publish MQTT topic, and record DeviceLog
 * @access  Private (SUPER_ADMIN, TEACHER)
 */
router.post('/:id/command', sendDeviceCommand)

/**
 * @route   POST /api/devices/:id/color
 * @desc    Send Projector RGB color and lighting power command, publish MQTT topic, and record DeviceLog
 * @access  Private (SUPER_ADMIN, TEACHER)
 */
router.post('/:id/color', sendDeviceColor)

/**
 * @route   POST /api/devices/:id/simulate-status
 * @desc    Simulate incoming MQTT status message to update DB and emit real-time Socket.IO event
 * @access  Private (SUPER_ADMIN, TEACHER)
 */
router.post('/:id/simulate-status', simulateDeviceStatus)

module.exports = router
