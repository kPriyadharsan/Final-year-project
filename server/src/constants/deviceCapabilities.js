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
  gold: { r: 255, g: 215, b: 0, hex: '#FFD700', name: 'gold' },
  golden: { r: 255, g: 215, b: 0, hex: '#FFD700', name: 'golden' },
  teal: { r: 20, g: 184, b: 166, hex: '#14B8A6', name: 'teal' },
  indigo: { r: 99, g: 102, b: 241, hex: '#6366F1', name: 'indigo' },
  turquoise: { r: 64, g: 224, b: 208, hex: '#40E0D0', name: 'turquoise' },
  aqua: { r: 0, g: 255, b: 255, hex: '#00FFFF', name: 'aqua' },
  crimson: { r: 220, g: 20, b: 60, hex: '#DC143C', name: 'crimson' },
  scarlet: { r: 255, g: 36, b: 0, hex: '#FF2400', name: 'scarlet' },
  maroon: { r: 128, g: 0, b: 0, hex: '#800000', name: 'maroon' },
  navy: { r: 0, g: 0, b: 128, hex: '#000080', name: 'navy' },
  'navy blue': { r: 0, g: 0, b: 128, hex: '#000080', name: 'navy blue' },
  navyblue: { r: 0, g: 0, b: 128, hex: '#000080', name: 'navy blue' },
  'royal blue': { r: 65, g: 105, b: 225, hex: '#4169E1', name: 'royal blue' },
  royalblue: { r: 65, g: 105, b: 225, hex: '#4169E1', name: 'royal blue' },
  'deep blue': { r: 0, g: 10, b: 180, hex: '#000AB4', name: 'deep blue' },
  'baby blue': { r: 137, g: 207, b: 240, hex: '#89CFF0', name: 'baby blue' },
  'ice blue': { r: 175, g: 238, b: 238, hex: '#AFEEEE', name: 'ice blue' },
  lavender: { r: 196, g: 181, b: 253, hex: '#C4B5FD', name: 'lavender' },
  lilac: { r: 200, g: 162, b: 200, hex: '#C8A2C8', name: 'lilac' },
  plum: { r: 221, g: 160, b: 221, hex: '#DDA0DD', name: 'plum' },
  coral: { r: 251, g: 113, b: 133, hex: '#FB7185', name: 'coral' },
  peach: { r: 255, g: 218, b: 185, hex: '#FFDAB9', name: 'peach' },
  salmon: { r: 250, g: 128, b: 114, hex: '#FA8072', name: 'salmon' },
  rose: { r: 244, g: 63, b: 94, hex: '#F43F5E', name: 'rose' },
  ruby: { r: 224, g: 17, b: 95, hex: '#E0115F', name: 'ruby' },
  emerald: { r: 16, g: 185, b: 129, hex: '#10B981', name: 'emerald' },
  mint: { r: 110, g: 231, b: 183, hex: '#6EE7B7', name: 'mint' },
  'mint green': { r: 110, g: 231, b: 183, hex: '#6EE7B7', name: 'mint green' },
  mintgreen: { r: 110, g: 231, b: 183, hex: '#6EE7B7', name: 'mint green' },
  'forest green': { r: 34, g: 139, b: 34, hex: '#228B22', name: 'forest green' },
  forestgreen: { r: 34, g: 139, b: 34, hex: '#228B22', name: 'forest green' },
  olive: { r: 128, g: 128, b: 0, hex: '#808000', name: 'olive' },
  jade: { r: 0, g: 168, b: 107, hex: '#00A86B', name: 'jade' },
  aquamarine: { r: 127, g: 255, b: 212, hex: '#7FFFD4', name: 'aquamarine' },
  seafoam: { r: 159, g: 226, b: 191, hex: '#9FE2BF', name: 'seafoam' },
  sapphire: { r: 15, g: 82, b: 186, hex: '#0F52BA', name: 'sapphire' },
  'hot pink': { r: 255, g: 20, b: 147, hex: '#FF1493', name: 'hot pink' },
  hotpink: { r: 255, g: 20, b: 147, hex: '#FF1493', name: 'hot pink' },
  sunset: { r: 253, g: 94, b: 83, hex: '#FD5E53', name: 'sunset' },
  bronze: { r: 205, g: 127, b: 50, hex: '#CD7F32', name: 'bronze' },
  copper: { r: 184, g: 115, b: 51, hex: '#B87333', name: 'copper' },
  silver: { r: 192, g: 192, b: 192, hex: '#C0C0C0', name: 'silver' },
  fuchsia: { r: 217, g: 70, b: 239, hex: '#D946EF', name: 'fuchsia' },
  'neon green': { r: 57, g: 255, b: 20, hex: '#39FF14', name: 'neon green' },
  'neon blue': { r: 77, g: 77, b: 255, hex: '#4D4DFF', name: 'neon blue' },
  'dark red': { r: 139, g: 0, b: 0, hex: '#8B0000', name: 'dark red' },
  'dark blue': { r: 0, g: 0, b: 139, hex: '#00008B', name: 'dark blue' },
  'dark green': { r: 0, g: 100, b: 0, hex: '#006400', name: 'dark green' },
  'dark purple': { r: 88, g: 28, b: 135, hex: '#581C87', name: 'dark purple' },
  'light blue': { r: 186, g: 230, b: 253, hex: '#BAE6FD', name: 'light blue' },
  'light green': { r: 187, g: 247, b: 208, hex: '#BBF7D0', name: 'light green' },
  'light pink': { r: 251, g: 207, b: 232, hex: '#FBCFE8', name: 'light pink' },
  'light purple': { r: 233, g: 213, b: 255, hex: '#E9D5FF', name: 'light purple' },
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
