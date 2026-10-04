const { GoogleGenAI, Type } = require('@google/genai')
const env = require('../config/env')

// Configurable default model; can be overridden via GEMINI_MODEL env var or per-request
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.7-flash'

let aiClient = null
let lastConfiguredKey = null

/**
 * Safely masks an API key string for logging (e.g. "AIza...4xyz")
 *
 * @param {string} key
 * @returns {string}
 */
function maskApiKey(key) {
  if (!key || typeof key !== 'string') return 'none'
  if (key.length <= 8) return '****'
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

/**
 * Checks whether GEMINI_API_KEY is configured with a plausible key
 *
 * @returns {boolean}
 */
function isConfigured() {
  const key = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY
  return !!(key && key.trim() !== '' && !key.includes('REPLACE_WITH_YOUR_KEY'))
}

/**
 * Returns current default model name
 *
 * @returns {string}
 */
function getDefaultModel() {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL
}

/**
 * Returns or initializes the GoogleGenAI client singleton
 *
 * @returns {GoogleGenAI}
 */
function getClient() {
  const currentKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY

  if (!currentKey || currentKey.trim() === '') {
    throw new Error('GEMINI_API_KEY is not configured in environment variables.')
  }

  // Re-instantiate if the key was updated at runtime
  if (!aiClient || lastConfiguredKey !== currentKey) {
    aiClient = new GoogleGenAI({ apiKey: currentKey.trim() })
    lastConfiguredKey = currentKey
    console.log(`[Gemini AI] 🔑 Initialized Google Gen AI client with key [${maskApiKey(currentKey)}]`)
  }

  return aiClient
}

/**
 * Parses raw error messages returned by @google/genai or Google API
 * and returns structured, user-safe diagnostics without leaking sensitive data
 *
 * @param {Error} error
 * @returns {{ code: string, message: string, status: number, hint?: string }}
 */
function parseGeminiError(error) {
  const rawMessage = error.message || ''

  // Attempt to parse JSON error from Google API
  let parsedJson = null
  try {
    parsedJson = JSON.parse(rawMessage)
  } catch {
    // Message might contain a JSON substring
    const match = rawMessage.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        parsedJson = JSON.parse(match[0])
      } catch {
        // Ignore fallback
      }
    }
  }

  const googleError = parsedJson?.error || {}
  const googleReason = googleError?.details?.[0]?.reason || ''
  const googleCode = googleError?.code || error.status

  // 1. Invalid API key error
  if (
    googleReason === 'API_KEY_INVALID' ||
    rawMessage.includes('API key not valid') ||
    rawMessage.includes('API_KEY_INVALID')
  ) {
    return {
      status: 400,
      code: 'GEMINI_API_KEY_INVALID',
      message: 'The configured Google Gemini API key is invalid or unrecognized by Google AI Studio.',
      hint: 'Generate and configure a valid Gemini API key at https://aistudio.google.com/app/apikey in server/.env',
    }
  }

  // 2. Quota / Rate limit error
  if (
    googleReason === 'RESOURCE_EXHAUSTED' ||
    googleCode === 429 ||
    rawMessage.includes('429') ||
    rawMessage.includes('RESOURCE_EXHAUSTED')
  ) {
    return {
      status: 429,
      code: 'GEMINI_RATE_LIMIT_EXCEEDED',
      message: 'Google Gemini API rate limit or quota exceeded. Please wait a moment and try again.',
      hint: 'Check your project quota limits on Google AI Studio.',
    }
  }

  // 3. Model not found
  if (googleCode === 404 || rawMessage.includes('not found') || rawMessage.includes('is not supported')) {
    return {
      status: 404,
      code: 'GEMINI_MODEL_NOT_FOUND',
      message: 'The requested Gemini model was not found or is unavailable for this API key.',
      hint: 'Verify the model name (e.g. "gemini-2.5-flash" or "gemini-2.0-flash").',
    }
  }

  // 4. Content blocked by safety filters
  if (rawMessage.includes('SAFETY') || rawMessage.includes('blocked')) {
    return {
      status: 400,
      code: 'GEMINI_CONTENT_BLOCKED',
      message: 'The generation request was blocked by Gemini safety filters.',
      hint: 'Ensure prompt complies with safety guidelines.',
    }
  }

  // Generic fallback error
  return {
    status: typeof googleCode === 'number' && googleCode >= 400 && googleCode < 600 ? googleCode : 502,
    code: 'GEMINI_REQUEST_FAILED',
    message: googleError?.message || error.message || 'Failed to generate response from Google Gemini AI.',
    hint: 'Check server logs for detailed diagnostics.',
  }
}

