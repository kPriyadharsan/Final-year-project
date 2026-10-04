const geminiService = require('../services/gemini.service')
const deviceCommandService = require('../services/deviceCommand.service')
const { VoiceCommand, EXECUTION_STATUSES } = require('../models/VoiceCommand')

const SUPPORTED_DEVICES = ['light', 'fan', 'projector']
const SUPPORTED_ACTIONS = ['ON', 'OFF']

/**
 * @desc    Create a short-lived ephemeral token for browser Gemini Live API sessions
 * @route   POST /api/voice/live/token
 * @access  Protected / Authenticated (matches existing voice command auth)
 */
async function createGeminiLiveToken(req, res) {
  try {
    const user = req.user || null
    const userIdentifier = user ? (user.name || user.email || user._id) : 'Anonymous'

    console.log(`[GeminiLive] 🎟️ Ephemeral token request received (User: ${userIdentifier})`)

    if (!geminiService.isConfigured()) {
      console.warn('[GeminiLive] ⚠️ Token creation rejected: GEMINI_API_KEY is not configured.')
      return res.status(503).json({
        status: 'error',
        code: 'GEMINI_NOT_CONFIGURED',
        message: 'Gemini AI service is not configured on this server.',
      })
    }

    const { token } = await geminiService.createLiveSessionToken()

    console.log(`[GeminiLive] ✅ Ephemeral Live session token issued successfully (User: ${userIdentifier})`)

    return res.status(200).json({
      status: 'success',
      data: {
        token,
      },
    })
  } catch (err) {
    // Log safe server error diagnostic WITHOUT leaking the token or GEMINI_API_KEY
    console.error(`[GeminiLive] ❌ Failed to create Live session token: ${err.message}`)

    return res.status(500).json({
      status: 'error',
      code: 'GEMINI_LIVE_TOKEN_ERROR',
      message: 'Failed to create Gemini Live session token.',
    })
  }
}

/**
 * @desc    Execute batch classroom device commands requested by Gemini Live tool calls
 * @route   POST /api/voice/live/command
 * @access  Protected / Authenticated (matches existing voice command auth)
 */
async function handleLiveDeviceCommand(req, res) {
  try {
    const { actions, classroom: inputClassroom } = req.body
    const classroom = inputClassroom || process.env.DEFAULT_CLASSROOM || 'Room 302'
    const currentUser = req.user || null
    const userName = currentUser ? currentUser.name || currentUser.email : 'Anonymous'

    console.log(`[GeminiLive] 📥 Received Live device command request for classroom "${classroom}" (User: ${userName})`)

    // 1. Validate actions array
    if (!actions || !Array.isArray(actions) || actions.length === 0) {
      console.warn('[GeminiLive] ⚠️ Rejected: Missing or empty actions array')
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_ACTIONS',
        message: 'The "actions" field must be a non-empty array of device commands.',
      })
    }

    // 2. Validate each action object against backend allowlists
    const validatedActions = []
    for (let i = 0; i < actions.length; i++) {
      const item = actions[i]
      if (!item || typeof item !== 'object') {
        return res.status(400).json({
          status: 'error',
          code: 'MALFORMED_ACTION',
          message: `Action at index ${i} is not a valid object.`,
        })
      }

      const device = String(item.device || '').trim().toLowerCase()
      const action = String(item.action || '').trim().toUpperCase()

      if (!SUPPORTED_DEVICES.includes(device)) {
        return res.status(400).json({
          status: 'error',
          code: 'UNSUPPORTED_DEVICE',
          message: `Device "${item.device}" is unsupported. Allowed devices: ${SUPPORTED_DEVICES.join(', ')}.`,
        })
      }

      if (!SUPPORTED_ACTIONS.includes(action)) {
        return res.status(400).json({
          status: 'error',
          code: 'INVALID_ACTION',
          message: `Action "${item.action}" is invalid. Allowed actions: ${SUPPORTED_ACTIONS.join(', ')}.`,
        })
      }

      validatedActions.push({ device, action })
    }

    console.log(`[GeminiLive] Function call: control_classroom_devices`)
    console.log(`[GeminiLive] Actions: ${validatedActions.length}`)

    // 3. Execute every action through the EXISTING deviceCommandService
    const actionResults = []
    for (const act of validatedActions) {
      const cmdResult = await deviceCommandService.executeDeviceCommand({
        deviceType: act.device,
        action: act.action,
        classroom,
        user: currentUser,
        source: 'VOICE_LIVE',
      })

      const isSuccess = Boolean(cmdResult.success && cmdResult.delivered)
      console.log(`[GeminiLive] Device command result: ${act.device} ${act.action} -> ${isSuccess ? 'delivered' : 'failed'}`)

      actionResults.push({
        device: act.device,
        action: act.action,
        success: isSuccess,
        delivered: Boolean(cmdResult.delivered),
        message: cmdResult.message,
        ...(cmdResult.code ? { code: cmdResult.code } : {}),
      })
    }

    // 4. Record audit log in VoiceCommand
    const allSuccess = actionResults.every((r) => r.success)
    const someSuccess = actionResults.some((r) => r.success)
    const executionStatus = allSuccess
      ? EXECUTION_STATUSES.EXECUTED
      : someSuccess
      ? 'PARTIAL'
      : EXECUTION_STATUSES.FAILED

    try {
      await VoiceCommand.create({
        user: currentUser ? currentUser._id : null,
        transcript: `[Live Tool: control_classroom_devices] ${validatedActions.map((a) => `${a.device} -> ${a.action}`).join(', ')}`,
        intent: 'DEVICE_CONTROL',
        device: validatedActions.map((a) => a.device).join(','),
        action: validatedActions.map((a) => a.action).join(','),
        result: {
          executionStatus,
          actions: actionResults,
          classroom,
          source: 'VOICE_LIVE',
        },
        createdAt: new Date(),
      })
    } catch (logErr) {
      console.warn(`[GeminiLive] Notice: Could not record VoiceCommand audit: ${logErr.message}`)
    }

    // 5. Return standardized structured response
    return res.status(200).json({
      status: 'success',
      data: {
        actions: actionResults,
      },
    })
  } catch (err) {
    console.error(`[GeminiLive] ❌ Error executing live device command: ${err.message}`)
    return res.status(500).json({
      status: 'error',
      code: 'LIVE_COMMAND_ERROR',
      message: 'Failed to execute live classroom device command.',
    })
  }
}

module.exports = {
  createGeminiLiveToken,
  handleLiveDeviceCommand,
  SUPPORTED_DEVICES,
  SUPPORTED_ACTIONS,
}
