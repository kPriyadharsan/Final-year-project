const { Type } = require('@google/genai')
const geminiService = require('./gemini.service')

// Strict Backend Allowlists (Never execute arbitrary or unvalidated AI commands)
const SUPPORTED_DEVICES = Object.freeze(['light', 'fan', 'projector'])
const SUPPORTED_ACTIONS = Object.freeze(['ON', 'OFF', 'SET_COLOR'])
const SUPPORTED_INTENTS = Object.freeze([
  'DEVICE_CONTROL',
  'CREATE_NOTE',
  'CREATE_QUIZ',
  'CREATE_IMAGE',
  'CREATE_PPT',
  'UNKNOWN',
])

// Device synonym/plural normalization mapping
const DEVICE_NORMALIZATION_MAP = {
  light: 'light',
  lights: 'light',
  lamp: 'light',
  lamps: 'light',
  bulb: 'light',
  lightbulb: 'light',
  tube: 'light',
  tubelight: 'light',

  fan: 'fan',
  fans: 'fan',
  ceilingfan: 'fan',
  'ceiling fan': 'fan',

  projector: 'projector',
  projectors: 'projector',
  screen: 'projector',
  display: 'projector',
  beamer: 'projector',
}

// Action normalization mapping
const ACTION_NORMALIZATION_MAP = {
  on: 'ON',
  start: 'ON',
  activate: 'ON',
  enable: 'ON',
  switchon: 'ON',
  'switch on': 'ON',
  'turn on': 'ON',

  off: 'OFF',
  stop: 'OFF',
  deactivate: 'OFF',
  disable: 'OFF',
  switchoff: 'OFF',
  'switch off': 'OFF',
  'turn off': 'OFF',
  kill: 'OFF',

  'set color': 'SET_COLOR',
  setcolor: 'SET_COLOR',
  color: 'SET_COLOR',
  glow: 'SET_COLOR',
}

// Structured Output Schema for Google Gemini SDK (@google/genai)
const classroomCommandSchema = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: [
        'DEVICE_CONTROL',
        'CREATE_NOTE',
        'CREATE_QUIZ',
        'CREATE_IMAGE',
        'CREATE_PPT',
        'UNKNOWN',
      ],
      description: 'The classified user intent',
    },
    device: {
      type: Type.STRING,
      description: 'Target device: "light", "fan", or "projector". Null or empty string if not a device command.',
    },
    action: {
      type: Type.STRING,
      description: 'Target action: "ON", "OFF", or "SET_COLOR". Null or empty string if not a device command.',
    },
    color: {
      type: Type.STRING,
      description: 'Color name (e.g. purple, cyan, red, blue, green, yellow, pink, white) if setting RGB color.',
    },
    confidence: {
      type: Type.NUMBER,
      description: 'Confidence score between 0.0 and 1.0',
    },
  },
  required: ['intent', 'confidence'],
}

const SYSTEM_INSTRUCTION = `
You are an intelligent natural language command parser for an educational Smart Classroom system.
Your job is to analyze the user's spoken or typed prompt and extract structured intent, device, action, color, and confidence.

Supported Intents:
1. DEVICE_CONTROL: Commands to control classroom appliances.
   - Supported devices ONLY: "light", "fan", "projector".
   - Supported actions ONLY: "ON", "OFF", "SET_COLOR".
   - Projector RGB color: commands like "make the light purple", "glow the light purple", "make it blue", "set the RGB to red", "give me a cyan glow", "make the projector LED purple" map to device: "projector", action: "SET_COLOR", with the extracted color name.
   - If user asks to control an unsupported device (e.g. "turn on AC", "open window", "play music", "turn on TV"), intent MUST be "UNKNOWN" and device/action must be null.
2. CREATE_NOTE: User wants to generate study notes, summaries, or classroom study materials.
3. CREATE_QUIZ: User wants to generate quizzes, test questions, or MCQs.
4. CREATE_IMAGE: User wants to generate educational diagrams, illustrations, or charts.
5. CREATE_PPT: User wants to generate presentation slides or PPT outlines.
6. UNKNOWN: Any chit-chat, unsupported device, vague request, or out-of-scope command.

Rules:
- Output strictly according to the JSON schema.
- For non-DEVICE_CONTROL intents, device, action, and color must be null.
- Confidence must be a decimal between 0.0 and 1.0 (e.g. 0.95).
`.trim()

/**
 * Normalizes device string and verifies against strict backend allowlist
 *
 * @param {string} rawDevice
 * @returns {string|null} Normalized device name or null if not supported
 */
function normalizeDevice(rawDevice) {
  if (!rawDevice || typeof rawDevice !== 'string') return null
  const cleaned = rawDevice.trim().toLowerCase()
  const mapped = DEVICE_NORMALIZATION_MAP[cleaned] || cleaned
  return SUPPORTED_DEVICES.includes(mapped) ? mapped : null
}

/**
 * Normalizes action string and verifies against strict backend allowlist
 *
 * @param {string} rawAction
 * @returns {'ON'|'OFF'|null} Normalized action or null if not supported
 */