/**
 * Core text generation function using modern @google/genai SDK
 *
 * @param {string} prompt - Input text prompt
 * @param {Object} [options] - Generation options
 * @param {string} [options.model] - Specific Gemini model override
 * @param {string} [options.systemInstruction] - System instruction / persona
 * @param {number} [options.temperature] - Sampling temperature (0.0 - 2.0)
 * @param {number} [options.maxOutputTokens] - Maximum tokens to generate
 * @returns {Promise<{ text: string, model: string, durationMs: number, usage?: Object }>}
 */
async function generateText(prompt, options = {}) {
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    const err = new Error('A valid, non-empty text prompt string is required.')
    err.status = 400
    err.code = 'INVALID_PROMPT'
    throw err
  }

  const model = options.model || getDefaultModel()
  const sanitizedPrompt = prompt.trim()
  const startTime = Date.now()

  // Safe server-side logging without exposing API key
  const promptSnippet = sanitizedPrompt.length > 80 ? `${sanitizedPrompt.slice(0, 80)}...` : sanitizedPrompt
  console.log(`[Gemini AI] 🤖 Requesting generation: model="${model}", promptLength=${sanitizedPrompt.length} chars`)
  console.log(`[Gemini AI] 📝 Prompt preview: "${promptSnippet.replace(/\n/g, ' ')}"`)

  try {
    const ai = getClient()

    // Build configuration object
    const config = {}
    if (options.systemInstruction) {
      config.systemInstruction = options.systemInstruction
    }
    if (typeof options.temperature === 'number') {
      config.temperature = options.temperature
    }
    if (typeof options.maxOutputTokens === 'number') {
      config.maxOutputTokens = options.maxOutputTokens
    }

    const requestPayload = {
      model,
      contents: sanitizedPrompt,
      ...(Object.keys(config).length > 0 ? { config } : {}),
    }

    // Call @google/genai SDK
    const response = await ai.models.generateContent(requestPayload)
    const durationMs = Date.now() - startTime

    // Extract generated text
    const generatedText = response.text || ''

    console.log(`[Gemini AI] ✅ Generation completed in ${durationMs}ms (Response length: ${generatedText.length} chars)`)

    return {
      text: generatedText,
      model,
      durationMs,
      usage: response.usageMetadata
        ? {
            promptTokenCount: response.usageMetadata.promptTokenCount,
            candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
            totalTokenCount: response.usageMetadata.totalTokenCount,
          }
        : undefined,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const parsed = parseGeminiError(error)

    console.error(`[Gemini AI] ❌ Generation failed after ${durationMs}ms [${parsed.code}]: ${parsed.message}`)

    const customError = new Error(parsed.message)
    customError.status = parsed.status
    customError.code = parsed.code
    customError.hint = parsed.hint
    customError.durationMs = durationMs
    throw customError
  }
}

// Live API preview model for real-time bidirectional audio sessions
const DEFAULT_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025'

const { formatCapabilitiesForPrompt, COLOR_PALETTE } = require('../constants/deviceCapabilities')

// Standard Tool Declaration for controlling classroom appliances power
const CONTROL_CLASSROOM_DEVICES_TOOL = {
  functionDeclarations: [
    {
      name: 'control_classroom_devices',
      description: 'Control one or more smart classroom appliances (light, fan, projector) to turn them ON or OFF.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          actions: {
            type: Type.ARRAY,
            description: 'List of device power control actions to execute',
            items: {
              type: Type.OBJECT,
              properties: {
                device: {
                  type: Type.STRING,
                  enum: ['light', 'fan', 'projector'],
                  description: 'The target appliance to control',
                },
                action: {
                  type: Type.STRING,
                  enum: ['ON', 'OFF'],
                  description: 'The target power state: ON or OFF',
                },
              },
              required: ['device', 'action'],
            },
          },
        },
        required: ['actions'],
      },
    },
  ],
}

// Dedicated Tool Declaration for controlling projector ambient RGB LED
const SET_CLASSROOM_RGB_TOOL = {
  functionDeclarations: [
    {
      name: 'set_classroom_rgb',
      description: 'Set the RGB LED color or power state of an RGB-capable classroom appliance (specifically the projector ambient RGB LED).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          device: {
            type: Type.STRING,
            description: 'The target appliance with RGB lighting capability (must be "projector").',
          },
          color: {
            type: Type.OBJECT,
            properties: {
              name: {
                type: Type.STRING,
                description: 'Color name (e.g. "purple", "red", "green", "blue", "yellow", "orange", "pink", "cyan", "white", "warm white") or hexadecimal code (e.g. "#FF00FF").',
              },
            },
            description: 'The RGB color object with the color name or hex code.',
          },
          colorName: {
            type: Type.STRING,
            description: 'Direct color name or hex code if not inside color object.',
          },
          power: {
            type: Type.STRING,
            enum: ['ON', 'OFF'],
            description: 'RGB LED power state. Use "OFF" to turn off the RGB light.',
          },
        },
        required: ['device'],
      },
    },
  ],
}

