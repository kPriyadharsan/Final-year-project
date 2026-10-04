const mongoose = require('mongoose')
const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../models/Device')
const { DeviceLog, MQTT_DELIVERY_STATUS } = require('../models/DeviceLog')
const { publish, getMQTTStatus } = require('./mqtt.service')
const { emitDeviceStatus, emitDeviceColor } = require('./socket.service')
const { getCommandTopic, getProjectorColorCommandTopic, buildCommandPayload } = require('../utils/mqttTopics')
const { resolveRgbColor } = require('../constants/deviceCapabilities')

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
  power,
  color,
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

  // 1. Validate action against strict allowlist (support 'COLOR' action for RGB lighting)
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

  // Delegate 'COLOR' action to executeDeviceColorCommand
  if (normalizedAction === 'COLOR' || normalizedAction === 'SET_COLOR') {
    return executeDeviceColorCommand({
      deviceId,
      deviceType,
      classroom,
      power,
      color,
      user,
      source,
    })
  }

  if (!Object.values(DEVICE_STATES).includes(normalizedAction)) {
    return {
      success: false,
      delivered: false,
      code: 'INVALID_ACTION',
      executionStatus: 'FAILED',
      message: `Invalid action. Allowed actions are: "ON", "OFF", "COLOR".`,
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

  // 4b. Controller Node Guard: A physical controller node cannot be directly toggled via relay command
  if (device.entityType === 'NODE' || device.deviceCategory === 'NODE' || device.type === DEVICE_TYPES.OTHER) {
    return {
      success: false,
      delivered: false,
      code: 'CANNOT_COMMAND_NODE',
      executionStatus: 'FAILED',
      message: `Device "${device.name}" (${device.deviceId}) is a physical controller node, not a controllable channel. Please command a relay channel (LIGHT, FAN, PROJECTOR).`,
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
  // Channel availability is based strictly on the controller/node being connected
  let isNodeOnline = true
  if (device.nodeId) {
    const parentNode = await Device.findOne({ deviceId: device.nodeId }).lean()
    if (parentNode) {
      isNodeOnline = parentNode.isOnline === true
    }
  } else if (device.classroom) {
    const roomNode = await Device.findOne({
      classroom: device.classroom,
      $or: [{ entityType: 'NODE' }, { deviceCategory: 'NODE' }, { type: DEVICE_TYPES.OTHER }],
    }).lean()
    if (roomNode) {
      isNodeOnline = roomNode.isOnline === true
    }
  }

  const mqttStatus = getMQTTStatus()
  const isMqttConnected = Boolean(mqttStatus && mqttStatus.connected)
  const isDeviceOnline = isNodeOnline && device.isOnline !== false

  if (!isMqttConnected || !isDeviceOnline) {
    const failureCode = !isMqttConnected ? 'MQTT_DISCONNECTED' : 'DEVICE_OFFLINE'
    const failureReason = !isMqttConnected
      ? 'MQTT broker is offline'
      : `ESP32 controller node for device "${device.name}" (${device.deviceId}) is offline`

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
  device.confirmedState = newState
  device.lastCommandedAt = new Date()

  // Projector Master Relay state synchronization with RGB:
  // - Projector ON: Master relay ON, RGB automatically defaults to WHITE (255, 255, 255)
  // - Projector OFF: Master relay OFF, RGB turns OFF (0, 0, 0)
  if (device.type === DEVICE_TYPES.PROJECTOR) {
    if (newState === DEVICE_STATES.ON) {
      device.colorPower = 'ON'
      if (!device.color || (device.color.r === 0 && device.color.g === 0 && device.color.b === 0)) {
        device.color = { r: 59, g: 130, b: 246 }
      }
    } else {
      device.colorPower = 'OFF'
      // Preserve device.color instead of zeroing out hue
    }
  }

  await device.save()

  // 10. Real-time broadcast via Socket.IO to connected dashboards
  emitDeviceStatus(device)
  if (device.type === DEVICE_TYPES.PROJECTOR) {
    emitDeviceColor(device)
  }

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

/**
 * Executes a Projector RGB lighting control command.
 *
 * MQTT topic:
 *   smartclassroom/<roomSlug>/projector/color/command
 * Payload format:
 *   {
 *     "power": "ON",
 *     "color": {
 *       "r": 255,
 *       "g": 0,
 *       "b": 255
 *     }
 *   }
 *
 * Requirements:
 * - Directs through: React -> Node API -> MQTT -> EMQX -> ESP32 -> GPIO25/27/32 -> RGB LED
 * - Updates MongoDB device model (color, colorPower)
 * - Broadcasts via Socket.IO (emitDeviceStatus and emitDeviceColor)
 * - Records audit log in DeviceLog
 * - Guard: Available only when ESP32 controller node is online
 */
async function executeDeviceColorCommand({
  deviceId,
  deviceType = 'PROJECTOR',
  classroom = process.env.DEFAULT_CLASSROOM || 'Room 302',
  power,
  color,
  user = null,
  source = 'REST_API',
}) {
  // 0. Verify Database Connectivity
  if (mongoose.connection.readyState !== 1) {
    return {
      success: false,
      delivered: false,
      code: 'DATABASE_UNAVAILABLE',
      executionStatus: 'FAILED',
      message: 'Database service is currently unavailable. Command cannot be delivered.',
      timestamp: new Date().toISOString(),
    }
  }

  // 1. Role Authorization Guard: Students cannot operate classroom hardware
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

  // 2. Identify target Projector Device
  let device = null
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

  if (!device) {
    device = await Device.findOne({
      type: DEVICE_TYPES.PROJECTOR,
      isActive: true,
      ...(classroom ? { classroom: { $regex: new RegExp(`^${classroom.trim()}$`, 'i') } } : {}),
    })
    if (!device) {
      device = await Device.findOne({
        type: DEVICE_TYPES.PROJECTOR,
        isActive: true,
      })
    }
  }

  if (!device) {
    return {
      success: false,
      delivered: false,
      code: 'DEVICE_NOT_FOUND',
      executionStatus: 'FAILED',
      message: 'Projector device not found for RGB lighting command.',
      timestamp: new Date().toISOString(),
    }
  }

  if (!device.isActive) {
    return {
      success: false,
      delivered: false,
      code: 'DEVICE_INACTIVE',
      executionStatus: 'FAILED',
      message: `Projector "${device.name}" (${device.deviceId}) is deactivated.`,
      timestamp: new Date().toISOString(),
    }
  }

  // 3. Normalize power & color (clamp 0-255, resolve strings / names)
  let resolvedColorObj = null
  if (color) {
    if (typeof color === 'string' || (typeof color === 'object' && color.name)) {
      resolvedColorObj = resolveRgbColor(color)
    } else if (typeof color === 'object') {
      resolvedColorObj = resolveRgbColor(color) || color
    }
  }

  const effectiveColor = resolvedColorObj || color
  if (effectiveColor && typeof effectiveColor !== 'object') {
    return {
      success: false,
      delivered: false,
      code: 'INVALID_COLOR_PAYLOAD',
      executionStatus: 'FAILED',
      message: 'Malformed color payload. Expected valid color name (e.g. "purple") or numeric r, g, b fields (0-255).',
      timestamp: new Date().toISOString(),
    }
  }

  // 3b. If Projector Master Relay Power is OFF, automatically turn it ON first for seamless UX
  if (device.state === 'OFF' && (!power || String(power).trim().toUpperCase() !== 'OFF')) {
    try {
      const projRelayTopic = getCommandTopic(device.classroom, 'PROJECTOR')
      await publish(projRelayTopic, { command: 'ON' }, { qos: 1 })
      device.state = 'ON'
      device.lastConfirmedAt = new Date()
      await device.save()
      emitDeviceStatus(device)
      console.log(`[DeviceCommandService] 📽️ Auto-switched Projector master power ON for RGB adjustment on [${projRelayTopic}]`)
    } catch (relayErr) {
      console.warn(`[DeviceCommandService] Auto-turn ON warning: ${relayErr.message}`)
    }
  }

  let targetPower = power ? String(power).trim().toUpperCase() : (device.colorPower || 'ON')
  if (targetPower !== 'ON' && targetPower !== 'OFF') {
    targetPower = 'ON'
  }

  const prevColor = device.color || { r: 255, g: 255, b: 255 }
  const r = effectiveColor && typeof effectiveColor.r !== 'undefined' ? Math.max(0, Math.min(255, Math.round(Number(effectiveColor.r) || 0))) : prevColor.r
  const g = effectiveColor && typeof effectiveColor.g !== 'undefined' ? Math.max(0, Math.min(255, Math.round(Number(effectiveColor.g) || 0))) : prevColor.g
  const b = effectiveColor && typeof effectiveColor.b !== 'undefined' ? Math.max(0, Math.min(255, Math.round(Number(effectiveColor.b) || 0))) : prevColor.b
  const targetColor = { r, g, b }
  const colorName = (resolvedColorObj && resolvedColorObj.name) || (effectiveColor && effectiveColor.name) || (targetPower === 'OFF' ? 'off' : 'custom')

  // 4. Verify Controller Node Online Status (Strict Hardware Guard)
  let isNodeOnline = true
  if (device.nodeId) {
    const parentNode = await Device.findOne({ deviceId: device.nodeId }).lean()
    if (parentNode) {
      isNodeOnline = parentNode.isOnline === true
    }
  } else if (device.classroom) {
    const roomNode = await Device.findOne({
      classroom: device.classroom,
      $or: [{ entityType: 'NODE' }, { deviceCategory: 'NODE' }, { type: DEVICE_TYPES.OTHER }],
    }).lean()
    if (roomNode) {
      isNodeOnline = roomNode.isOnline === true
    }
  }

  const mqttStatus = getMQTTStatus()
  const isMqttConnected = Boolean(mqttStatus && mqttStatus.connected)
  const isDeviceOnline = isNodeOnline && device.isOnline !== false

  if (!isMqttConnected || !isDeviceOnline) {
    const failureCode = !isMqttConnected ? 'MQTT_DISCONNECTED' : 'DEVICE_OFFLINE'
    const failureReason = !isMqttConnected
      ? 'MQTT broker is offline'
      : `ESP32 controller node for device "${device.name}" (${device.deviceId}) is offline`

    console.warn(`[DeviceCommandService] ⚠️ Projector RGB command failed: ${failureReason}`)

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
        color: device.color || { r: 59, g: 130, b: 246 },
        colorPower: device.colorPower || 'OFF',
        isOnline: device.isOnline,
      },
      timestamp: new Date().toISOString(),
    }
  }

  // 5. MQTT Topic & Payload
  // Exact topic: smartclassroom/room302/projector/color/command
  const mqttTopic = getProjectorColorCommandTopic(device.classroom)
  const mqttPayload = {
    power: targetPower,
    color: targetColor,
  }

  // 6. Publish via MQTT with QoS 1
  try {
    await publish(mqttTopic, mqttPayload, { qos: 1 })
    console.log(`[DeviceCommandService] 🎨 Published Projector RGB payload to [${mqttTopic}]:`, mqttPayload)
  } catch (publishErr) {
    console.error(`[DeviceCommandService] Failed to publish RGB command to [${mqttTopic}]: ${publishErr.message}`)
    return {
      success: false,
      delivered: false,
      code: 'DELIVERY_FAILED',
      executionStatus: 'FAILED',
      message: 'Command could not be delivered.',
      error: publishErr.message,
      timestamp: new Date().toISOString(),
    }
  }

  // 7. Update MongoDB
  device.colorPower = targetPower
  device.color = targetColor
  device.lastCommandedAt = new Date()
  await device.save()

  // 8. Real-time broadcast via Socket.IO
  emitDeviceStatus(device)
  emitDeviceColor(device)

  // 9. Record DeviceLog
  let logId = null
  try {
    const log = await DeviceLog.create({
      device: device._id,
      deviceId: device.deviceId,
      deviceName: device.name,
      classroom: device.classroom,
      action: 'COLOR',
      previousState: device.state,
      newState: device.state,
      topic: mqttTopic,
      payload: mqttPayload,
      mqttStatus: MQTT_DELIVERY_STATUS.PUBLISHED,
      user: user?._id || user?.id || null,
      userName: user?.name || 'Teacher',
      userRole: user?.role || 'TEACHER',
      source,
      errorMessage: null,
    })
    logId = log._id
  } catch (logErr) {
    console.warn(`[DeviceCommandService] Notice: Could not record DeviceLog: ${logErr.message}`)
  }

  return {
    success: true,
    delivered: true,
    executionStatus: 'EXECUTED',
    message: targetPower === 'OFF' ? 'Projector light is off.' : `Projector light is ${colorName}.`,
    device: {
      id: device._id,
      deviceId: device.deviceId,
      name: device.name,
      classroom: device.classroom,
      type: device.type,
      state: device.state,
      color: device.color,
      colorPower: device.colorPower,
      isOnline: device.isOnline,
      lastCommandedAt: device.lastCommandedAt,
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
  executeDeviceColorCommand,
  getDeviceLabel,
}
