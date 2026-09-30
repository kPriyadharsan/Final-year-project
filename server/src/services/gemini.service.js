const { GoogleGenAI } = require('@google/genai')
const env = require('../config/env')

// Configurable default model; can be overridden via GEMINI_MODEL env var or per-request
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

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
  }
}

module.exports = {
  generateText,
  getClient,
  isConfigured,
  getDefaultModel,
  getStatus,
  maskApiKey,
  parseGeminiError,
}
