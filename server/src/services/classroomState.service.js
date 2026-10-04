const { Device, DEVICE_TYPES, DEVICE_STATES } = require('../models/Device')
const { COLOR_PALETTE } = require('../constants/deviceCapabilities')

/**
 * Resolves RGB tuple to a known friendly color name (e.g. "purple", "blue", "white")
 *
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
function findColorName(r, g, b) {
  if (r === 0 && g === 0 && b === 0) return 'off'
  for (const [name, val] of Object.entries(COLOR_PALETTE)) {
    if (val.r === r && val.g === g && val.b === b) {
      return name
    }
  }
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`
}

/**
 * Retrieves the normalized classroom device state from MongoDB (authoritative hardware source of truth)
 *
 * Exposes clean semantic state for Gemini Live and API clients without internal database IDs,
 * MQTT topics, or GPIO details.
 *
 * @param {string} [classroom='Room 302']
 * @returns {Promise<Object>}
 */
async function getClassroomState(classroom = 'Room 302') {
  const normClassroom = String(classroom || 'Room 302').trim()

  // 1. Query active devices in target classroom
  const devices = await Device.find({
    classroom: { $regex: new RegExp(`^${normClassroom}$`, 'i') },
    isActive: true,
  }).lean()

  // 2. Identify controller node status
  const controllerNode = devices.find(
    (d) => d.entityType === 'NODE' || d.deviceCategory === 'NODE' || d.type === DEVICE_TYPES.OTHER
  )
  const isControllerOnline = controllerNode ? controllerNode.isOnline === true : true

  // 3. Find individual appliance channels
  const lightDoc = devices.find((d) => d.type === DEVICE_TYPES.LIGHT)
  const fanDoc = devices.find((d) => d.type === DEVICE_TYPES.FAN)
  const projDoc = devices.find((d) => d.type === DEVICE_TYPES.PROJECTOR)

  const lightPower = (lightDoc?.confirmedState || lightDoc?.state || DEVICE_STATES.OFF).toUpperCase()
  const fanPower = (fanDoc?.confirmedState || fanDoc?.state || DEVICE_STATES.OFF).toUpperCase()
  const projPower = (projDoc?.confirmedState || projDoc?.state || DEVICE_STATES.OFF).toUpperCase()

  const projRgbPower = (projDoc?.colorPower || (projPower === 'ON' ? 'ON' : 'OFF')).toUpperCase()
  const r = projDoc?.color?.r ?? 255
  const g = projDoc?.color?.g ?? 255
  const b = projDoc?.color?.b ?? 255
  const colorName = findColorName(r, g, b)

  const lightOnline = isControllerOnline && lightDoc?.isOnline !== false
  const fanOnline = isControllerOnline && fanDoc?.isOnline !== false
  const projOnline = isControllerOnline && projDoc?.isOnline !== false

  const allFresh = isControllerOnline && (lightOnline || !lightDoc) && (fanOnline || !fanDoc) && (projOnline || !projDoc)

  return {
    classroom: normClassroom,
    devices: {
      light: {
        power: lightPower,
        isOnline: lightOnline,
        source: lightDoc?.lastConfirmedAt ? 'ESP32_TELEMETRY' : 'BACKEND_CONFIRMED',
        updatedAt: lightDoc?.lastConfirmedAt || lightDoc?.updatedAt || new Date().toISOString(),
      },
      fan: {
        power: fanPower,
        isOnline: fanOnline,
        source: fanDoc?.lastConfirmedAt ? 'ESP32_TELEMETRY' : 'BACKEND_CONFIRMED',
        updatedAt: fanDoc?.lastConfirmedAt || fanDoc?.updatedAt || new Date().toISOString(),
      },
      projector: {
        power: projPower,
        isOnline: projOnline,
        rgb: {
          enabled: true,
          power: projRgbPower,
          color: colorName,
          r,
          g,
          b,
          hex: `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`,
        },
        source: projDoc?.lastConfirmedAt ? 'ESP32_TELEMETRY' : 'BACKEND_CONFIRMED',
        updatedAt: projDoc?.lastConfirmedAt || projDoc?.updatedAt || new Date().toISOString(),
      },
    },
    isFresh: allFresh,
    controllerOnline: isControllerOnline,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Retrieves the state of a single device (or all devices) with freshness verification
 *
 * @param {string} [classroom='Room 302']
 * @param {string} [deviceType='all'] - 'light', 'fan', 'projector', or 'all'
 * @returns {Promise<Object>}
 */
async function getDeviceState(classroom = 'Room 302', deviceType = 'all') {
  const fullState = await getClassroomState(classroom)
  const normType = String(deviceType || 'all').trim().toLowerCase()

  if (normType === 'all' || !normType) {
    return {
      classroom: fullState.classroom,
      devices: fullState.devices,
      isFresh: fullState.isFresh,
      updatedAt: fullState.updatedAt,
    }
  }

  const device = fullState.devices[normType]
  if (!device) {
    return {
      classroom: fullState.classroom,
      device: normType,
      error: `Device "${normType}" not found in classroom "${classroom}".`,
      isFresh: false,
    }
  }

  // Handle stale / offline status
  if (!device.isOnline || !fullState.isFresh) {
    return {
      classroom: fullState.classroom,
      device: normType,
      power: device.power,
      isOnline: false,
      isFresh: false,
      stale: true,
      message: "I'm not getting the latest status from the classroom controller.",
      updatedAt: device.updatedAt,
    }
  }

  return {
    classroom: fullState.classroom,
    device: normType,
    power: device.power,
    ...(device.rgb ? { rgb: device.rgb } : {}),
    isOnline: true,
    isFresh: true,
    source: device.source,
    updatedAt: device.updatedAt,
  }
}

module.exports = {
  getClassroomState,
  getDeviceState,
  findColorName,
}
