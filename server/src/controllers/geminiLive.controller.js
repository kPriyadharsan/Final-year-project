const geminiService = require('../services/gemini.service')
const deviceCommandService = require('../services/deviceCommand.service')
const classroomStateService = require('../services/classroomState.service')
const { VoiceCommand, EXECUTION_STATUSES } = require('../models/VoiceCommand')
const {
  DEVICE_CAPABILITIES,
  COLOR_PALETTE,
  resolveRgbColor,
  validateDeviceCapability,
} = require('../constants/deviceCapabilities')

const SUPPORTED_DEVICES = Object.keys(DEVICE_CAPABILITIES)
const SUPPORTED_ACTIONS = ['ON', 'OFF', 'SET_COLOR']

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

    const classroom = req.body?.classroom || req.query?.classroom || process.env.DEFAULT_CLASSROOM || 'Room 302'

    // Fetch latest confirmed state snapshot of classroom devices via centralized state service
    let deviceStates = {}
    try {
      const stateData = await classroomStateService.getClassroomState(classroom)
      deviceStates = {
        light: stateData.devices.light?.power || 'OFF',
        fan: stateData.devices.fan?.power || 'OFF',
        projector: stateData.devices.projector?.power || 'OFF',
        projectorRgb:
          stateData.devices.projector?.rgb?.power === 'ON'
            ? stateData.devices.projector?.rgb?.color || 'ON'
            : 'OFF',
      }
    } catch (dbErr) {
      console.warn(`[GeminiLive] Notice: Could not read current device states for prompt: ${dbErr.message}`)
    }

    const liveTokenData = await geminiService.createLiveSessionToken({
      classroom,
      deviceStates,
    })

    console.log(`[GeminiLive] ✅ Ephemeral Live session token issued successfully (User: ${userIdentifier})`)

    return res.status(200).json({
      status: 'success',
      data: {
        token: liveTokenData.token,
        model: liveTokenData.model,
        systemInstruction: liveTokenData.systemInstruction,
        tools: liveTokenData.tools,
        deviceStates,
        capabilities: DEVICE_CAPABILITIES,
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
 * @desc    Get live assistant prompt, tool definitions, capabilities, and current device states
 * @route   GET /api/voice/live/config
 * @access  Public / Authenticated
 */
async function getLiveAssistantConfig(req, res) {
  try {
    const classroom = req.query?.classroom || process.env.DEFAULT_CLASSROOM || 'Room 302'
    let deviceStates = {}
    try {
      const stateData = await classroomStateService.getClassroomState(classroom)
      deviceStates = {
        light: stateData.devices.light?.power || 'OFF',
        fan: stateData.devices.fan?.power || 'OFF',
        projector: stateData.devices.projector?.power || 'OFF',
        projectorRgb:
          stateData.devices.projector?.rgb?.power === 'ON'
            ? stateData.devices.projector?.rgb?.color || 'ON'
            : 'OFF',
      }
    } catch {}

    const systemInstruction = geminiService.buildClassroomSystemInstruction({ classroom, deviceStates })
    const tools = [
      geminiService.CONTROL_CLASSROOM_DEVICES_TOOL,
      geminiService.SET_CLASSROOM_RGB_TOOL,
      geminiService.GET_CLASSROOM_DEVICE_STATE_TOOL,
    ]

    return res.status(200).json({
      status: 'success',
      data: {
        model: geminiService.DEFAULT_LIVE_MODEL,
        systemInstruction,
        tools,
        deviceStates,
        capabilities: DEVICE_CAPABILITIES,
      },
    })
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      message: err.message,
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
      let item = actions[i]

      // Safely normalize JSON string action item if present
      if (typeof item === 'string') {
        try {
          item = JSON.parse(item)
        } catch {
          return res.status(400).json({
            status: 'error',
            code: 'MALFORMED_ACTION',
            message: `Action at index ${i} is not a valid JSON string or object.`,
          })
        }
      }

      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return res.status(400).json({
          status: 'error',
          code: 'MALFORMED_ACTION',
          message: `Action at index ${i} is not a valid object.`,
        })
      }

      const device = String(item.device || '').trim().toLowerCase()
      const action = String(item.action || '').trim().toUpperCase()
      const capability = item.capability ? String(item.capability).trim().toLowerCase() : undefined

      const validation = validateDeviceCapability(device, action, capability)
      if (!validation.valid) {
        const isUnsupportedDev = !DEVICE_CAPABILITIES[device]
        const isCapabilityError = Boolean(DEVICE_CAPABILITIES[device] && !DEVICE_CAPABILITIES[device].capabilities.includes(validation.capability || 'rgb'))
        return res.status(400).json({
          status: 'error',
          code: isUnsupportedDev ? 'UNSUPPORTED_DEVICE' : isCapabilityError ? 'DEVICE_DOES_NOT_SUPPORT_RGB' : 'INVALID_ACTION',
          message: validation.error,
        })
      }

      // If capability is rgb or action is SET_COLOR, resolve color
      let resolvedColor = null
      if (validation.capability === 'rgb' || action === 'SET_COLOR') {
        const colorInput = item.color || item.colorName || (item.color && item.color.name) || 'purple'
        resolvedColor = resolveRgbColor(colorInput)
        if (!resolvedColor) {
          resolvedColor = COLOR_PALETTE.purple
        }
      }

      validatedActions.push({
        device,
        action,
        capability: validation.capability,
        color: resolvedColor,
      })
    }

    // Ensure sequential ordering: for any device, power ON must execute BEFORE RGB SET!
    validatedActions.sort((a, b) => {
      if (a.device === b.device) {
        if (a.action === 'ON' && (b.action === 'SET_COLOR' || b.capability === 'rgb')) return -1
        if ((a.action === 'SET_COLOR' || a.capability === 'rgb') && b.action === 'ON') return 1
      }
      return 0
    })

    console.log(`[GeminiLive] Function call: control_classroom_devices`)
    console.log(`[GeminiLive] Actions: ${validatedActions.length}`)

    // 3. Execute every action through the EXISTING deviceCommandService
    const actionResults = []
    for (const act of validatedActions) {
      // 3a. State-aware check: Avoid redundant MQTT commands if device is already in requested state
      if (!act.capability || act.capability === 'power') {
        const { Device } = require('../models/Device')
        const currentDev = await Device.findOne({
          type: act.device.toUpperCase(),
          isActive: true,
          ...(classroom ? { classroom: { $regex: new RegExp(`^${classroom.trim()}$`, 'i') } } : {}),
        }).lean()

        const currentPower = (currentDev?.state || currentDev?.confirmedState || '').toUpperCase()
        if (currentDev && currentPower === act.action) {
          console.log(`[GeminiLive] ⚡ State-aware: "${act.device}" is already ${act.action}. Avoiding redundant MQTT publish.`)
          actionResults.push({
            device: act.device,
            action: act.action,
            capability: 'power',
            success: true,
            delivered: true,
            alreadyInState: true,
            message: `${currentDev.name || act.device} is already ${act.action.toLowerCase()}.`,
          })
          continue
        }
      }

      let cmdResult = null

      if (act.capability === 'rgb' || act.action === 'SET_COLOR') {
        cmdResult = await deviceCommandService.executeDeviceColorCommand({
          deviceType: act.device,
          classroom,
          power: 'ON',
          color: act.color,
          user: currentUser,
          source: 'VOICE_LIVE',
        })
      } else {
        cmdResult = await deviceCommandService.executeDeviceCommand({
          deviceType: act.device,
          action: act.action,
          classroom,
          user: currentUser,
          source: 'VOICE_LIVE',
        })
      }

      const isSuccess = Boolean(cmdResult.success && cmdResult.delivered)
      console.log(`[GeminiLive] Device command result: ${act.device} ${act.action} -> ${isSuccess ? 'delivered' : 'failed'}`)

      actionResults.push({
        device: act.device,
        action: act.action,
        capability: act.capability,
        ...(act.color ? { color: act.color } : {}),
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

/**
 * @desc    Dedicated handler for set_classroom_rgb function tool
 * @route   POST /api/voice/live/rgb
 * @access  Protected / Authenticated (matches existing voice command auth)
 */
async function handleLiveRgbCommand(req, res) {
  try {
    const { device: inputDevice, color, colorName, power: inputPower, classroom: inputClassroom } = req.body
    const classroom = inputClassroom || process.env.DEFAULT_CLASSROOM || 'Room 302'
    const currentUser = req.user || null
    const userName = currentUser ? currentUser.name || currentUser.email : 'Anonymous'

    console.log(`[GeminiLive] 🎨 Received set_classroom_rgb call for device "${inputDevice}" in "${classroom}" (User: ${userName})`)

    const device = String(inputDevice || '').trim().toLowerCase()
    if (!device) {
      return res.status(400).json({
        status: 'error',
        code: 'DEVICE_REQUIRED',
        message: 'The "device" field is required (e.g. "projector").',
      })
    }

    // 1. Backend capability validation
    const validation = validateDeviceCapability(device, 'SET_COLOR', 'rgb')
    if (!validation.valid) {
      const isUnsupportedDev = !DEVICE_CAPABILITIES[device]
      console.warn(`[GeminiLive] ⚠️ RGB capability check failed for device "${device}": ${validation.error}`)
      return res.status(400).json({
        status: 'error',
        code: isUnsupportedDev ? 'UNSUPPORTED_DEVICE' : 'DEVICE_DOES_NOT_SUPPORT_RGB',
        message: validation.error,
      })
    }

    // 2. Power & Color Resolution
    let targetPower = 'ON'
    if (inputPower && String(inputPower).trim().toUpperCase() === 'OFF') {
      targetPower = 'OFF'
    }

    const rawColor = color || colorName || (color && color.name)
    if (typeof rawColor === 'string' && rawColor.trim().toLowerCase() === 'off') {
      targetPower = 'OFF'
    }

    let resolvedColor = null
    if (targetPower === 'OFF') {
      resolvedColor = COLOR_PALETTE.off || { r: 0, g: 0, b: 0, hex: '#000000', name: 'off' }
    } else {
      if (!rawColor) {
        return res.status(400).json({
          status: 'error',
          code: 'COLOR_REQUIRED',
          message: 'Color is required for RGB control (e.g. "purple", "cyan", or hex #FF00FF).',
        })
      }
      resolvedColor = resolveRgbColor(rawColor)
      if (!resolvedColor) {
        return res.status(400).json({
          status: 'error',
          code: 'UNSUPPORTED_COLOR',
          message: `Color "${typeof rawColor === 'object' ? rawColor.name || JSON.stringify(rawColor) : rawColor}" is not supported. Supported colors: red, green, blue, yellow, orange, purple, pink, cyan, white, warm white, or #HEX.`,
        })
      }
    }

    // 3. Dispatch to deviceCommandService
    const cmdResult = await deviceCommandService.executeDeviceColorCommand({
      deviceType: device,
      classroom,
      power: targetPower,
      color: resolvedColor,
      user: currentUser,
      source: 'VOICE_LIVE',
    })

    const isSuccess = Boolean(cmdResult.success && cmdResult.delivered)

    // 4. Audit in VoiceCommand
    try {
      await VoiceCommand.create({
        user: currentUser ? currentUser._id : null,
        transcript: `[Live Tool: set_classroom_rgb] ${device} -> ${targetPower === 'OFF' ? 'OFF' : resolvedColor.name || resolvedColor.hex}`,
        intent: 'DEVICE_CONTROL',
        device,
        action: targetPower === 'OFF' ? 'OFF' : 'SET_COLOR',
        result: {
          executionStatus: isSuccess ? EXECUTION_STATUSES.EXECUTED : EXECUTION_STATUSES.FAILED,
          device,
          capability: 'rgb',
          power: targetPower,
          color: resolvedColor,
          classroom,
          source: 'VOICE_LIVE',
        },
        createdAt: new Date(),
      })
    } catch (logErr) {
      console.warn(`[GeminiLive] Notice: Could not record VoiceCommand audit: ${logErr.message}`)
    }

    return res.status(200).json({
      status: 'success',
      data: {
        device,
        capability: 'rgb',
        power: targetPower,
        color: resolvedColor,
        delivered: Boolean(cmdResult.delivered),
        success: isSuccess,
        message: cmdResult.message,
      },
    })
  } catch (err) {
    console.error(`[GeminiLive] ❌ Error executing live RGB command: ${err.message}`)
    return res.status(500).json({
      status: 'error',
      code: 'LIVE_RGB_COMMAND_ERROR',
      message: 'Failed to execute live classroom RGB command.',
    })
  }
}

/**
 * @desc    Get live authoritative hardware state of classroom devices (for get_classroom_device_state tool)
 * @route   GET /api/voice/live/state
 * @route   POST /api/voice/live/state
 * @access  Public / Authenticated
 */
async function handleLiveGetState(req, res) {
  try {
    const classroom = req.body?.classroom || req.query?.classroom || process.env.DEFAULT_CLASSROOM || 'Room 302'
    const device = req.body?.device || req.query?.device || 'all'

    console.log(`[GeminiLive] 🔍 Authoritative state query: device="${device}", classroom="${classroom}"`)
    const state = await classroomStateService.getDeviceState(classroom, device)

    return res.status(200).json({
      status: 'success',
      data: state,
    })
  } catch (err) {
    console.error(`[GeminiLive] ❌ Error retrieving live classroom state: ${err.message}`)
    return res.status(500).json({
      status: 'error',
      code: 'STATE_RETRIEVAL_ERROR',
      message: 'Failed to retrieve classroom hardware state.',
    })
  }
}

module.exports = {
  createGeminiLiveToken,
  getLiveAssistantConfig,
  handleLiveDeviceCommand,
  handleLiveRgbCommand,
  handleLiveGetState,
  SUPPORTED_DEVICES,
  SUPPORTED_ACTIONS,
}
