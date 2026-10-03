const mongoose = require('mongoose')
const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../models/Device')
const { processDeviceStatusMessage } = require('../services/deviceSync.service')
const deviceCommandService = require('../services/deviceCommand.service')

/**
 * @desc    Get all devices (with optional filters)
 * @route   GET /api/devices
 * @access  Private (SUPER_ADMIN, TEACHER)
 */
async function getDevices(req, res) {
  try {
    const { classroom, type, state, isOnline, isActive } = req.query

    const filter = {}

    // Filter by classroom (case-insensitive substring or exact match)
    if (classroom && typeof classroom === 'string' && classroom.trim() !== '') {
      filter.classroom = { $regex: new RegExp(`^${classroom.trim()}$`, 'i') }
    }

    // Filter by device type
    if (type && typeof type === 'string' && type.trim() !== '') {
      const upperType = type.trim().toUpperCase()
      if (Object.values(DEVICE_TYPES).includes(upperType)) {
        filter.type = upperType
      }
    }

    // Filter by operating state
    if (state && typeof state === 'string' && state.trim() !== '') {
      const upperState = state.trim().toUpperCase()
      if (Object.values(DEVICE_STATES).includes(upperState)) {
        filter.state = upperState
      }
    }

    // Filter by isOnline status
    if (typeof isOnline !== 'undefined') {
      if (isOnline === 'true' || isOnline === true) filter.isOnline = true
      if (isOnline === 'false' || isOnline === false) filter.isOnline = false
    }

    // Filter by isActive status (defaults to true if not specified)
    if (typeof isActive !== 'undefined') {
      if (isActive === 'true' || isActive === true) filter.isActive = true
      if (isActive === 'false' || isActive === false) filter.isActive = false
    } else {
      filter.isActive = true
    }

    const devices = await Device.find(filter)
      .sort({ classroom: 1, type: 1, name: 1 })
      .lean()

    res.status(200).json({
      status: 'success',
      count: devices.length,
      devices,
    })
  } catch (err) {
    console.error('Error fetching devices:', err)
    res.status(500).json({
      status: 'error',
      code: 'SERVER_ERROR',
      message: 'Failed to retrieve devices from database.',
    })
  }
}

/**
 * @desc    Get single device by MongoDB _id or deviceId
 * @route   GET /api/devices/:id
 * @access  Private (SUPER_ADMIN, TEACHER)
 */
async function getDeviceById(req, res) {
  try {
    const { id } = req.params

    if (!id || typeof id !== 'string' || id.trim() === '') {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_ID',
        message: 'Device identifier parameter is required.',
      })
    }

    let device = null

    // 1. Try finding by MongoDB ObjectId if format matches
    if (mongoose.Types.ObjectId.isValid(id)) {
      device = await Device.findById(id).lean()
    }

    // 2. Fallback: Search by unique hardware deviceId
    if (!device) {
      device = await Device.findOne({
        deviceId: id.trim().toUpperCase(),
      }).lean()
    }

    if (!device) {
      return res.status(404).json({
        status: 'error',
        code: 'DEVICE_NOT_FOUND',
        message: `Device with identifier "${id}" was not found.`,
      })
    }

    res.status(200).json({
      status: 'success',
      device,
    })
  } catch (err) {
    console.error('Error fetching device by id:', err)
    res.status(500).json({
      status: 'error',
      code: 'SERVER_ERROR',
      message: 'Failed to retrieve device details.',
    })
  }
}

/**
 * @desc    Dispatch control command (ON / OFF) to a device
 *          Uses the shared backend device-command service (same as voice assistant)
 * @route   POST /api/devices/:id/command
 * @access  Private (SUPER_ADMIN, TEACHER)
 */
async function sendDeviceCommand(req, res) {
  try {
    const { id } = req.params
    const { action } = req.body

    // Execute through shared device command service
    const cmdResult = await deviceCommandService.executeDeviceCommand({
      deviceId: id,
      action,
      user: req.user,
      source: 'REST_API',
    })

    if (!cmdResult.success) {
      const statusCode =
        cmdResult.code === 'DEVICE_NOT_FOUND' ? 404 :
        cmdResult.code === 'DEVICE_INACTIVE' ? 400 :
        cmdResult.code === 'INVALID_ACTION' ? 400 :
        cmdResult.code === 'ACTION_REQUIRED' ? 400 :
        cmdResult.code === 'MQTT_DISCONNECTED' ? 503 :
        cmdResult.code === 'DEVICE_OFFLINE' ? 503 :
        cmdResult.code === 'DELIVERY_FAILED' ? 503 : 400

      return res.status(statusCode).json({
        status: 'error',
        code: cmdResult.code || 'COMMAND_FAILED',
        message: cmdResult.message || 'Command could not be delivered.',
        data: cmdResult,
      })
    }

    return res.status(200).json({
      status: 'success',
      message: cmdResult.message,
      data: {
        device: cmdResult.device,
        mqtt: cmdResult.mqtt,
        logId: cmdResult.logId,
        timestamp: cmdResult.timestamp,
      },
    })
  } catch (err) {
    console.error('Error executing device command:', err)
    return res.status(500).json({
      status: 'error',
      code: 'SERVER_ERROR',
      message: 'Failed to process device command.',
    })
  }
}

/**
 * @desc    Simulate incoming MQTT device status message for testing/dev
 * @route   POST /api/devices/:id/simulate-status
 * @access  Private (SUPER_ADMIN, TEACHER)
 */
async function simulateDeviceStatus(req, res) {
  try {
    const { id } = req.params
    const { state, isOnline } = req.body

    let device = null
    if (mongoose.Types.ObjectId.isValid(id)) {
      device = await Device.findById(id)
    }
    if (!device) {
      device = await Device.findOne({ deviceId: id.trim().toUpperCase() })
    }

    if (!device) {
      return res.status(404).json({
        status: 'error',
        code: 'DEVICE_NOT_FOUND',
        message: `Device with identifier "${id}" was not found.`,
      })
    }

    const payload = {
      deviceId: device.deviceId,
      state: state || device.state,
      isOnline: typeof isOnline === 'boolean' ? isOnline : true,
      timestamp: new Date().toISOString(),
    }

    const updated = await processDeviceStatusMessage(device.mqttStatusTopic, payload)

    res.status(200).json({
      status: 'success',
      message: `Simulated status message processed for "${device.name}".`,
      device: updated,
    })
  } catch (err) {
    console.error('Error simulating device status:', err)
    res.status(500).json({
      status: 'error',
      message: 'Failed to simulate device status.',
    })
  }
}

module.exports = {
  getDevices,
  getDeviceById,
  sendDeviceCommand,
  simulateDeviceStatus,
}
