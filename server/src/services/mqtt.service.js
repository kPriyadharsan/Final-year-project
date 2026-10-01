const mqtt = require('mqtt')
const env = require('../config/env')

/**
 * Smart Classroom MQTT Service
 *
 * Requirements:
 * - Reads config from MQTT_BROKER_URL, MQTT_USERNAME, MQTT_PASSWORD, MQTT_CLIENT_ID
 * - Connects when backend starts
 * - Automatically attempts reconnect
 * - Subscribes to classroom/device/+/status
 * - Provides reusable publish() function
 * - Never crashes the Express server if broker is offline
 * - Exposes live connection status to the application
 */

// Configuration values from validated environment
const brokerUrl = env.MQTT_BROKER_URL || process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1883'
const username = env.MQTT_USERNAME || process.env.MQTT_USERNAME || ''
const password = env.MQTT_PASSWORD || process.env.MQTT_PASSWORD || ''
const clientId =
  env.MQTT_CLIENT_ID ||
  process.env.MQTT_CLIENT_ID ||
  `smart_classroom_backend_${Math.random().toString(16).slice(2, 8)}`

// Default topics to automatically subscribe to
const DEFAULT_TOPICS = [
  'classroom/device/+/status',
  'classroom/device/availability',
  'classroom/esp32/status',
  'smartclassroom/+/relay/+/state',
]

// Internal state tracking
let client = null
let isConnected = false
let currentStatus = 'disconnected' // 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'error'
let lastConnectedAt = null
let lastError = null
let reconnectAttempts = 0
const activeSubscriptions = new Set()
const messageHandlers = new Map() // topic pattern -> Set of callback functions

/**
 * Initializes and connects the MQTT client to the broker.
 * Never throws or crashes the host server if broker is offline or unreachable.
 *
 * @returns {mqtt.MqttClient|null}
 */
function connectMQTT() {
  if (client) {
    return client
  }

  currentStatus = 'connecting'
  lastError = null

  console.log(`[MQTT] Initializing connection to broker: ${brokerUrl}`)
  console.log(`[MQTT] Client ID: ${clientId}`)

  const connectionOptions = {
    clientId,
    clean: true,
    connectTimeout: 5000,
    reconnectPeriod: 5000, // Automatically retry connection every 5 seconds
    keepalive: 60,
  }

  if (username && username.trim() !== '') {
    connectionOptions.username = username
  }
  if (password && password.trim() !== '') {
    connectionOptions.password = password
  }

  try {
    client = mqtt.connect(brokerUrl, connectionOptions)
  } catch (err) {
    currentStatus = 'error'
    lastError = err.message
    console.error(`[MQTT] Initialization error (non-fatal): ${err.message}`)
    return null
  }

  // 1. Connection Event
  client.on('connect', (connack) => {
    isConnected = true
    currentStatus = 'connected'
    lastConnectedAt = new Date().toISOString()
    lastError = null
    reconnectAttempts = 0

    console.log(`[MQTT] ✅ Connected successfully to broker at ${brokerUrl}`)

    // Automatically subscribe to default topics
    DEFAULT_TOPICS.forEach((topicPattern) => {
      subscribe(topicPattern, 1)
    })
  })

  // 2. Reconnect Event
  client.on('reconnect', () => {
    isConnected = false
    currentStatus = 'reconnecting'
    reconnectAttempts += 1
    // Log reconnects cleanly without flooding logs
    if (reconnectAttempts === 1 || reconnectAttempts % 5 === 0) {
      console.warn(`[MQTT] 🔄 Reconnecting to ${brokerUrl}... (attempt #${reconnectAttempts})`)
    }
  })

  // 3. Error Event (CRITICAL: Catches errors to prevent process crash)
  client.on('error', (err) => {
    isConnected = false
    currentStatus = 'error'
    lastError = err.message || 'Unknown MQTT connection error'

    // Non-fatal warning; server continues operating normally
    console.warn(`[MQTT] ⚠️ Broker connection error (will retry automatically): ${err.message}`)
  })

  // 4. Close Event
  client.on('close', () => {
    if (isConnected) {
      console.log('[MQTT] Connection closed by broker.')
    }
    isConnected = false
    if (currentStatus !== 'error' && currentStatus !== 'reconnecting') {
      currentStatus = 'disconnected'
    }
  })

  // 5. Offline Event
  client.on('offline', () => {
    isConnected = false
    currentStatus = 'offline'
  })

  // 6. Incoming Message Dispatcher
  client.on('message', (topic, payloadBuffer) => {
    const rawPayload = payloadBuffer.toString()
    let parsedPayload = rawPayload

    try {
      parsedPayload = JSON.parse(rawPayload)
    } catch {
      // Retain as raw string if not JSON
    }

    // Execute pattern handlers
    for (const [pattern, handlers] of messageHandlers.entries()) {
      if (matchesMqttTopic(pattern, topic)) {
        handlers.forEach((handler) => {
          try {
            handler(topic, parsedPayload, rawPayload)
          } catch (handlerErr) {
            console.error(`[MQTT] Error in message handler for [${topic}]:`, handlerErr)
          }
        })
      }
    }
  })

  return client
}

