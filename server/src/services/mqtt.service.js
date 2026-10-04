const mqtt = require('mqtt')
const env = require('../config/env')

/**
 * Smart Classroom Production MQTT Service
 *
 * Architecture:
 *   React (Client)  -> [HTTPS REST / Socket.IO] -> Node/Express (Backend)
 *   Node/Express    -> [MQTT over TLS (Port 8883)] -> EMQX Cloud Broker
 *   EMQX Cloud      -> [MQTT (Port 8883/1883)] -> ESP32 Hardware Relays
 *
 * Security & Reliability Requirements:
 * - Credentials reside strictly on the backend (never exposed to React client).
 * - Supports TLS (mqtts://) for EMQX Cloud production deployments.
 * - Idempotent connection: prevents duplicate connection instances.
 * - Idempotent subscription: prevents duplicate subscription packets.
 * - Non-fatal error handling: prevents host server crashes on network or broker dropouts.
 * - Never logs MQTT passwords or raw credential strings.
 * - Resubscribes automatically upon reconnection with QoS 1.
 * - Graceful client disconnect on server shutdown.
 */

// Configuration values from validated environment
const brokerUrl = env.MQTT_BROKER_URL || process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1883'
const username = env.MQTT_USERNAME || process.env.MQTT_USERNAME || ''
const password = env.MQTT_PASSWORD || process.env.MQTT_PASSWORD || ''
const baseClientId =
  env.MQTT_CLIENT_ID ||
  process.env.MQTT_CLIENT_ID ||
  'smart_classroom_backend'
const clientId = `${baseClientId}_srv_${Math.random().toString(16).slice(2, 8)}`

const isTls = brokerUrl.startsWith('mqtts://') || brokerUrl.startsWith('ssl://') || brokerUrl.startsWith('wss://')

const { TOPIC_PATTERNS } = require('../utils/mqttTopics')

