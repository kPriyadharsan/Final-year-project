/**
 * Centralized Device Capability Model & Color Palette Definition
 *
 * Single Source of Truth for Smart Classroom Device Capabilities:
 * - LIGHT     : [power] (ON, OFF)
 * - FAN       : [power] (ON, OFF)
 * - PROJECTOR : [power, rgb] (ON, OFF, SET_COLOR)
 */

const DEVICE_CAPABILITIES = Object.freeze({
  light: {
    device: 'light',
    name: 'Classroom Light',
    capabilities: ['power'],
    actions: ['ON', 'OFF'],
    description: 'Classroom main lighting via relay channel.',
  },
  fan: {
    device: 'fan',
    name: 'Ceiling Fan',
    capabilities: ['power'],
    actions: ['ON', 'OFF'],
    description: 'Classroom ceiling fans via relay channel.',
  },
  projector: {
    device: 'projector',
    name: 'Projector',
    capabilities: ['power', 'rgb'],
    actions: ['ON', 'OFF', 'SET_COLOR'],
    description: 'Classroom projector master power relay and PWM RGB ambient LED.',
  },
})

/**
 * Standardized Classroom Color Palette
 * Backend resolves exact RGB values rather than trusting arbitrary values from LLMs.
 */
const COLOR_PALETTE = Object.freeze({
  red: { r: 255, g: 0, b: 0, hex: '#FF0000', name: 'red' },
  green: { r: 0, g: 255, b: 0, hex: '#00FF00', name: 'green' },
  blue: { r: 0, g: 0, b: 255, hex: '#0000FF', name: 'blue' },
  purple: { r: 168, g: 85, b: 247, hex: '#A855F7', name: 'purple' },
  yellow: { r: 250, g: 204, b: 21, hex: '#FACC15', name: 'yellow' },
  orange: { r: 249, g: 115, b: 22, hex: '#F97316', name: 'orange' },
  pink: { r: 236, g: 72, b: 153, hex: '#EC4899', name: 'pink' },
  cyan: { r: 6, g: 182, b: 212, hex: '#06B6D4', name: 'cyan' },
  white: { r: 255, g: 255, b: 255, hex: '#FFFFFF', name: 'white' },
  'warm white': { r: 255, g: 214, b: 170, hex: '#FFD6AA', name: 'warm white' },
  warmwhite: { r: 255, g: 214, b: 170, hex: '#FFD6AA', name: 'warm white' },
  'cool white': { r: 200, g: 230, b: 255, hex: '#C8E6FF', name: 'cool white' },
  coolwhite: { r: 200, g: 230, b: 255, hex: '#C8E6FF', name: 'cool white' },
  'sky blue': { r: 56, g: 189, b: 248, hex: '#38BDF8', name: 'sky blue' },
  skyblue: { r: 56, g: 189, b: 248, hex: '#38BDF8', name: 'sky blue' },
  magenta: { r: 255, g: 0, b: 255, hex: '#FF00FF', name: 'magenta' },
  violet: { r: 139, g: 92, b: 246, hex: '#8B5CF6', name: 'violet' },
  lime: { r: 132, g: 204, b: 22, hex: '#84CC16', name: 'lime' },
  amber: { r: 245, g: 158, b: 11, hex: '#F59E0B', name: 'amber' },
  off: { r: 0, g: 0, b: 0, hex: '#000000', name: 'off' },
})

/**
 * Resolves color input (name, hex, or { r, g, b }) to validated numeric RGB object.
 *
 * @param {string|Object} input - Color name (e.g. "purple"), hex (e.g. "#A855F7"), or object
 * @returns {{ r: number, g: number, b: number, hex: string, name: string } | null}
 */