/**
 * Checks if a given MQTT topic matches an MQTT wildcard pattern (+ and #)
 *
 * @param {string} pattern
 * @param {string} topic
 * @returns {boolean}
 */
function matchesMqttTopic(pattern, topic) {
  if (pattern === topic || pattern === '#') return true

  const patternParts = pattern.split('/')
  const topicParts = topic.split('/')

  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i]
    if (p === '#') return true
    if (p !== '+' && p !== topicParts[i]) return false
  }

  return patternParts.length === topicParts.length
}

/**
 * Subscribes to an MQTT topic pattern.
 *
 * @param {string} topic
 * @param {number} [qos=0]
 * @returns {Promise<boolean>}
 */
function subscribe(topic, qos = 0) {
  return new Promise((resolve) => {
    if (!client) {
      activeSubscriptions.add(topic)
      return resolve(false)
    }

    client.subscribe(topic, { qos }, (err) => {
      if (err) {
        console.warn(`[MQTT] Failed to subscribe to [${topic}]: ${err.message}`)
        return resolve(false)
      }

      activeSubscriptions.add(topic)
      console.log(`[MQTT] 📡 Subscribed to topic: ${topic} (QoS: ${qos})`)
      return resolve(true)
    })
  })
}

/**
 * Unsubscribes from an MQTT topic.
 *
 * @param {string} topic
 * @returns {Promise<boolean>}
 */
function unsubscribe(topic) {
  return new Promise((resolve) => {
    activeSubscriptions.delete(topic)
    if (!client) return resolve(true)

    client.unsubscribe(topic, (err) => {
      if (err) {
        console.warn(`[MQTT] Failed to unsubscribe from [${topic}]: ${err.message}`)
        return resolve(false)
      }
      return resolve(true)
    })
  })
}

/**
 * Reusable function to publish messages to the MQTT broker.
 * Accepts strings, Buffers, or plain JavaScript objects (auto-stringified to JSON).
 *
 * @param {string} topic - MQTT destination topic
 * @param {string|Object|Buffer} message - Message payload
 * @param {Object} [options={}] - Publish options (qos, retain, etc.)
 * @returns {Promise<{ success: boolean, topic: string, timestamp: string }>}
 */
function publish(topic, message, options = { qos: 1, retain: false }) {
  return new Promise((resolve, reject) => {
    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
      return reject(new Error('Invalid MQTT topic provided for publication.'))
    }

    if (!client || !isConnected) {
      const offlineMsg = `Cannot publish to [${topic}]: MQTT client is not connected to broker (${currentStatus}).`
      return reject(new Error(offlineMsg))
    }

    let payload = message
    if (typeof message === 'object' && !Buffer.isBuffer(message)) {
      try {
        payload = JSON.stringify(message)
      } catch (err) {
        return reject(new Error(`Failed to serialize message object to JSON: ${err.message}`))
      }
    } else if (typeof message !== 'string' && !Buffer.isBuffer(message)) {
      payload = String(message)
    }

    client.publish(topic, payload, options, (err) => {
      if (err) {
        console.error(`[MQTT] Publish error on topic [${topic}]:`, err)
        return reject(err)
      }

      resolve({
        success: true,
        topic,
        timestamp: new Date().toISOString(),
      })
    })
  })
}

/**
 * Registers an application callback for incoming messages on a topic pattern.
 *
 * @param {string} topicPattern (e.g. 'classroom/device/+/status')
 * @param {Function} handler (topic, parsedPayload, rawPayload) => void
 * @returns {Function} Unsubscribe handler function
 */
function onMessage(topicPattern, handler) {
  if (!messageHandlers.has(topicPattern)) {
    messageHandlers.set(topicPattern, new Set())
  }
  messageHandlers.get(topicPattern).add(handler)

  // Ensure client is subscribed to topic pattern
  subscribe(topicPattern, 1)

  return () => {
    const handlers = messageHandlers.get(topicPattern)
    if (handlers) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        messageHandlers.delete(topicPattern)
      }
    }
  }
}

/**
 * Exposes live MQTT connection status and metrics to the application.
 *
 * @returns {Object}
 */
function getMQTTStatus() {
  return {
    connected: isConnected,
    status: currentStatus,
    brokerUrl,
    clientId,
    subscriptions: Array.from(activeSubscriptions),
    lastConnectedAt,
    lastError,
    reconnectAttempts,
  }
}

/**
 * Disconnects the MQTT client gracefully upon server shutdown.
 *
 * @param {boolean} [force=false]
 * @returns {Promise<void>}
 */
function disconnectMQTT(force = false) {
  return new Promise((resolve) => {
    if (!client) {
      return resolve()
    }

    console.log('[MQTT] Disconnecting client...')
    client.end(force, () => {
      isConnected = false
      currentStatus = 'disconnected'
      client = null
      console.log('[MQTT] Client disconnected.')
      resolve()
    })
  })
}

module.exports = {
  connectMQTT,
  disconnectMQTT,
  publish,
  subscribe,
  unsubscribe,
  onMessage,
  getMQTTStatus,
  DEFAULT_TOPICS,
}