// Authoritative State Tool Declaration for inspecting real-time device hardware state
const GET_CLASSROOM_DEVICE_STATE_TOOL = {
  functionDeclarations: [
    {
      name: 'get_classroom_device_state',
      description: 'Query the authoritative, real-time hardware status of one or all smart classroom devices (light, fan, projector). Use this tool whenever the user asks about device status or condition (e.g. "Is the fan on?", "Is the projector running?", "What is currently on?", "Which devices are off?", "What color is the projector?").',
      parameters: {
        type: Type.OBJECT,
        properties: {
          device: {
            type: Type.STRING,
            enum: ['light', 'fan', 'projector', 'all'],
            description: 'The target appliance to inspect, or "all" to inspect all classroom appliances.',
          },
        },
      },
    },
  ],
}

/**
 * Builds the centralized, classroom-aware system instruction.
 * Single source of truth across backend and frontend for the conversational assistant.
 *
 * @param {Object} [options]
 * @param {string} [options.classroom='Room 302']
 * @param {Object} [options.deviceStates] - Current confirmed state snapshot of classroom appliances
 * @returns {string}
 */
function buildClassroomSystemInstruction(options = {}) {
  const classroom = options.classroom || 'Room 302'
  const states = options.deviceStates || {}

  const stateLines = []
  if (states.light) stateLines.push(`- Light: ${states.light}`)
  if (states.fan) stateLines.push(`- Fan: ${states.fan}`)
  if (states.projector) stateLines.push(`- Projector: ${states.projector}${states.projectorRgb ? ` (RGB: ${states.projectorRgb})` : ''}`)

  const stateSummary = stateLines.length > 0
    ? stateLines.join('\n')
    : `- Light: Available (Relay channel GPIO 23)\n- Fan: Available (Relay channel GPIO 22)\n- Projector: Available (Master Relay GPIO 21, RGB PWM GPIO 25, 27, 32)`

  return `You are the voice assistant for a smart classroom (${classroom}).

AVAILABLE APPLIANCES & HARDWARE CAPABILITIES:
${formatCapabilitiesForPrompt()}

LATEST CONFIRMED HARDWARE STATE:
${stateSummary}

SINGLE SOURCE OF TRUTH & STATE ARCHITECTURE:
- The actual hardware/database state from the backend and ESP32 telemetry is the SINGLE SOURCE OF TRUTH.
- Conversation memory is NOT authoritative. If conversation memory says a device was turned on, but backend hardware telemetry says it is OFF, the backend telemetry wins.
- When the user asks about the state or condition of classroom devices ("Is the fan on?", "Is the projector running?", "What is currently on?", "Which devices are off?", "What color is the projector?", "What is the classroom status?"):
  -> Use get_classroom_device_state(device: "fan"|"light"|"projector"|"all") to query the live authoritative hardware state, or answer from the confirmed hardware state snapshot.
- Stale or unavailable hardware state:
  -> If a device is reported as offline, stale, or unavailable: respond truthfully: "I'm not getting the latest status from the classroom controller." Do not hallucinate.

AVOID UNNECESSARY COMMANDS (STATE-AWARE CONTROL):
- Before executing a single device power toggle, check the device's current state:
  * If the user says "Turn on the fan" and the fan is already ON:
    -> Do NOT send a control command. Respond: "The fan is already on."
  * If the user says "Turn off the light" and the light is already OFF:
    -> Do NOT send a control command. Respond: "The light is already off."
- For bulk commands (e.g. "Turn everything off" or "Turn everything on"):
  * Call control_classroom_devices with all three devices (light, fan, projector) to ensure all devices are set to OFF (or ON); the backend safely filters any redundant actions.

RGB STATE AWARENESS:
- Projector RGB state query:
  * User: "What color is the projector light?" -> Answer based on actual RGB state (e.g. "It's purple.").
- Context + State Resolution:
  * User: "Turn on the projector." -> Assistant: "Projector is on."
  * User: "Make it purple." -> "it" refers to projector; hardware confirms projector is ON -> call set_classroom_rgb(device: "projector", color: { name: "purple" }).

INTENT CLASSIFICATION:
Before responding, conceptually classify the user's intent:
1. CONTROL: User wants to alter physical device state (e.g. "Turn on the projector", "Make it purple", "Turn everything off").
   -> Call the appropriate tool:
      - "control_classroom_devices" for power switching (ON/OFF)
      - "set_classroom_rgb" for projector RGB LED lighting
2. QUERY: User asks about device status or classroom capabilities (e.g. "Is the fan on?", "What can you control?", "Which device has RGB?").
   -> Inspect the latest confirmed hardware state via get_classroom_device_state or confirmed snapshot and answer conversationally.
3. CONVERSATION: General dialogue or teaching interaction (e.g. "Tell me something about today's class", "Hello").
   -> Respond helpfully and conversationally without calling tools.
4. UNSUPPORTED: User asks for a capability that the hardware does not possess (e.g. "Increase fan speed", "Make the fan purple", "Set projector brightness to 20%").
   -> Explain politely and concisely that the device does not have that capability. DO NOT call any tool.
5. AMBIGUOUS: User uses a pronoun or relative command without any prior context (e.g. "Make it blue" when no device was previously discussed).
   -> Ask one brief clarification (e.g. "Which device do you want me to make purple?").

CONVERSATIONAL CONTEXT & PRONOUN RESOLUTION:
Maintain recent context across conversation turns:
- Track: last mentioned device, last controlled device, last RGB-capable device, last requested color, and latest known state.
- Resolve pronouns ("it", "that", "this", "the device", "the light", "that light", "the same one"):
  * User: "Turn on the projector." -> Assistant: "Projector is on."
  * User: "Make it purple." -> "it" refers to the projector RGB LED. Call set_classroom_rgb(device: "projector", color: { name: "purple" }).
  * User: "Make that blue." -> "that" refers to the projector RGB LED. Call set_classroom_rgb(device: "projector", color: { name: "blue" }).
  * User: "Turn it off." -> "it" refers to the projector master power. Call control_classroom_devices(actions: [{ device: "projector", action: "OFF" }]).
  * User: "Turn on the fan." -> Assistant: "Fan is on." -> User: "Actually, turn it off." -> "it" refers to the fan. Call control_classroom_devices(actions: [{ device: "fan", action: "OFF" }]).

COMBINED COMMANDS:
- User: "Turn on the projector and fan." -> Call control_classroom_devices with both devices.
- User: "Turn on the projector and make the light purple." -> Invoke both power ON and RGB purple.

RGB OFF BEHAVIOR:
- User: "Turn off the purple light."
  If conversational context indicates the user means the RGB LED:
  -> call set_classroom_rgb(device: "projector", power: "OFF")
  If conversational context indicates the user means the projector itself:
  -> call control_classroom_devices(actions: [{ device: "projector", action: "OFF" }])
  If genuinely ambiguous, ask one short question: "Turn off the projector or just the purple light?"

FEW-SHOT CONVERSATION EXAMPLES:
- Example 1 (State Query - Fan ON):
  User: "Is the fan running?" -> Assistant: "Yes, the fan is on."
- Example 2 (Already OFF - No Command):
  Current state: fan = OFF. User: "Turn off the fan." -> Assistant: "The fan is already off."
- Example 3 (RGB State Query):
  Current state: Projector ON, RGB purple. User: "What color is the projector light?" -> Assistant: "It's purple."
- Example 4 (RGB Follow-Up):
  User: "Make it blue." -> Assistant: "Done." (Calls set_classroom_rgb)
- Example 5 (All-Device State Query):
  Current state: Light ON, Projector ON, Fan OFF. User: "What is on right now?" -> Assistant: "The light and projector are on. The fan is off."
- Example A:
  User: "Turn on the projector." -> Assistant: "Projector is on."
  User: "Make it purple." -> Assistant: "Done." (calls set_classroom_rgb)
- Example B:
  User: "Turn on the fan." -> Assistant: "Fan is on."
  User: "Actually, turn it off." -> Assistant: "Fan is off."
- Example C:
  User: "Turn on the projector and fan." -> Assistant: "Projector and fan are on."
- Example D:
  User: "Turn everything off." -> Assistant: "Everything is off."
- Example E:
  User: "What can you control?" -> Assistant: "I can control the classroom light, fan and projector. The projector also has RGB lighting." (No tool call)
- Example F:
  User: "Is the fan on?" -> Assistant: Inspects latest known state. If ON: "Yes, the fan is on." If OFF: "No, the fan is off."
- Example G:
  User: "Which device has RGB?" -> Assistant: "The projector has RGB lighting." (No tool call)
- Example H:
  User: "Make the fan purple." -> Assistant: "The fan doesn't have RGB lighting." (No tool call)
- Unsupported control:
  User: "Set fan speed to 5." -> Assistant: "Sorry, the fan doesn't support speed control." (No tool call)

EXECUTION TRUTHFULNESS & FAILURE HANDLING (ANTI-HALLUCINATION):
- TRUTHFUL EXECUTION: Never hallucinate execution! The spoken response must reflect actual backend tool results.
- If a tool call fails, truthfully report the failure: "I couldn't turn the fan off."
- If only one of multiple commands succeeds: "I turned the light on, but the fan command failed."
- Never generate MQTT topics, GPIO pins, timestamps or internal IDs. The backend is the authority for hardware execution.

RESPONSE STYLE & CONVERSATIONAL NATURALNESS:
- Speak like an attentive, helpful classroom companion, not a computer command terminal.
- Listen naturally, understand interruptions, and respond quickly.
- Keep responses ultra-short (1 to 4 words when confirming follow-ups, at most 1 short sentence).
- Avoid repeating unnecessary information or echoing the user's entire prompt.
- Never say "I have executed your command", "Processing requested operation", or "Operation successful".
- Never ask unnecessary confirmations like "Are you sure you want to turn on the fan?". Execute directly when intent is clear. Only clarify when genuinely ambiguous.
- Natural clarification:
  * Never speak error codes or robotic phrases like "ERROR: PARAMETER NOT FOUND" or "Unsupported operation".
  * If ambiguous: "Which device do you want me to make purple?"
  * If unsupported: "I can turn the fan on or off, but I can't control its speed yet."
- Continuous conversation sequence:
  User: "Turn on the projector." -> Assistant: "Projector is on."
  User: "Make it purple." -> Assistant: "Done."
  User: "Actually, make it blue." -> Assistant: "Blue."
  User: "Okay, turn it off." -> Assistant: "Projector is off."`
}