function normalizeAction(rawAction) {
  if (!rawAction || typeof rawAction !== 'string') return null
  const cleaned = rawAction.trim().toLowerCase()
  const mapped = ACTION_NORMALIZATION_MAP[cleaned] || cleaned.toUpperCase()
  return SUPPORTED_ACTIONS.includes(mapped) ? mapped : null
}

/**
 * Validates and sanitizes AI output against strict backend allowlists.
 * Guarantees that arbitrary AI outputs are never accepted.
 *
 * @param {Object} rawParsed - The raw object parsed from AI
 * @param {string} originalInput - The original user text input
 * @returns {{ intent: string, device: string|null, action: string|null, confidence: number, rawInput: string, isValid: boolean, reason?: string }}
 */
function validateAndSanitize(rawParsed, originalInput) {
  if (!rawParsed || typeof rawParsed !== 'object') {
    return {
      intent: 'UNKNOWN',
      device: null,
      action: null,
      confidence: 0.0,
      rawInput: originalInput,
      isValid: false,
      reason: 'Malformed or non-object response from AI model',
    }
  }

  const rawIntent = String(rawParsed.intent || '').trim().toUpperCase()
  const rawConfidence = typeof rawParsed.confidence === 'number' && !isNaN(rawParsed.confidence)
    ? Math.min(1.0, Math.max(0.0, Number(rawParsed.confidence.toFixed(2))))
    : 0.0

  // 1. Verify intent is in supported allowlist
  if (!SUPPORTED_INTENTS.includes(rawIntent)) {
    return {
      intent: 'UNKNOWN',
      device: null,
      action: null,
      confidence: rawConfidence,
      rawInput: originalInput,
      isValid: false,
      reason: `Unrecognized intent "${rawIntent}" rejected by backend allowlist`,
    }
  }

  // 2. Handle DEVICE_CONTROL intent
  if (rawIntent === 'DEVICE_CONTROL') {
    const validatedDevice = normalizeDevice(rawParsed.device)
    const validatedAction = normalizeAction(rawParsed.action)

    // Strict validation: BOTH device and action must be valid and in allowlists
    if (!validatedDevice || !validatedAction) {
      const failedReason = !validatedDevice
        ? `Device "${rawParsed.device}" is not in supported allowlist [${SUPPORTED_DEVICES.join(', ')}]`
        : `Action "${rawParsed.action}" is not in supported allowlist [${SUPPORTED_ACTIONS.join(', ')}]`

      console.warn(`[CommandParser] ⚠️ Rejected DEVICE_CONTROL: ${failedReason}`)
      return {
        intent: 'UNKNOWN',
        device: null,
        action: null,
        confidence: 0.0,
        rawInput: originalInput,
        isValid: false,
        reason: failedReason,
      }
    }

    let resolvedColor = null
    if (validatedAction === 'SET_COLOR') {
      const { resolveRgbColor, COLOR_PALETTE } = require('../constants/deviceCapabilities')
      resolvedColor = resolveRgbColor(rawParsed.color || 'purple') || COLOR_PALETTE.purple
    }

    return {
      intent: 'DEVICE_CONTROL',
      device: validatedDevice,
      action: validatedAction,
      color: resolvedColor,
      confidence: rawConfidence || 0.95,
      rawInput: originalInput,
      isValid: true,
    }
  }

  // 3. Handle Other Supported Intents (CREATE_NOTE, CREATE_QUIZ, CREATE_IMAGE, CREATE_PPT)
  if (rawIntent !== 'UNKNOWN') {
    return {
      intent: rawIntent,
      device: null,
      action: null,
      confidence: rawConfidence || 0.9,
      rawInput: originalInput,
      isValid: true,
    }
  }

  // 4. Default UNKNOWN
  return {
    intent: 'UNKNOWN',
    device: null,
    action: null,
    confidence: rawConfidence,
    rawInput: originalInput,
    isValid: false,
    reason: 'Unsupported or unclassified command',
  }
}

/**
 * Deterministic rule-based fallback parser for development/offline environments
 *
 * @param {string} text
 * @returns {Object}
 */
