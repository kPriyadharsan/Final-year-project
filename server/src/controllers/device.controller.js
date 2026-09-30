const mongoose = require('mongoose')
const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../models/Device')
const { DeviceLog, LOG_ACTIONS, MQTT_DELIVERY_STATUS } = require('../models/DeviceLog')
const { publish } = require('../services/mqtt.service')
const { emitDeviceStatus } = require('../services/socket.service')
const { processDeviceStatusMessage } = require('../services/deviceSync.service')

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
 * @route   POST /api/devices/:id/command
 * @access  Private (SUPER_ADMIN, TEACHER)
 */
async function sendDeviceCommand(req, res) {
  try {
    const { id } = req.params
    const { action } = req.body

    // 1. Validate action parameter
    if (!action || typeof action !== 'string' || action.trim() === '') {
      return res.status(400).json({
        status: 'error',
        code: 'ACTION_REQUIRED',
        message: 'Command action is required in request body (e.g. { "action": "ON" }).',
      })
    }

    const normalizedAction = action.trim().toUpperCase()
    if (!['ON', 'OFF'].includes(normalizedAction)) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_ACTION',
        message: 'Invalid action. Allowed actions are: "ON", "OFF".',
        received: action,
      })
    }

    // 2. Validate device existence by MongoDB _id or hardware deviceId
    let device = null
    if (mongoose.Types.ObjectId.isValid(id)) {
      device = await Device.findById(id)
    }

    if (!device) {
      device = await Device.findOne({
        deviceId: id.trim().toUpperCase(),
      })
    }

    if (!device) {
      return res.status(404).json({
        status: 'error',
        code: 'DEVICE_NOT_FOUND',
        message: `Device with identifier "${id}" was not found.`,
      })
    }

    // 3. Validate device is active
    if (!device.isActive) {
      return res.status(400).json({
        status: 'error',
        code: 'DEVICE_INACTIVE',
        message: `Device "${device.name}" (${device.deviceId}) is deactivated and cannot receive commands.`,
      })
    }

    const previousState = device.state
    const newState = normalizedAction

    // 4. Retrieve MQTT topic strictly from database configuration (never allow arbitrary frontend topics)
    const mqttTopic = device.mqttCommandTopic
    if (!mqttTopic || mqttTopic.trim() === '') {
      return res.status(500).json({
        status: 'error',
        code: 'INVALID_DEVICE_CONFIGURATION',
        message: `Device "${device.name}" lacks a configured MQTT command topic.`,
      })
    }

    // 5. Construct standardized MQTT payload
    const mqttPayload = {
      deviceId: device.deviceId,
      name: device.name,
      classroom: device.classroom,
      type: device.type,
      command: newState,
      state: newState === 'ON' ? 1 : 0,
      gpioPin: device.gpioPin,
      initiatedBy: {
        userId: req.user._id,
        name: req.user.name,
        role: req.user.role,
      },
      timestamp: new Date().toISOString(),
    }

    // 6. Attempt MQTT publication (resilient to offline broker)
    let mqttDeliveryStatus = MQTT_DELIVERY_STATUS.PUBLISHED
    let mqttDeliveryError = null

    try {
      await publish(mqttTopic, mqttPayload, { qos: 1 })
    } catch (mqttErr) {
      // Non-fatal if broker is offline or unreachable
      console.warn(`[MQTT] Notice: Publish queued or broker offline for [${mqttTopic}]: ${mqttErr.message}`)
      mqttDeliveryStatus = MQTT_DELIVERY_STATUS.OFFLINE_QUEUED
      mqttDeliveryError = mqttErr.message
    }

    // 7. Update device state in database
    device.state = newState
    await device.save()

    // Real-time broadcast to connected React dashboards
    emitDeviceStatus(device)

    // 8. Record the command in DeviceLog model
    const log = await DeviceLog.create({
      device: device._id,
      deviceId: device.deviceId,
      deviceName: device.name,
      classroom: device.classroom,
      action: newState,
      previousState,
      newState,
      topic: mqttTopic,
      payload: mqttPayload,
      mqttStatus: mqttDeliveryStatus,
      user: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      source: 'REST_API',
      errorMessage: mqttDeliveryError,
    })

    // 9. Return clear, standardized response
    return res.status(200).json({
      status: 'success',
      message: `Device "${device.name}" successfully commanded to ${newState}.`,
      data: {
        device: {
          id: device._id,
          deviceId: device.deviceId,
          name: device.name,
          classroom: device.classroom,
          type: device.type,
          state: device.state,
          previousState,
          isOnline: device.isOnline,
          gpioPin: device.gpioPin,
        },
        mqtt: {
          topic: mqttTopic,
          published: mqttDeliveryStatus === MQTT_DELIVERY_STATUS.PUBLISHED,
          status: mqttDeliveryStatus,
          payload: mqttPayload,
        },
        logId: log._id,
        timestamp: new Date().toISOString(),
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