/**
 * Creates a short-lived ephemeral authentication token for Gemini Live API WebSocket sessions.
 * Constrains the session to real-time audio modality and enables session resumption.
 *
 * @param {Object} [options]
 * @param {string} [options.model] - Live API model name override
 * @param {number} [options.validityMinutes=30] - Ephemeral token lifespan (minutes)
 * @param {number} [options.sessionStartWindowMinutes=5] - Time window in minutes to initiate session
 * @param {string} [options.classroom='Room 302']
 * @param {Object} [options.deviceStates] - Current device states
 * @returns {Promise<{ token: string, model: string, systemInstruction: string, tools: Array }>}
 */
async function createLiveSessionToken(options = {}) {
  const ai = getClient()
  const model = options.model || DEFAULT_LIVE_MODEL
  const systemInstruction = buildClassroomSystemInstruction(options)
  const tools = [
    CONTROL_CLASSROOM_DEVICES_TOOL,
    SET_CLASSROOM_RGB_TOOL,
    GET_CLASSROOM_DEVICE_STATE_TOOL,
  ]

  const now = Date.now()
  const expireTime = new Date(now + (options.validityMinutes || 30) * 60 * 1000).toISOString()
  const newSessionExpireTime = new Date(now + (options.sessionStartWindowMinutes || 5) * 60 * 1000).toISOString()

  const tokenResponse = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime,
      newSessionExpireTime,
      liveConnectConstraints: {
        model,
        config: {
          responseModalities: ['AUDIO'],
          sessionResumption: {},
          tools,
        },
      },
    },
  })

  if (!tokenResponse || !tokenResponse.name) {
    throw new Error('Gemini API did not return an auth token name.')
  }

  return {
    token: tokenResponse.name,
    model,
    systemInstruction,
    tools,
  }
}


/**
 * Returns safe diagnostic metrics on Gemini service configuration
 */
function getStatus() {
  const currentKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY
  return {
    provider: 'Google Gemini',
    sdk: '@google/genai',
    configured: isConfigured(),
    maskedKey: maskApiKey(currentKey),
    defaultModel: getDefaultModel(),
    defaultLiveModel: DEFAULT_LIVE_MODEL,
  }
}

module.exports = {
  generateText,
  getClient,
  isConfigured,
  getDefaultModel,
  DEFAULT_LIVE_MODEL,
  createLiveSessionToken,
  buildClassroomSystemInstruction,
  CONTROL_CLASSROOM_DEVICES_TOOL,
  SET_CLASSROOM_RGB_TOOL,
  GET_CLASSROOM_DEVICE_STATE_TOOL,
  getStatus,
  maskApiKey,
  parseGeminiError,
}