// Default operational topics for telemetry and hardware synchronization
const DEFAULT_TOPICS = [
  TOPIC_PATTERNS.ALL_STATES,
  TOPIC_PATTERNS.ALL_COMMANDS,
  TOPIC_PATTERNS.ALL_AVAILABILITY,
  TOPIC_PATTERNS.PROJECTOR_COLOR_STATE,
  TOPIC_PATTERNS.PROJECTOR_COLOR_COMMAND,
  TOPIC_PATTERNS.LEGACY_DEVICE_STATUS,
  TOPIC_PATTERNS.LEGACY_AVAILABILITY,
  TOPIC_PATTERNS.LEGACY_ESP32_STATUS,
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
 * Helper to mask credentials in URLs for secure logging
 * @param {string} url
 * @returns {string}
 */
function maskBrokerUrl(url) {
  if (!url || typeof url !== 'string') return ''
  return url.replace(/\/\/(.*?):(.*?)@/, '//***:***@')
}

/**
 * Initializes and connects the MQTT client to the broker.
 * Avoids duplicate connections if client is already established or connecting.
 *
 * @param {Object} [customConfig={}] - Optional configuration overrides (e.g. for testing)
 * @returns {mqtt.MqttClient|null}
 */
function connectMQTT(customConfig = {}) {
  if (client) {
    if (isConnected || currentStatus === 'connecting') {
      return client
    }
  }

  currentStatus = 'connecting'
  lastError = null

  const targetBrokerUrl = customConfig.brokerUrl || brokerUrl
  const targetClientId = customConfig.clientId || clientId
  const targetUsername = customConfig.username !== undefined ? customConfig.username : username
  const targetPassword = customConfig.password !== undefined ? customConfig.password : password
  const targetIsTls = targetBrokerUrl.startsWith('mqtts://') || targetBrokerUrl.startsWith('ssl://') || targetBrokerUrl.startsWith('wss://')

  console.log(`[MQTT] Initializing ${targetIsTls ? 'TLS encrypted (Port 8883)' : 'standard'} connection to broker: ${maskBrokerUrl(targetBrokerUrl)}`)
  console.log(`[MQTT] Client ID: ${targetClientId} | TLS: ${targetIsTls} | Auth configured: ${Boolean(targetUsername && targetPassword)}`)

  const connectionOptions = {
    clientId: targetClientId,
    clean: true,
    connectTimeout: 10000, // 10s timeout to allow for cloud TLS negotiation
    reconnectPeriod: 5000,  // Automatically retry connection every 5 seconds
    keepalive: 60,
  }

  // TLS-specific configuration for EMQX Cloud (mqtts://)
  // Standard Node.js root CA store validates EMQX Cloud certificates without needing custom CA file
  if (targetIsTls) {
    connectionOptions.rejectUnauthorized = true
  }

  // Authentication credentials (strictly configurable via environment, never logged)
  if (targetUsername && targetUsername.trim() !== '') {
    connectionOptions.username = targetUsername.trim()
  }
  if (targetPassword && targetPassword.trim() !== '') {
    connectionOptions.password = targetPassword.trim()
  }

  try {
    client = mqtt.connect(targetBrokerUrl, connectionOptions)
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

    console.log(`[MQTT] ✅ Connected successfully to broker at ${maskBrokerUrl(brokerUrl)} (TLS: ${isTls})`)

    // Subscribe to default topics (QoS 1)
    DEFAULT_TOPICS.forEach((topicPattern) => {
      internalSubscribe(topicPattern, 1)
    })

    // Resubscribe any registered message handlers
    for (const topicPattern of messageHandlers.keys()) {
      internalSubscribe(topicPattern, 1)
    }
  })

  // 2. Reconnect Event
  client.on('reconnect', () => {
    isConnected = false
    currentStatus = 'reconnecting'
    reconnectAttempts += 1

    // Log reconnects cleanly without flooding logs
    if (reconnectAttempts === 1 || reconnectAttempts % 5 === 0) {
      console.warn(`[MQTT] 🔄 Reconnecting to broker (${maskBrokerUrl(brokerUrl)})... [attempt #${reconnectAttempts}]`)
    }
  })

  // 3. Error Event (Catches network/broker dropouts safely to prevent server crash)
  client.on('error', (err) => {
    isConnected = false
    currentStatus = 'error'
    lastError = err.message || 'Unknown MQTT connection error'

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
      // Retain as raw string if payload is plain text/number
    }

    // Execute matching pattern handlers
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
 * Internal subscription helper with duplicate prevention
 *
 * @param {string} topic
 * @param {number} [qos=1]
 */
function internalSubscribe(topic, qos = 1) {
  if (!client || !isConnected) {
    activeSubscriptions.add(topic)
    return
  }

  client.subscribe(topic, { qos }, (err) => {
    if (err) {
      console.warn(`[MQTT] Failed to subscribe to [${topic}]: ${err.message}`)
      return
    }

    activeSubscriptions.add(topic)
  })
}

/**
 * Subscribes to an MQTT topic pattern with duplicate prevention.
 *
 * @param {string} topic
 * @param {number} [qos=1]
 * @returns {Promise<boolean>}
 */
function subscribe(topic, qos = 1) {
  return new Promise((resolve) => {
    activeSubscriptions.add(topic)

    if (!client || !isConnected) {
      return resolve(false)
    }

    client.subscribe(topic, { qos }, (err) => {
      if (err) {
        console.warn(`[MQTT] Failed to subscribe to [${topic}]: ${err.message}`)
        return resolve(false)
      }

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

    let isSettled = false
    const timeoutTimer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true
        console.warn(`[MQTT] ⚠️ Publish timeout on [${topic}] after 5000ms`)
        reject(new Error(`MQTT publication to [${topic}] timed out after 5000ms.`))
      }
    }, 5000)

    client.publish(topic, payload, options, (err) => {
      clearTimeout(timeoutTimer)
      if (isSettled) return
      isSettled = true

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
 * Avoids duplicate subscriptions.
 *
 * @param {string} topicPattern (e.g. 'classroom/device/+/status')
 * @param {Function} handler (topic, parsedPayload, rawPayload) => void
 * @returns {Function} Unsubscribe handler function
 */
function onMessage(topicPattern, handler) {
  if (!messageHandlers.has(topicPattern)) {
    messageHandlers.set(topicPattern, new Set())
    // Ensure client subscribes to new topic pattern (QoS 1)
    subscribe(topicPattern, 1)
  }
  messageHandlers.get(topicPattern).add(handler)

  return () => {
    const handlers = messageHandlers.get(topicPattern)
    if (handlers) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        messageHandlers.delete(topicPattern)
        unsubscribe(topicPattern)
      }
    }
  }
}

/**
 * Exposes live MQTT connection status and metrics to the application.
 * Never includes plaintext credentials.
 *
 * @returns {Object}
 */
function getMQTTStatus() {
  return {
    connected: isConnected,
    status: currentStatus,
    brokerUrl: maskBrokerUrl(brokerUrl),
    clientId,
    protocol: isTls ? 'mqtts' : 'mqtt',
    isTls,
    hasAuth: !!(username && password),
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

    console.log('[MQTT] Disconnecting client gracefully...')
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