function resolveRgbColor(input) {
  if (!input) return null

  // If input is an object: { name: "purple" } or { r: 255, g: 0, b: 255 }
  if (typeof input === 'object') {
    if (input.name && typeof input.name === 'string') {
      const match = resolveRgbColor(input.name)
      if (match) return match
    }
    if (
      typeof input.r !== 'undefined' &&
      typeof input.g !== 'undefined' &&
      typeof input.b !== 'undefined'
    ) {
      const r = Math.max(0, Math.min(255, Math.round(Number(input.r) || 0)))
      const g = Math.max(0, Math.min(255, Math.round(Number(input.g) || 0)))
      const b = Math.max(0, Math.min(255, Math.round(Number(input.b) || 0)))
      const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`
      return { r, g, b, hex, name: input.name || 'custom' }
    }
  }

  if (typeof input !== 'string') return null
  const cleaned = input.trim().toLowerCase()

  // 1. Direct palette lookup
  if (COLOR_PALETTE[cleaned]) {
    return { ...COLOR_PALETTE[cleaned] }
  }

  // 2. Hex code check (#RRGGBB or #RGB)
  const hex6Match = cleaned.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (hex6Match) {
    const r = parseInt(hex6Match[1], 16)
    const g = parseInt(hex6Match[2], 16)
    const b = parseInt(hex6Match[3], 16)
    return { r, g, b, hex: `#${hex6Match[1]}${hex6Match[2]}${hex6Match[3]}`.toUpperCase(), name: 'custom' }
  }

  const hex3Match = cleaned.match(/^#?([a-f\d])([a-f\d])([a-f\d])$/i)
  if (hex3Match) {
    const r = parseInt(hex3Match[1] + hex3Match[1], 16)
    const g = parseInt(hex3Match[2] + hex3Match[2], 16)
    const b = parseInt(hex3Match[3] + hex3Match[3], 16)
    return { r, g, b, hex: `#${hex3Match[1]}${hex3Match[1]}${hex3Match[2]}${hex3Match[2]}${hex3Match[3]}${hex3Match[3]}`.toUpperCase(), name: 'custom' }
  }

  // 3. Whole-word boundary matching (e.g. "dark blue", "light purple", "glow red")
  for (const [name, color] of Object.entries(COLOR_PALETTE)) {
    if (name === 'off') continue
    const regex = new RegExp(`(^|\\s|[^a-z0-9])${name.replace(/\s+/g, '\\s+')}($|\\s|[^a-z0-9])`, 'i')
    if (regex.test(cleaned)) {
      return { ...color }
    }
  }

  return null
}

/**
 * Validates whether a device exists and supports the requested capability/action.
 *
 * @param {string} device
 * @param {string} action - 'ON', 'OFF', 'SET_COLOR'
 * @param {string} [capability='power'] - 'power' or 'rgb'
 * @returns {{ valid: boolean, error?: string, capability: string, deviceDef?: Object }}
 */
function validateDeviceCapability(device, action, capability) {
  const devKey = String(device || '').trim().toLowerCase()
  const actUpper = String(action || '').trim().toUpperCase()

  const devDef = DEVICE_CAPABILITIES[devKey]
  if (!devDef) {
    return {
      valid: false,
      error: `Device "${device}" is unsupported. Supported devices: ${Object.keys(DEVICE_CAPABILITIES).join(', ')}.`,
      capability: 'unknown',
    }
  }

  // Infer capability if not specified
  const effectiveCapability = capability
    ? String(capability).trim().toLowerCase()
    : actUpper === 'SET_COLOR'
    ? 'rgb'
    : 'power'

  if (!devDef.capabilities.includes(effectiveCapability)) {
    return {
      valid: false,
      error: `Device "${devDef.name}" does not support "${effectiveCapability}" capability. Supported capabilities: ${devDef.capabilities.join(', ')}.`,
      capability: effectiveCapability,
      deviceDef: devDef,
    }
  }

  if (!devDef.actions.includes(actUpper)) {
    return {
      valid: false,
      error: `Action "${actUpper}" is not supported for "${devDef.name}". Supported actions: ${devDef.actions.join(', ')}.`,
      capability: effectiveCapability,
      deviceDef: devDef,
    }
  }

  return {
    valid: true,
    capability: effectiveCapability,
    deviceDef: devDef,
  }
}

/**
 * Returns a bulleted list of current device capabilities for AI system instructions.
 * Makes the architecture extensible for future appliances (e.g. AC, Smart Board).
 *
 * @returns {string}
 */
function formatCapabilitiesForPrompt(registry = DEVICE_CAPABILITIES) {
  const items = Array.isArray(registry)
    ? registry
    : Object.values(registry)

  return items
    .map((dev) => {
      const name = dev.name || (dev.device ? dev.device.toUpperCase() : 'Device')
      const caps = (dev.capabilities || []).join(', ')
      const acts = dev.actions && dev.actions.length > 0 ? `Actions: ${dev.actions.join('/')}. ` : ''
      return `- ${dev.device} (${name}): capabilities = [${caps}]. ${acts}${dev.description || ''}`.trim()
    })
    .join('\n')
}

/**
 * Checks whether a given device supports a specified capability.
 *
 * @param {string} device
 * @param {string} capability
 * @returns {boolean}
 */
function isCapabilitySupported(device, capability) {
  const devKey = String(device || '').trim().toLowerCase()
  const capKey = String(capability || '').trim().toLowerCase()
  const def = DEVICE_CAPABILITIES[devKey]
  return Boolean(def && def.capabilities.includes(capKey))
}

module.exports = {
  DEVICE_CAPABILITIES,
  COLOR_PALETTE,
  resolveRgbColor,
  validateDeviceCapability,
  formatCapabilitiesForPrompt,
  isCapabilitySupported,
}
