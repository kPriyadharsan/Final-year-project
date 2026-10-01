const mongoose = require('mongoose')
const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../models/Device')
const { DeviceLog, LOG_ACTIONS, MQTT_DELIVERY_STATUS } = require('../models/DeviceLog')
const { publish } = require('./mqtt.service')
const { emitDeviceStatus } = require('./socket.service')

/**
 * Executes a device control command with strict backend validation,
 * database updates, MQTT publication, Socket.IO broadcast, and audit logging.
 *
 * @param {Object} params
 * @param {string} [params.deviceId] - Specific device hardware ID or MongoDB ObjectId
 * @param {string} [params.deviceType] - Generic device type (light, fan, projector)
 * @param {string} [params.classroom] - Target classroom (defaults to "Room 302")
 * @param {'ON'|'OFF'} params.action - Action to perform
 * @param {Object} [params.user] - User object initiating the action
 * @param {string} [params.source] - Origin of command (e.g. 'REST_API', 'VOICE_COMMAND')
 * @returns {Promise<{ success: boolean, code?: string, message: string, device?: Object, mqtt?: Object, logId?: any }>}
 */
async function executeDeviceCommand({
  deviceId,
  deviceType,
  classroom = 'Room 302',
  action,
  user = null,
  source = 'VOICE_COMMAND',
}) {
  // 1. Validate action against strict allowlist
  const normalizedAction = action ? action.trim().toUpperCase() : null
  if (!normalizedAction || !Object.values(DEVICE_STATES).includes(normalizedAction)) {
    return {
      success: false,
      code: 'INVALID_ACTION',
      message: `Invalid action "${action}". Allowed actions are: "ON", "OFF".`,
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
      code: 'DEVICE_NOT_FOUND',
      message: `No active classroom device found matching "${deviceId || deviceType}" in ${classroom}.`,
    }
  }

  // 4. Validate device is active
  if (!device.isActive) {
    return {
      success: false,
      code: 'DEVICE_INACTIVE',
      message: `Device "${device.name}" (${device.deviceId}) is deactivated and cannot receive commands.`,
    }
  }

  const previousState = device.state
  const newState = normalizedAction

  // 5. Retrieve MQTT command topic strictly from database configuration
  const mqttTopic = device.mqttCommandTopic
  if (!mqttTopic || mqttTopic.trim() === '') {
    return {
      success: false,
      code: 'INVALID_DEVICE_CONFIGURATION',
      message: `Device "${device.name}" lacks a configured MQTT command topic.`,
    }
  }

  // 6. Build standardized MQTT payload
  const mqttPayload = {
    deviceId: device.deviceId,
    name: device.name,
    classroom: device.classroom,
    type: device.type,
    command: newState,
    state: newState === 'ON' ? 1 : 0,
    gpioPin: device.gpioPin,
    initiatedBy: {
      userId: user?._id || user?.id || null,
      name: user?.name || 'Voice Assistant',
      role: user?.role || 'SYSTEM',
    },
    timestamp: new Date().toISOString(),
  }

  // 7. Publish to MQTT (resilient to offline broker)
  let mqttDeliveryStatus = MQTT_DELIVERY_STATUS.PUBLISHED
  let mqttDeliveryError = null

  try {
    await publish(mqttTopic, mqttPayload, { qos: 1 })
  } catch (mqttErr) {
    console.warn(`[MQTT] Notice: Publish queued or broker offline for [${mqttTopic}]: ${mqttErr.message}`)
    mqttDeliveryStatus = MQTT_DELIVERY_STATUS.OFFLINE_QUEUED
    mqttDeliveryError = mqttErr.message
  }

  // 8. Update device state in MongoDB
  device.state = newState
  await device.save()

  // 9. Real-time broadcast via Socket.IO
  emitDeviceStatus(device)

  // 10. Record in DeviceLog
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
    user: user?._id || user?.id || null,
    userName: user?.name || 'Voice Assistant',
    userRole: user?.role || 'SYSTEM',
    source,
    errorMessage: mqttDeliveryError,
  })

  console.log(`[DeviceCommandService] ✅ Successfully commanded "${device.name}" (${device.deviceId}) to ${newState} via ${source}`)

  return {
    success: true,
    message: `Successfully turned ${newState} ${device.name}.`,
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
      status: mqttDeliveryStatus,
      published: mqttDeliveryStatus === MQTT_DELIVERY_STATUS.PUBLISHED,
    },
    logId: log._id,
  }
}

module.exports = {
  executeDeviceCommand,
}
