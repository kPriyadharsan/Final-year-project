const mongoose = require('mongoose')
const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../models/Device')
const { DeviceLog, MQTT_DELIVERY_STATUS } = require('../models/DeviceLog')
const { publish, getMQTTStatus } = require('./mqtt.service')
const { emitDeviceStatus } = require('./socket.service')
const { getCommandTopic, buildCommandPayload } = require('../utils/mqttTopics')

/**
 * Returns a human-friendly device label for execution messages.
 * Matches user requirements: "Fan ON command sent.", "Light OFF command sent.", etc.
 *
 * @param {Object} device
 * @returns {string}
 */
function getDeviceLabel(device) {
  if (device.type === DEVICE_TYPES.FAN) return 'Fan'
  if (device.type === DEVICE_TYPES.LIGHT) return 'Light'
  if (device.type === DEVICE_TYPES.PROJECTOR) return 'Projector'
  return device.name || 'Device'
}

/**
 * Executes a device control command with strict backend validation,
 * MQTT delivery verification, database state updates, Socket.IO broadcast, and audit logging.
 *
 * IMPORTANT REQUIREMENTS:
 * - Real execution message: "Fan ON command sent." (or "${deviceLabel} ${newState} command sent.")
 * - Do not fake successful hardware status. If ESP32/MQTT is offline, returns "Command could not be delivered."
 * - Shared backend device-command service for both dashboard buttons and voice assistant.
 *
 * @param {Object} params
 * @param {string} [params.deviceId] - Specific device hardware ID or MongoDB ObjectId
 * @param {string} [params.deviceType] - Generic device type (light, fan, projector)
 * @param {string} [params.classroom] - Target classroom (defaults to "Room 302")
 * @param {'ON'|'OFF'} params.action - Action to perform
 * @param {Object} [params.user] - User object initiating the action
 * @param {string} [params.source] - Origin of command ('REST_API' | 'VOICE_COMMAND')
 * @returns {Promise<{ success: boolean, delivered: boolean, code?: string, executionStatus: string, message: string, device?: Object, mqtt?: Object, logId?: any, timestamp: string }>}
 */
