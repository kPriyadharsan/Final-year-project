/**
 * Centralized MQTT Topic Architecture & Payload Helpers
 *
 * Standardized Topic Hierarchy:
 *   Commands     : smartclassroom/<classroom>/relay/<deviceType>/command
 *   States       : smartclassroom/<classroom>/relay/<deviceType>/state
 *   Availability : smartclassroom/<classroom>/availability
 *
 * Example:
 *   smartclassroom/room302/relay/light/command
 *   smartclassroom/room302/relay/light/state
 *   smartclassroom/room302/availability
 */

/**
 * Normalizes classroom string into an MQTT-safe slug.
 * "Room 302" -> "room302"
 * "room 302" -> "room302"
 * "Lab-101"  -> "lab101"
 *
 * @param {string} classroom
 * @returns {string}
 */
function toClassroomSlug(classroom = 'room302') {
  if (!classroom || typeof classroom !== 'string') return 'room302'
  return classroom.toLowerCase().replace(/[^a-z0-9]/g, '') || 'room302'
}

/**
 * Normalizes device appliance type into topic slug.
 * "LIGHT" -> "light", "FAN" -> "fan", "PROJECTOR" -> "projector"
 *
 * @param {string} type
 * @returns {string}
 */
function toDeviceTypeSlug(type = 'light') {
  if (!type || typeof type !== 'string') return 'light'
  return type.toLowerCase().trim()
}

/**
 * Builds the MQTT command publication topic for a device.
 *
 * @param {string} classroom - e.g. "Room 302"
 * @param {string} deviceType - e.g. "LIGHT"
 * @returns {string} e.g. "smartclassroom/room302/relay/light/command"
 */
function getCommandTopic(classroom = 'Room 302', deviceType = 'light') {
  const roomSlug = toClassroomSlug(classroom)
  const typeSlug = toDeviceTypeSlug(deviceType)
  return `smartclassroom/${roomSlug}/relay/${typeSlug}/command`
}

/**
 * Builds the MQTT state status topic for a device.
 *
 * @param {string} classroom - e.g. "Room 302"
 * @param {string} deviceType - e.g. "LIGHT"
 * @returns {string} e.g. "smartclassroom/room302/relay/light/state"
 */
function getStateTopic(classroom = 'Room 302', deviceType = 'light') {
  const roomSlug = toClassroomSlug(classroom)
  const typeSlug = toDeviceTypeSlug(deviceType)
  return `smartclassroom/${roomSlug}/relay/${typeSlug}/state`
}

/**
 * Builds the MQTT availability (LWT) topic for a classroom node.
 *
 * @param {string} classroom - e.g. "Room 302"
 * @returns {string} e.g. "smartclassroom/room302/availability"
 */
function getAvailabilityTopic(classroom = 'Room 302') {
  const roomSlug = toClassroomSlug(classroom)
  return `smartclassroom/${roomSlug}/availability`
}

/**
 * Standardized Wildcard Subscriptions for Backend synchronization
 */
const TOPIC_PATTERNS = Object.freeze({
  // Modern standardized patterns
  ALL_STATES: 'smartclassroom/+/relay/+/state',
  ALL_AVAILABILITY: 'smartclassroom/+/availability',
  ALL_COMMANDS: 'smartclassroom/+/relay/+/command',

  // Backward-compatibility patterns
  LEGACY_DEVICE_STATUS: 'classroom/device/+/status',
  LEGACY_AVAILABILITY: 'classroom/device/availability',
  LEGACY_ESP32_STATUS: 'classroom/esp32/status',
})

/**
 * Parses an incoming MQTT topic to extract classroom slug, device type, and channel.
 *
 * @param {string} topic
 * @returns {{ isSmartClassroom: boolean, classroom?: string, deviceType?: string, channel?: string }}
 */
function parseMqttTopic(topic) {
  if (!topic || typeof topic !== 'string') {
    return { isSmartClassroom: false }
  }

  const parts = topic.split('/')

  // Pattern: smartclassroom/<room>/availability
  if (parts.length === 3 && parts[0] === 'smartclassroom' && parts[2] === 'availability') {
    return {
      isSmartClassroom: true,
      classroom: parts[1],
      channel: 'availability',
    }
  }

  // Pattern: smartclassroom/<room>/relay/<device>/<channel> (command or state)
  if (parts.length === 5 && parts[0] === 'smartclassroom' && parts[2] === 'relay') {
    return {
      isSmartClassroom: true,
      classroom: parts[1],
      deviceType: parts[3],
      channel: parts[4], // 'command' | 'state'
    }
  }

  // Legacy Pattern: classroom/device/<device>/status
  if (parts.length === 4 && parts[0] === 'classroom' && parts[1] === 'device' && parts[3] === 'status') {
    return {
      isSmartClassroom: false,
      deviceType: parts[2],
      channel: 'state',
    }
  }

  return { isSmartClassroom: false }
}

/**
 * Formats a standardized JSON command payload.
 * Matches user requirements:
 * {
 *   "deviceId": "...",
 *   "command": "ON",
 *   "state": 1,
 *   "timestamp": "..."
 * }
 *
 * @param {Object} params
 * @returns {Object}
 */
function buildCommandPayload({
  deviceId,
  name,
  classroom,
  type,
  command,
  state,
  gpioPin,
  initiatedBy,
  timestamp = new Date().toISOString(),
}) {
  const normalizedCommand = String(command).trim().toUpperCase()
  const numericState = normalizedCommand === 'ON' ? 1 : 0

  return {
    deviceId,
    name,
    classroom,
    type,
    command: normalizedCommand,
    state: numericState,
    gpioPin: gpioPin ?? null,
    initiatedBy: initiatedBy || null,
    timestamp,
  }
}

/**
 * Formats a standardized JSON state telemetry payload.
 * Matches user requirements:
 * {
 *   "deviceId": "...",
 *   "state": "ON",
 *   "timestamp": "..."
 * }
 *
 * @param {Object} params
 * @returns {Object}
 */
function buildStatePayload({
  deviceId,
  type,
  state,
  isOnline = true,
  timestamp = new Date().toISOString(),
}) {
  const normalizedState = String(state).trim().toUpperCase()

  return {
    deviceId,
    type: type ? type.toUpperCase() : undefined,
    state: normalizedState,
    isOnline: Boolean(isOnline),
    timestamp,
  }
}

/**
 * Converts a classroom slug (e.g. "room302") to a RegExp that flexibly matches
 * database classroom strings such as "Room 302", "Classroom 302", "room-302", etc.
 *
 * @param {string} slug
 * @returns {RegExp}
 */
function classroomSlugToRegex(slug) {
  if (!slug || typeof slug !== 'string') return null
  const clean = slug.replace(/[^a-z0-9]/gi, '')
  const match = clean.match(/^([a-zA-Z]*)(\d+)$/)
  if (match) {
    const [, letters, digits] = match
    if (letters && digits) {
      return new RegExp(`(${letters}|classroom)?[\\s\\-_]*${digits}`, 'i')
    }
    if (digits) return new RegExp(digits, 'i')
  }
  return new RegExp(clean.split('').join('[\\s\\-_]*'), 'i')
}

module.exports = {
  toClassroomSlug,
  toDeviceTypeSlug,
  classroomSlugToRegex,
  getCommandTopic,
  getStateTopic,
  getAvailabilityTopic,
  TOPIC_PATTERNS,
  parseMqttTopic,
  buildCommandPayload,
  buildStatePayload,
}
