const geminiService = require('../services/gemini.service')
const commandParserService = require('../services/commandParser.service')

/**
 * @desc    Test prompt generation endpoint using Gemini AI
 * @route   POST /api/ai/test
 * @access  Public / Authenticated
 */
async function testGeminiPrompt(req, res) {
  try {
    const { prompt, model, systemInstruction, temperature, maxOutputTokens } = req.body

    // 1. Validation: Ensure a valid text prompt is provided
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({
        status: 'error',
        code: 'PROMPT_REQUIRED',
        message: 'A valid text "prompt" string is required in the request body.',
        example: {
          prompt: 'What are the main functions of a smart classroom IoT system?',
        },
      })
    }

    // 2. Prepare options
    const options = {}
    if (model && typeof model === 'string' && model.trim() !== '') {
      options.model = model.trim()
    }
    if (systemInstruction && typeof systemInstruction === 'string') {
      options.systemInstruction = systemInstruction.trim()
    }
    if (typeof temperature === 'number') {
      options.temperature = temperature
    }
    if (typeof maxOutputTokens === 'number') {
      options.maxOutputTokens = maxOutputTokens
    }

    // 3. Generate response via Gemini Service
    const result = await geminiService.generateText(prompt, options)

    // 4. Return clean, structured response (API key is NEVER exposed)
    return res.status(200).json({
      status: 'success',
      data: {
        prompt: prompt.trim(),
        response: result.text,
        model: result.model,
        durationMs: result.durationMs,
        usage: result.usage,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (err) {
    const statusCode = err.status && typeof err.status === 'number' ? err.status : 500

    return res.status(statusCode).json({
      status: 'error',
      code: err.code || 'AI_GENERATION_FAILED',
      message: err.message || 'An unexpected error occurred during AI content generation.',
      hint: err.hint,
      timestamp: new Date().toISOString(),
    })
  }
}

/**
 * @desc    Parse natural language classroom command into structured JSON
 * @route   POST /api/ai/parse-command
 * @access  Public / Authenticated
 */
async function parseCommand(req, res) {
  try {
    // Accepts text, command, or prompt
    const rawInput = req.body.text || req.body.command || req.body.prompt

    if (!rawInput || typeof rawInput !== 'string' || rawInput.trim() === '') {
      return res.status(400).json({
        status: 'error',
        code: 'COMMAND_REQUIRED',
        message: 'A valid text command string ("text", "command", or "prompt") is required.',
        example: {
          text: 'Please turn on the fan.',
        },
      })
    }

    const { model } = req.body
    const options = model ? { model } : {}

    // Parse with Gemini SDK and strict backend allowlist validation
    const parsed = await commandParserService.parseClassroomCommand(rawInput, options)

    // Return the required structured JSON format
    return res.status(200).json({
      status: 'success',
      data: {
        intent: parsed.intent,
        device: parsed.device,
        action: parsed.action,
        confidence: parsed.confidence,
        rawInput: parsed.rawInput,
        isValid: parsed.isValid,
        reason: parsed.reason,
        source: parsed.source,
      },
    })
  } catch (err) {
    const statusCode = err.status && typeof err.status === 'number' ? err.status : 500

    return res.status(statusCode).json({
      status: 'error',
      code: err.code || 'COMMAND_PARSING_FAILED',
      message: err.message || 'Failed to parse classroom command.',
      timestamp: new Date().toISOString(),
    })
  }
}

/**
 * @desc    Check Gemini AI service readiness and configuration status
 * @route   GET /api/ai/status
 * @access  Public
 */
function getAIStatus(req, res) {
  const status = geminiService.getStatus()

  return res.status(200).json({
    status: 'success',
    ai: {
      ...status,
      supportedDevices: commandParserService.SUPPORTED_DEVICES,
      supportedActions: commandParserService.SUPPORTED_ACTIONS,
      supportedIntents: commandParserService.SUPPORTED_INTENTS,
    },
    timestamp: new Date().toISOString(),
  })
}

module.exports = {
  testGeminiPrompt,
  parseCommand,
  getAIStatus,
}