async function executeDeviceCommand({
  deviceId,
  deviceType,
  classroom = process.env.DEFAULT_CLASSROOM || 'Room 302',
  action,
  user = null,
  source = 'VOICE_COMMAND',
}) {
  // 0. Verify Database Connectivity (Handle MongoDB unavailable without crashing or hanging)
  if (mongoose.connection.readyState !== 1) {
    console.warn('[DeviceCommandService] ⚠️ Database is unavailable (readyState:', mongoose.connection.readyState, ')')
    return {
      success: false,
      delivered: false,
      code: 'DATABASE_UNAVAILABLE',
      executionStatus: 'FAILED',
      message: 'Database service is currently unavailable. Command cannot be delivered.',
      timestamp: new Date().toISOString(),
    }
  }

  // 1. Validate action against strict allowlist
  if (!action || typeof action !== 'string' || action.trim() === '') {
    return {
      success: false,
      delivered: false,
      code: 'ACTION_REQUIRED',
      executionStatus: 'FAILED',
      message: 'Command action is required in request body (e.g. { "action": "ON" }).',
      timestamp: new Date().toISOString(),
    }
  }

  const normalizedAction = action.trim().toUpperCase()
  if (!Object.values(DEVICE_STATES).includes(normalizedAction)) {
    return {
      success: false,
      delivered: false,
      code: 'INVALID_ACTION',
      executionStatus: 'FAILED',
      message: `Invalid action. Allowed actions are: "ON", "OFF".`,
      timestamp: new Date().toISOString(),
    }
  }

  // 1b. Prevent unauthorized device control: Students are not permitted to operate classroom relays
  if (user && user.role === 'STUDENT') {
    return {
      success: false,
      delivered: false,
      code: 'UNAUTHORIZED_ROLE',
      executionStatus: 'FAILED',
      message: 'Students are not authorized to control classroom hardware.',
      timestamp: new Date().toISOString(),
    }
  }

  let device = null

  // 2a. Find by specific deviceId or ObjectId if provided
  if (deviceId) {
    if (mongoose.Types.ObjectId.isValid(deviceId)) {
      device = await Device.findById(deviceId)
    }
    if (!device) {
      device = await Device.findOne({
        deviceId: deviceId.trim().toUpperCase(),
      })
    }
  }

  // 2b. If no specific deviceId, search by generic type in target classroom
  if (!device && deviceType) {
    const targetType = deviceType.trim().toUpperCase()
    if (Object.values(DEVICE_TYPES).includes(targetType)) {
      // Find active device matching type in target classroom
      device = await Device.findOne({
        type: targetType,
        isActive: true,
        ...(classroom ? { classroom: { $regex: new RegExp(`^${classroom.trim()}$`, 'i') } } : {}),
      })

      // Fallback: any active device of this type
      if (!device) {
        device = await Device.findOne({
          type: targetType,
          isActive: true,
        })
      }
    }
  }

  // 3. Validate device existence
  if (!device) {
    return {
      success: false,
      delivered: false,
      code: 'DEVICE_NOT_FOUND',
      executionStatus: 'FAILED',
      message: `Device with identifier "${deviceId || deviceType}" was not found.`,
      timestamp: new Date().toISOString(),
    }
  }

  // 4. Validate device is active
  if (!device.isActive) {
    return {
      success: false,
      delivered: false,
      code: 'DEVICE_INACTIVE',
      executionStatus: 'FAILED',
      message: `Device "${device.name}" (${device.deviceId}) is deactivated and cannot receive commands.`,
      timestamp: new Date().toISOString(),
    }
  }

  const previousState = device.state
  const newState = normalizedAction

  // 5. Retrieve MQTT command topic strictly from database configuration (with standard fallback)
  const mqttTopic = device.mqttCommandTopic || getCommandTopic(device.classroom, device.type)
  if (!mqttTopic || mqttTopic.trim() === '') {
    return {
      success: false,
      delivered: false,
      code: 'INVALID_DEVICE_CONFIGURATION',
      executionStatus: 'FAILED',
      message: `Device "${device.name}" lacks a configured MQTT command topic.`,
      timestamp: new Date().toISOString(),
    }
  }

  // 6. Connectivity & Hardware Online verification (Do NOT fake successful hardware status!)
  const mqttStatus = getMQTTStatus()
  const isMqttConnected = Boolean(mqttStatus && mqttStatus.connected)
  const isDeviceOnline = device.isOnline !== false

  if (!isMqttConnected || !isDeviceOnline) {
    const failureCode = !isMqttConnected ? 'MQTT_DISCONNECTED' : 'DEVICE_OFFLINE'
    const failureReason = !isMqttConnected
      ? 'MQTT broker is offline'
      : `ESP32 hardware for device "${device.name}" (${device.deviceId}) is offline`

    console.warn(`[DeviceCommandService] ⚠️ Delivery failed: ${failureReason}`)

    // Record failure in DeviceLog without updating device state in database
    let logRecord = null
    try {
      logRecord = await DeviceLog.create({
        device: device._id,
        deviceId: device.deviceId,
        deviceName: device.name,
        classroom: device.classroom,
        action: newState,
        previousState: device.state,
        newState: device.state, // State remains unchanged
        topic: mqttTopic,
        payload: null,
        mqttStatus: MQTT_DELIVERY_STATUS.FAILED,
        user: user?._id || user?.id || null,
        userName: user?.name || (source === 'VOICE_COMMAND' ? 'Voice Assistant' : 'Teacher'),
        userRole: user?.role || 'TEACHER',
        source,
        errorMessage: failureReason,
      })
    } catch (logErr) {
      console.warn(`[DeviceCommandService] Notice: Could not record DeviceLog: ${logErr.message}`)
    }

    return {
      success: false,
      delivered: false,
      code: failureCode,
      executionStatus: 'FAILED',
      message: 'Command could not be delivered.',
      error: failureReason,
      device: {
        id: device._id,
        deviceId: device.deviceId,
        name: device.name,
        classroom: device.classroom,
        type: device.type,
        state: device.state,
        requestedState: newState,
        confirmedState: device.confirmedState || null,
        previousState: device.state,
        isOnline: device.isOnline,
        gpioPin: device.gpioPin,
        lastCommandedAt: device.lastCommandedAt || null,
        lastConfirmedAt: device.lastConfirmedAt || null,
      },
      mqtt: {
        topic: mqttTopic,
        status: MQTT_DELIVERY_STATUS.FAILED,
        published: false,
        error: failureReason,
      },
      logId: logRecord?._id || null,
      timestamp: new Date().toISOString(),
    }
  }

  // 7. Build standardized MQTT command payload
  const mqttPayload = buildCommandPayload({
    deviceId: device.deviceId,
    name: device.name,
    classroom: device.classroom,
    type: device.type,
    command: newState,
    gpioPin: device.gpioPin,
    initiatedBy: {
      userId: user?._id || user?.id || null,
      name: user?.name || (source === 'VOICE_COMMAND' ? 'Voice Assistant' : 'Teacher'),
      role: user?.role || 'TEACHER',
    },
    timestamp: new Date().toISOString(),
  })

  // 8. Publish to MQTT command topic (QoS 1)
  try {
    await publish(mqttTopic, mqttPayload, { qos: 1 })
  } catch (publishErr) {
    console.error(`[DeviceCommandService] Failed to publish MQTT command: ${publishErr.message}`)

    let logRecord = null
    try {
      logRecord = await DeviceLog.create({
        device: device._id,
        deviceId: device.deviceId,
        deviceName: device.name,
        classroom: device.classroom,
        action: newState,
        previousState: device.state,
        newState: device.state,
        topic: mqttTopic,
        payload: mqttPayload,
        mqttStatus: MQTT_DELIVERY_STATUS.FAILED,
        user: user?._id || user?.id || null,
        userName: user?.name || (source === 'VOICE_COMMAND' ? 'Voice Assistant' : 'Teacher'),
        userRole: user?.role || 'TEACHER',
        source,
        errorMessage: publishErr.message,
      })
    } catch {
      // Non-fatal logging error
    }

    return {
      success: false,
      delivered: false,
      code: 'DELIVERY_FAILED',
      executionStatus: 'FAILED',
      message: 'Command could not be delivered.',
      device: {
        id: device._id,
        deviceId: device.deviceId,
        name: device.name,
        classroom: device.classroom,
        type: device.type,
        state: device.state,
        previousState: device.state,
        isOnline: device.isOnline,
        gpioPin: device.gpioPin,
      },
      mqtt: {
        topic: mqttTopic,
        status: MQTT_DELIVERY_STATUS.FAILED,
        published: false,
        error: publishErr.message,
      },
      logId: logRecord?._id || null,
      timestamp: new Date().toISOString(),
    }
  }

  // 9. Update device commanded state in MongoDB
  device.state = newState
  device.requestedState = newState
  device.lastCommandedAt = new Date()
  await device.save()

  // 10. Real-time broadcast via Socket.IO to connected dashboards
  emitDeviceStatus(device)

  // 11. Record in DeviceLog
  let logId = null
  try {
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
      mqttStatus: MQTT_DELIVERY_STATUS.PUBLISHED,
      user: user?._id || user?.id || null,
      userName: user?.name || (source === 'VOICE_COMMAND' ? 'Voice Assistant' : 'Teacher'),
      userRole: user?.role || 'TEACHER',
      source,
      errorMessage: null,
    })
    logId = log._id
  } catch (logErr) {
    console.warn(`[DeviceCommandService] Notice: Could not record DeviceLog: ${logErr.message}`)
  }

  // Format execution message: "Fan ON command sent.", "Light OFF command sent.", etc.
  const deviceLabel = getDeviceLabel(device)
  const executionMessage = `${deviceLabel} ${newState} command sent.`

  console.log(`[DeviceCommandService] ✅ Successfully commanded "${device.name}" (${device.deviceId}) to ${newState} via ${source} -> "${executionMessage}"`)

  return {
    success: true,
    delivered: true,
    executionStatus: 'EXECUTED',
    message: executionMessage,
    device: {
      id: device._id,
      deviceId: device.deviceId,
      name: device.name,
      classroom: device.classroom,
      type: device.type,
      state: device.state,
      requestedState: device.requestedState,
      confirmedState: device.confirmedState || null,
      previousState,
      isOnline: device.isOnline,
      gpioPin: device.gpioPin,
      lastCommandedAt: device.lastCommandedAt,
      lastConfirmedAt: device.lastConfirmedAt || null,
    },
    mqtt: {
      topic: mqttTopic,
      status: MQTT_DELIVERY_STATUS.PUBLISHED,
      published: true,
      payload: mqttPayload,
    },
    logId,
    timestamp: new Date().toISOString(),
  }
}

module.exports = {
  executeDeviceCommand,
  getDeviceLabel,
}
