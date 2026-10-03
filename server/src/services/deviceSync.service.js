const { Device, DEVICE_STATES } = require('../models/Device')
const { onMessage } = require('./mqtt.service')
const { emitDeviceStatus } = require('./socket.service')
const { parseMqttTopic, TOPIC_PATTERNS, classroomSlugToRegex } = require('../utils/mqttTopics')

/**
 * Normalizes input state from various IoT representations (1/0, true/false, 'ON'/'OFF')
 *
 * @param {any} rawState
 * @returns {'ON'|'OFF'}
 */
function normalizeState(rawState) {
  if (rawState === 1 || rawState === '1' || rawState === true || rawState === 'true') {
    return DEVICE_STATES.ON
  }
  if (typeof rawState === 'string' && rawState.trim().toUpperCase() === 'ON') {
    return DEVICE_STATES.ON
  }
  return DEVICE_STATES.OFF
}

/**
 * Processes incoming device status payload, updates MongoDB, and emits Socket.IO event
 *
 * @param {string} topic - MQTT incoming topic
 * @param {Object|string} payload - Parsed or raw payload
 * @returns {Promise<Object|null>} The updated device document or null
 */
async function processDeviceStatusMessage(topic, payload) {
  try {
    let data = payload
    if (typeof payload === 'string') {
      try {
        data = JSON.parse(payload)
      } catch {
        // Plain string state: e.g. "ON" or "OFF"
        data = { state: payload }
      }
    }

    if (!data || typeof data !== 'object') {
      data = {}
    }

    const parsedTopic = parseMqttTopic(topic)

    // 1. Identify target device
    let device = null

    // Strategy 1: Match by deviceId from payload
    if (data.deviceId && typeof data.deviceId === 'string') {
      device = await Device.findOne({
        deviceId: data.deviceId.trim().toUpperCase(),
      })
    }

    // Strategy 2: Match by exact configured mqttStatusTopic in MongoDB
    if (!device && topic) {
      device = await Device.findOne({ mqttStatusTopic: topic })
    }

    // Strategy 3: Match by parsed classroom slug and appliance type from standard topic
    if (!device && parsedTopic.isSmartClassroom && parsedTopic.deviceType) {
      const typeUpper = parsedTopic.deviceType.toUpperCase()
      const roomSlug = parsedTopic.classroom // e.g. 'room302'
      const roomRegex = classroomSlugToRegex(roomSlug)

      device = await Device.findOne({
        type: typeUpper,
        isActive: true,
        ...(roomRegex ? { classroom: { $regex: roomRegex } } : {}),
      })

      // Fallback: any active device of this type
      if (!device) {
        device = await Device.findOne({ type: typeUpper, isActive: true })
      }
    }

    // Strategy 4: Legacy path (classroom/device/<id>/status)
    if (!device && topic) {
      const parts = topic.split('/')
      if (parts.length >= 3 && parts[0] === 'classroom' && parts[1] === 'device') {
        const candidate = parts[2].trim().toUpperCase()
        device = await Device.findOne({ deviceId: candidate })
        if (!device && ['LIGHT', 'FAN', 'PROJECTOR'].includes(candidate)) {
          device = await Device.findOne({ type: candidate, isActive: true })
        }
      }
    }

    if (!device) {
      console.warn(`[DeviceSync] No device found matching identifier "${data.deviceId || topic}"`)
      return null
    }

    // 2. Determine state, confirmed physical telemetry, and online flag
    const rawState = data.state !== undefined ? data.state : data.command
    if (rawState !== undefined) {
      const confirmed = normalizeState(rawState)
      device.state = confirmed
      device.confirmedState = confirmed
      device.lastConfirmedAt = new Date()
    }

    if (typeof data.isOnline === 'boolean') {
      device.isOnline = data.isOnline
    } else {
      // Message arrival indicates device is online
      device.isOnline = true
    }

    // 3. Save to database
    await device.save()
    console.log(`[DeviceSync] 💾 Database updated: [${device.deviceId}] -> Confirmed State: ${device.confirmedState || device.state}, Online: ${device.isOnline}`)

    // 4. Emit real-time Socket.IO event to all connected dashboards
    emitDeviceStatus(device)

    return device
  } catch (err) {
    console.error(`[DeviceSync] Error processing status message on [${topic}]:`, err)
    return null
  }
}

/**
 * Initializes listeners on MQTT status and availability topics
 */
function initDeviceSync() {
  console.log('[DeviceSync] 🔄 Registering real-time device status MQTT consumers...')

  // 1. Standardized state topics: smartclassroom/+/relay/+/state
  onMessage(TOPIC_PATTERNS.ALL_STATES, (topic, payload) => {
    console.log(`[DeviceSync] 📩 Received MQTT relay state on [${topic}]`)
    processDeviceStatusMessage(topic, payload)
  })

  // 2. Legacy status topics: classroom/device/+/status
  onMessage(TOPIC_PATTERNS.LEGACY_DEVICE_STATUS, (topic, payload) => {
    console.log(`[DeviceSync] 📩 Received legacy MQTT status message on [${topic}]`)
    processDeviceStatusMessage(topic, payload)
  })

  // 3. Availability handler (LWT / board online events)
  const handleAvailability = async (topic, payload) => {
    try {
      let statusText = ''
      if (typeof payload === 'string') {
        try {
          const parsed = JSON.parse(payload)
          statusText = parsed.status || parsed.state || ''
        } catch {
          statusText = payload.trim().toLowerCase()
        }
      } else if (payload && typeof payload === 'object') {
        statusText = (payload.status || payload.state || '').toLowerCase()
      }

      const isOnline = statusText === 'online' || statusText === '1' || statusText === 'true'
      console.log(`[DeviceSync] 📡 Board availability event on [${topic}]: "${statusText}" (isOnline=${isOnline})`)

      // Extract optional classroom filter from parsed topic or payload
      let targetClassroom = null
      if (payload && typeof payload === 'object' && payload.classroom) {
        targetClassroom = payload.classroom
      } else if (topic) {
        const parsed = parseMqttTopic(topic)
        if (parsed.isSmartClassroom && parsed.classroom) {
          targetClassroom = parsed.classroom
        }
      }

      const query = { isActive: true }
      if (targetClassroom) {
        const roomRegex = classroomSlugToRegex(targetClassroom)
        if (roomRegex) {
          query.classroom = { $regex: roomRegex }
        }
      }

      const devices = await Device.find(query)
      for (const dev of devices) {
        dev.isOnline = isOnline
        await dev.save()
        emitDeviceStatus(dev)
      }
      console.log(`[DeviceSync] 🔄 Updated ${devices.length} device(s) ${targetClassroom ? `in ${targetClassroom} ` : ''}to isOnline=${isOnline} and dispatched real-time Socket.IO events.`)
    } catch (err) {
      console.error(`[DeviceSync] Error handling availability event on [${topic}]:`, err)
    }
  }

  // Subscribe to availability topics
  onMessage(TOPIC_PATTERNS.ALL_AVAILABILITY, handleAvailability)
  onMessage(TOPIC_PATTERNS.LEGACY_AVAILABILITY, handleAvailability)
  onMessage(TOPIC_PATTERNS.LEGACY_ESP32_STATUS, handleAvailability)
}

module.exports = {
  initDeviceSync,
  processDeviceStatusMessage,
  normalizeState,
}
