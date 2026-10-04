const { Device, DEVICE_STATES } = require('../models/Device')
const { onMessage } = require('./mqtt.service')
const { emitDeviceStatus, emitDeviceColor } = require('./socket.service')
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
      if (data.isOnline) {
        device.lastSeenAt = new Date()
      }
    } else {
      // Message arrival indicates device is online
      device.isOnline = true
      device.lastSeenAt = new Date()
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
 * Availability handler (Processes ESP32 Online / Offline / LWT / Heartbeat events)
 *
 * Topic: smartclassroom/+/availability (e.g. smartclassroom/room302/availability)
 * Expected payload:
 *   { "deviceId": "ESP32-RM302-01", "status": "online" }
 *   { "deviceId": "ESP32-RM302-01", "status": "offline" }
 *
 * @param {string} topic
 * @param {Object|string} payload
 * @param {string} [rawPayload]
 * @returns {Promise<Object|null>}
 */
async function handleAvailability(topic, payload, rawPayload) {
  try {
    let data = payload

    // If payload is a string or Buffer, parse JSON safely
    if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
      const str = payload.toString().trim()
      try {
        data = JSON.parse(str)
      } catch (parseErr) {
        console.error(`[DeviceSync] ❌ Invalid JSON payload received on availability topic [${topic}]: "${str}". Error: ${parseErr.message}`)
        return null
      }
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      console.error(`[DeviceSync] ❌ Expected JSON object payload on availability topic [${topic}], received:`, data)
      return null
    }

    // Extract status / state
    const rawStatus = (data.status || data.state || '').toString().trim().toLowerCase()
    const isOnline = rawStatus === 'online' || rawStatus === '1' || rawStatus === 'true'
    const isOffline = rawStatus === 'offline' || rawStatus === '0' || rawStatus === 'false'

    if (!isOnline && !isOffline) {
      console.warn(`[DeviceSync] ⚠️ Unrecognized availability status "${data.status || data.state}" on topic [${topic}]`)
      return null
    }

    // Handle primary case: payload includes deviceId (e.g. { deviceId: "ESP32-RM302-01", status: "online" })
    if (data.deviceId && typeof data.deviceId === 'string' && data.deviceId.trim() !== '') {
      const targetDeviceId = data.deviceId.trim()
      let device = await Device.findOne({ deviceId: targetDeviceId.toUpperCase() })
      if (!device) {
        // Case-insensitive regex fallback
        device = await Device.findOne({
          deviceId: { $regex: new RegExp(`^${targetDeviceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        })
      }

      if (!device) {
        console.warn(`[DeviceSync] ⚠️ Device with deviceId "${data.deviceId}" does not exist in MongoDB. Availability update skipped.`)
        return null
      }

      if (isOnline) {
        device.isOnline = true
        device.lastSeenAt = new Date()
        console.log(`[DeviceSync] 🟢 Device [${device.deviceId}] status: ONLINE (Heartbeat/lastSeenAt: ${device.lastSeenAt.toISOString()})`)
      } else {
        device.isOnline = false
        // Keep lastSeenAt value as the last known heartbeat/online time (do NOT overwrite with current time or null)
        console.log(`[DeviceSync] 🔴 Device [${device.deviceId}] status: OFFLINE (Preserved lastSeenAt: ${device.lastSeenAt ? device.lastSeenAt.toISOString() : 'never'})`)
      }

      await device.save()
      emitDeviceStatus(device)

      // If this is a controller node, cascade availability to all associated relay channels
      if (device.entityType === 'NODE' || device.deviceCategory === 'NODE' || device.type === 'OTHER') {
        const childChannels = await Device.find({
          isActive: true,
          $or: [{ nodeId: device.deviceId }, { classroom: device.classroom, type: { $ne: 'OTHER' } }],
        })
        for (const ch of childChannels) {
          ch.isOnline = isOnline
          if (isOnline) ch.lastSeenAt = new Date()
          await ch.save()
          emitDeviceStatus(ch)
        }
      }

      return device
    }

    // Backward-compatibility fallback: legacy payload without deviceId (e.g. { classroom: "Room 302", status: "offline" })
    let targetClassroom = null
    if (data.classroom && typeof data.classroom === 'string') {
      targetClassroom = data.classroom
    } else if (topic) {
      const parsed = parseMqttTopic(topic)
      if (parsed.isSmartClassroom && parsed.classroom) {
        targetClassroom = parsed.classroom
      }
    }

    if (targetClassroom) {
      const roomRegex = classroomSlugToRegex(targetClassroom)
      const query = {
        isActive: true,
        ...(roomRegex ? { classroom: { $regex: roomRegex } } : {}),
      }
      const devices = await Device.find(query)
      for (const dev of devices) {
        dev.isOnline = isOnline
        if (isOnline) {
          dev.lastSeenAt = new Date()
        }
        await dev.save()
        emitDeviceStatus(dev)
      }
      console.log(`[DeviceSync] 🔄 Updated ${devices.length} device(s) in ${targetClassroom} to isOnline=${isOnline} (legacy topic format)`)
      return devices
    }

    console.warn(`[DeviceSync] ⚠️ Availability payload on [${topic}] missing both deviceId and classroom:`, data)
    return null
  } catch (err) {
    console.error(`[DeviceSync] Error handling availability event on [${topic}]:`, err)
    return null
  }
}

/**
 * Handles incoming projector RGB color telemetry
 *
 * Topic: smartclassroom/<classroom>/projector/color/state
 * Payload:
 *   {
 *     "power": "ON",
 *     "color": { "r": 255, "g": 0, "b": 255 }
 *   }
 *
 * @param {string} topic
 * @param {Object|string} payload
 * @returns {Promise<Object|null>}
 */
async function handleProjectorColorStateMessage(topic, payload) {
  try {
    let data = payload
    if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
      try {
        data = JSON.parse(payload.toString())
      } catch (e) {
        console.warn(`[DeviceSync] ⚠️ Could not parse JSON for projector color state: ${e.message}`)
        return null
      }
    }

    if (!data || typeof data !== 'object') {
      return null
    }

    const parsedTopic = parseMqttTopic(topic)
    const roomSlug = parsedTopic.classroom || 'room302'
    const roomRegex = classroomSlugToRegex(roomSlug)

    // Find projector device for this room
    let device = await Device.findOne({
      type: 'PROJECTOR',
      isActive: true,
      ...(roomRegex ? { classroom: { $regex: roomRegex } } : {}),
    })

    if (!device) {
      device = await Device.findOne({ type: 'PROJECTOR', isActive: true })
    }

    if (!device) {
      console.warn(`[DeviceSync] No projector found matching color state topic [${topic}]`)
      return null
    }

    // Update colorPower and color
    if (data.power) {
      device.colorPower = String(data.power).toUpperCase() === 'ON' ? 'ON' : 'OFF'
    }

    if (data.color && typeof data.color === 'object') {
      device.color = {
        r: Math.max(0, Math.min(255, Math.round(Number(data.color.r) || 0))),
        g: Math.max(0, Math.min(255, Math.round(Number(data.color.g) || 0))),
        b: Math.max(0, Math.min(255, Math.round(Number(data.color.b) || 0))),
      }
    }

    device.isOnline = true
    device.lastSeenAt = new Date()
    device.lastConfirmedAt = new Date()
    await device.save()

    console.log(`[DeviceSync] 🎨 Synced projector RGB state for [${device.deviceId}]: Power=${device.colorPower}, Color=`, device.color)

    // Broadcast in real-time to all connected dashboards
    emitDeviceStatus(device)
    emitDeviceColor(device)

    return device
  } catch (err) {
    console.error(`[DeviceSync] Error handling projector color state on [${topic}]:`, err)
    return null
  }
}

/**
 * Initializes listeners on MQTT status and availability topics
 */
function initDeviceSync() {
  console.log('[DeviceSync] 🔄 Registering real-time device status MQTT consumers...')

  // 1. Standardized state topics: smartclassroom/+/relay/+/state
  onMessage(TOPIC_PATTERNS.ALL_STATES, (topic, payload, rawPayload) => {
    console.log(`[DeviceSync] 📩 Received MQTT relay state on [${topic}]`)
    processDeviceStatusMessage(topic, payload)
  })

  // 1b. Projector RGB color state topic: smartclassroom/+/projector/color/state
  onMessage(TOPIC_PATTERNS.PROJECTOR_COLOR_STATE, (topic, payload, rawPayload) => {
    console.log(`[DeviceSync] 📩 Received MQTT projector color state on [${topic}]`)
    handleProjectorColorStateMessage(topic, payload)
  })

  // 2. Legacy status topics: classroom/device/+/status
  onMessage(TOPIC_PATTERNS.LEGACY_DEVICE_STATUS, (topic, payload, rawPayload) => {
    console.log(`[DeviceSync] 📩 Received legacy MQTT status message on [${topic}]`)
    processDeviceStatusMessage(topic, payload)
  })

  // 3. Availability handler: smartclassroom/+/availability (ESP32 online / offline / LWT / heartbeat)
  onMessage(TOPIC_PATTERNS.ALL_AVAILABILITY, (topic, payload, rawPayload) => {
    handleAvailability(topic, payload, rawPayload)
  })

  // 4. Legacy availability topics
  onMessage(TOPIC_PATTERNS.LEGACY_AVAILABILITY, (topic, payload, rawPayload) => {
    handleAvailability(topic, payload, rawPayload)
  })
  onMessage(TOPIC_PATTERNS.LEGACY_ESP32_STATUS, (topic, payload, rawPayload) => {
    handleAvailability(topic, payload, rawPayload)
  })
}

module.exports = {
  initDeviceSync,
  processDeviceStatusMessage,
  handleProjectorColorStateMessage,
  handleAvailability,
  normalizeState,
}