function parseWithRuleFallback(text) {
  const lower = text.toLowerCase()

  // Check for device control intent
  const hasOn = /\b(turn\s+on|switch\s+on|power\s+on|start|activate|enable)\b/i.test(lower)
  const hasOff = /\b(turn\s+off|switch\s+off|power\s+off|stop|deactivate|disable|shutdown)\b/i.test(lower)

  let detectedDevice = null
  if (/\b(light|lights|lamp|lamps|bulb)\b/i.test(lower)) detectedDevice = 'light'
  else if (/\b(fan|fans|ceiling\s+fan)\b/i.test(lower)) detectedDevice = 'fan'
  else if (/\b(projector|projectors|screen|beamer)\b/i.test(lower)) detectedDevice = 'projector'

  // If user asked to control an unsupported device (e.g. AC, TV, heater)
  const isUnsupportedDevice = /\b(ac|air\s+conditioner|tv|television|computer|speaker|door|window)\b/i.test(lower)

  if (isUnsupportedDevice) {
    return {
      intent: 'UNKNOWN',
      device: null,
      action: null,
      confidence: 0.0,
      rawInput: text,
      isValid: false,
      reason: 'Device is not in classroom allowlist [light, fan, projector]',
      source: 'heuristic_fallback',
    }
  }

  if (detectedDevice && (hasOn || hasOff)) {
    const action = hasOn ? 'ON' : 'OFF'
    return {
      intent: 'DEVICE_CONTROL',
      device: detectedDevice,
      action,
      confidence: 0.95,
      rawInput: text,
      isValid: true,
      source: 'heuristic_fallback',
    }
  }

  // Check other classroom intents
  if (/\b(note|notes|summary|summarize|lecture\s+notes)\b/i.test(lower)) {
    return {
      intent: 'CREATE_NOTE',
      device: null,
      action: null,
      confidence: 0.9,
      rawInput: text,
      isValid: true,
      source: 'heuristic_fallback',
    }
  }

  if (/\b(quiz|mcq|test|questions|exam)\b/i.test(lower)) {
    return {
      intent: 'CREATE_QUIZ',
      device: null,
      action: null,
      confidence: 0.9,
      rawInput: text,
      isValid: true,
      source: 'heuristic_fallback',
    }
  }

  if (/\b(image|diagram|chart|picture|illustration|draw)\b/i.test(lower)) {
    return {
      intent: 'CREATE_IMAGE',
      device: null,
      action: null,
      confidence: 0.9,
      rawInput: text,
      isValid: true,
      source: 'heuristic_fallback',
    }
  }

  if (/\b(ppt|presentation|slides|powerpoint|slide\s+deck)\b/i.test(lower)) {
    return {
      intent: 'CREATE_PPT',
      device: null,
      action: null,
      confidence: 0.9,
      rawInput: text,
      isValid: true,
      source: 'heuristic_fallback',
    }
  }

  return {
    intent: 'UNKNOWN',
    device: null,
    action: null,
    confidence: 0.0,
    rawInput: text,
    isValid: false,
    reason: 'No matching classroom command or action detected',
    source: 'heuristic_fallback',
  }
}

/**
 * Main parser entry point: Uses Google Gemini with structured output schema,
 * validated against strict backend allowlists with graceful fallback.
 *
 * @param {string} text - User command prompt (e.g. "Please turn on the fan.")
 * @param {Object} [options]
 * @returns {Promise<{ intent: string, device: string|null, action: string|null, confidence: number, rawInput: string, isValid: boolean, source: string }>}
 */
async function parseClassroomCommand(text, options = {}) {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    const err = new Error('A valid, non-empty command string is required.')
    err.status = 400
    err.code = 'INVALID_COMMAND'
    throw err
  }

  const sanitizedText = text.trim()
  console.log(`[CommandParser] 🎙️ Parsing command: "${sanitizedText}"`)

  // 1. Instant Fast-Path: If text clearly matches standard classroom device commands, execute in <1ms without cloud LLM round-trip!
  const ruleResult = parseWithRuleFallback(sanitizedText)
  if (ruleResult.isValid && ruleResult.intent === 'DEVICE_CONTROL' && ruleResult.device && ruleResult.action) {
    console.log(`[CommandParser] ⚡ Fast-path matched in <1ms: ${ruleResult.device} -> ${ruleResult.action}`)
    ruleResult.source = 'fast_path'
    return ruleResult
  }

  // Attempt to call Google Gemini using structured schema
  try {
    const client = geminiService.getClient()
    const targetModel = options.model || geminiService.getDefaultModel()

    const geminiCall = client.models.generateContent({
      model: targetModel,
      contents: sanitizedText,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: classroomCommandSchema,
        temperature: 0.1, // low temperature for precise classification
      },
    })

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API call timed out after 8000ms')), 8000)
    )

    const response = await Promise.race([geminiCall, timeoutPromise])

    const rawText = response.text || '{}'
    aiRawResult = JSON.parse(rawText)
    console.log(`[CommandParser] 🤖 Gemini structured output:`, aiRawResult)
  } catch (error) {
    console.warn(`[CommandParser] ⚠️ Gemini API note (${error.message}). Engaging rule-based allowlist fallback.`)
    // Use rule-based fallback in dev / offline mode
    const fallbackResult = parseWithRuleFallback(sanitizedText)
    return fallbackResult
  }

  // Validate and sanitize the AI response against strict backend allowlists
  const sanitized = validateAndSanitize(aiRawResult, sanitizedText)
  sanitized.source = parseSource

  console.log(`[CommandParser] 🛡️ Backend validated result: intent=${sanitized.intent}, device=${sanitized.device}, action=${sanitized.action}, isValid=${sanitized.isValid}`)

  return sanitized
}

module.exports = {
  parseClassroomCommand,
  validateAndSanitize,
  parseWithRuleFallback,
  normalizeDevice,
  normalizeAction,
  SUPPORTED_DEVICES,
  SUPPORTED_ACTIONS,
  SUPPORTED_INTENTS,
  classroomCommandSchema,
}
