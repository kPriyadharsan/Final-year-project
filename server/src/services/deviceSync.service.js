const { Device, DEVICE_STATES } = require('../models/Device')
const { onMessage } = require('./mqtt.service')
const { emitDeviceStatus } = require('./socket.service')

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

    // 1. Identify device: from payload.deviceId or derived from topic
    let targetDeviceId = data.deviceId

    if (!targetDeviceId && topic) {
      // E.g. classroom/device/ESP32-RM302-LIGHT-01/status
      const parts = topic.split('/')
      if (parts.length >= 3 && parts[0] === 'classroom' && parts[1] === 'device') {
        targetDeviceId = parts[2]
      }
    }

    let device = null

    if (targetDeviceId) {
      device = await Device.findOne({
        deviceId: targetDeviceId.trim().toUpperCase(),
      })
    }

    // Fallback 1: search by mqttStatusTopic if deviceId was not in topic/payload
    if (!device && topic) {
      device = await Device.findOne({ mqttStatusTopic: topic })
    }

    // Fallback 2: search by device type (e.g. topic "classroom/device/light/status" -> type "LIGHT")
    if (!device && targetDeviceId) {
      const upperType = targetDeviceId.trim().toUpperCase()
      if (['LIGHT', 'FAN', 'PROJECTOR'].includes(upperType)) {
        device = await Device.findOne({ type: upperType, isActive: true })
      }
    }

    if (!device) {
      console.warn(`[DeviceSync] No device found matching identifier "${targetDeviceId || topic}"`)
      return null
    }

    // 2. Determine state and online flag
    const rawState = data.state !== undefined ? data.state : data.command
    if (rawState !== undefined) {
      device.state = normalizeState(rawState)
    }

    if (typeof data.isOnline === 'boolean') {
      device.isOnline = data.isOnline
    } else {
      // Message arrival indicates device is online
      device.isOnline = true
    }

    // 3. Save to database
    await device.save()
    console.log(`[DeviceSync] 💾 Database updated: [${device.deviceId}] -> State: ${device.state}, Online: ${device.isOnline}`)

    // 4. Emit real-time Socket.IO event to all connected dashboards
    emitDeviceStatus(device)

    return device
  } catch (err) {
    console.error(`[DeviceSync] Error processing status message on [${topic}]:`, err)
    return null
  }
}

/**
 * Initializes listeners on MQTT status topics
 */
function initDeviceSync() {
  console.log('[DeviceSync] 🔄 Registering real-time device status MQTT consumers...')

  // Listen for classroom/device/+/status topics
  onMessage('classroom/device/+/status', (topic, payload) => {
    console.log(`[DeviceSync] 📩 Received MQTT status message on [${topic}]`)
    processDeviceStatusMessage(topic, payload)
  })

  // Listen for smartclassroom/+/relay/+/state topics
  onMessage('smartclassroom/+/relay/+/state', (topic, payload) => {
    console.log(`[DeviceSync] 📩 Received MQTT relay state on [${topic}]`)
    processDeviceStatusMessage(topic, payload)
  })

  // Listen for board availability and Last Will & Testament (LWT)
  const handleAvailability = async (topic, payload) => {
    try {
      let statusText = ''
      if (typeof payload === 'string') {
        try {
          const parsed = JSON.parse(payload)
          statusText = parsed.status || ''
        } catch {
          statusText = payload.trim().toLowerCase()
        }
      } else if (payload && typeof payload === 'object') {
        statusText = (payload.status || '').toLowerCase()
      }

      const isOnline = statusText === 'online'
      console.log(`[DeviceSync] 📡 Board availability event on [${topic}]: "${statusText}" (isOnline=${isOnline})`)

      // Extract optional classroom filter from payload or topic pattern
      let targetClassroom = null
      if (payload && typeof payload === 'object' && payload.classroom) {
        targetClassroom = payload.classroom
      } else if (topic) {
        const topicParts = topic.split('/')
        if (topicParts.length >= 2 && topicParts[0] === 'smartclassroom') {
          targetClassroom = topicParts[1]
        }
      }

      const query = { isActive: true }
      if (targetClassroom) {
        query.classroom = { $regex: new RegExp(`^${targetClassroom.trim()}$`, 'i') }
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

  onMessage('classroom/device/availability', handleAvailability)
  onMessage('classroom/esp32/status', handleAvailability)
}

module.exports = {
  initDeviceSync,
  processDeviceStatusMessage,
  normalizeState,
}
