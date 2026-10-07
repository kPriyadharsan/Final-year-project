const WebSocket = require('ws')
const { GoogleGenAI, Type } = require('@google/genai')
const env = require('../config/env')
const geminiService = require('./gemini.service')
const deviceCommandService = require('./deviceCommand.service')
const classroomStateService = require('./classroomState.service')
const { Device } = require('../models/Device')
const { VoiceCommand, EXECUTION_STATUSES } = require('../models/VoiceCommand')
const {
  DEVICE_CAPABILITIES,
  COLOR_PALETTE,
  resolveRgbColor,
  validateDeviceCapability,
} = require('../constants/deviceCapabilities')

// Provide global WebSocket for @google/genai SDK in Node environment
if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WebSocket
}

const DEFAULT_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025'

// Command tracking map to ensure latest command priority per device
const latestCommandTracker = new Map()

let wss = null
const activeSessions = new Map()

/**
 * Assigns and records a command sequence ID to prevent out-of-order execution
 *
 * @param {string} deviceKey
 * @param {string} action
 * @returns {{ commandId: string, sequence: number, isLatest: () => boolean }}
 */
function createCommandTracker(deviceKey, action) {
  const normKey = String(deviceKey).trim().toLowerCase()
  const prev = latestCommandTracker.get(normKey) || { sequence: 0 }
  const sequence = prev.sequence + 1
  const commandId = `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`

  const entry = {
    commandId,
    sequence,
    action,
    timestamp: Date.now(),
  }
  latestCommandTracker.set(normKey, entry)

  return {
    commandId,
    sequence,
    isLatest: () => {
      const current = latestCommandTracker.get(normKey)
      return !current || current.sequence === sequence
    },
  }
}

/**
 * Initializes the real-time Voice Streaming WebSocket server
 * Mounted at path: /ws/voice on the shared Node HTTP server
 *
 * @param {import('http').Server} httpServer
 */
function initVoiceStream(httpServer) {
  if (wss) return wss

  wss = new WebSocket.Server({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 10 * 1024 * 1024,
  })

  // Handle upgrade strictly for /ws/voice path to completely prevent collision with Socket.IO
  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const parsedUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
      if (parsedUrl.pathname === '/ws/voice') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request)
        })
      }
    } catch (e) {
      // Allow other upgrade handlers (Socket.IO) to process their respective paths
    }
  })

  console.log('[VoiceStream] 🎙️ Real-time Voice WebSocket server initialized on path: /ws/voice')

  wss.on('connection', async (clientWs, req) => {
    const sessionId = `voice-session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    console.log(`[VoiceStream] 🔌 Client connected: [${sessionId}] from ${req.socket.remoteAddress}`)

    const sessionState = {
      sessionId,
      clientWs,
      geminiSession: null,
      isActive: true,
      currentTurnId: 0,
      user: null,
      classroom: 'Room 302',
      metrics: {
        speechStartTime: null,
        speechEndTime: null,
        turnFinalizedTime: null,
        modelRequestTime: null,
        firstAudioTime: null,
        commandSentTime: null,
      },
    }

    activeSessions.set(sessionId, sessionState)

    // Send initial session handshake to client
    sendClientMessage(clientWs, {
      type: 'session_ready',
      sessionId,
      model: DEFAULT_LIVE_MODEL,
      timestamp: Date.now(),
    })

    // 1. Immediately register client WebSocket message listeners so early frames are never lost
    clientWs.on('message', async (data, isBinary) => {
      if (!sessionState.isActive) return
      console.log(`[VoiceStream] 📨 Message frame received: isBinary=${isBinary}, bytes=${data?.length || 0}`)

      // Distinguish JSON control frame from raw binary PCM chunk
      let isJson = false
      if (typeof data === 'string') {
        const trimmed = data.trim()
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          isJson = true
        }
      } else if (Buffer.isBuffer(data) && data.length > 0 && data[0] === 0x7B) {
        // Starts with ASCII '{' (0x7B)
        try {
          const str = data.toString('utf8').trim()
          if (str.startsWith('{') && str.endsWith('}')) {
            isJson = true
          }
        } catch {}
      }

      if (isJson) {
        try {
          const message = JSON.parse(data.toString('utf8'))
          await handleClientControlMessage(sessionState, message)
        } catch (err) {
          console.warn(`[VoiceStream] Error handling control message: ${err.message}`)
        }
        return
      }

      // Handle raw PCM binary audio chunk (16kHz mono 16-bit PCM)
      handleClientAudioChunk(sessionState, data)
    })

    clientWs.on('close', () => {
      console.log(`[VoiceStream] 🔌 Client disconnected: [${sessionId}]`)
      sessionState.isActive = false
      cleanupSession(sessionState)
      activeSessions.delete(sessionId)
    })

    clientWs.on('error', (err) => {
      console.warn(`[VoiceStream] Client socket error [${sessionId}]: ${err.message}`)
    })

    // 2. Initialize persistent Gemini Live session in the background
    setupGeminiLiveSession(sessionState).catch((err) => {
      console.warn(`[VoiceStream] Notice: Gemini Live direct session note for [${sessionId}]: ${err.message}`)
      sendClientMessage(clientWs, {
        type: 'session_warning',
        message: 'Real-time assistant connected in fast-dispatch mode.',
      })
    })
  })

  return wss
}

/**
 * Sets up a persistent Gemini Live WebSocket session using backend GoogleGenAI client
 */
async function setupGeminiLiveSession(sessionState) {
  const apiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('REPLACE_WITH_YOUR_KEY')) {
    console.warn('[VoiceStream] GEMINI_API_KEY is not configured.')
    return
  }

  // Retrieve current confirmed classroom state for context
  let deviceStates = {}
  try {
    const stateData = await classroomStateService.getClassroomState(sessionState.classroom)
    deviceStates = {
      light: stateData.devices.light?.power || 'OFF',
      fan: stateData.devices.fan?.power || 'OFF',
      projector: stateData.devices.projector?.power || 'OFF',
      projectorRgb:
        stateData.devices.projector?.rgb?.power === 'ON'
          ? stateData.devices.projector?.rgb?.color || 'ON'
          : 'OFF',
    }
  } catch (e) {
    deviceStates = { light: 'OFF', fan: 'OFF', projector: 'OFF', projectorRgb: 'OFF' }
  }

  const systemInstructionText = geminiService.buildClassroomSystemInstruction({
    classroom: sessionState.classroom,
    deviceStates,
  })

  const tools = [
    geminiService.CONTROL_CLASSROOM_DEVICES_TOOL,
    geminiService.SET_CLASSROOM_RGB_TOOL,
    geminiService.GET_CLASSROOM_DEVICE_STATE_TOOL,
  ]

  const ai = new GoogleGenAI({ apiKey })

  const liveConnectConfig = {
    model: DEFAULT_LIVE_MODEL,
    config: {
      responseModalities: ['AUDIO'],
      systemInstruction: {
        parts: [{ text: systemInstructionText }],
      },
      tools,
      sessionResumption: {},
    },
    callbacks: {
      onopen: () => {
        console.log(`[VoiceStream] ✅ Gemini Live session established for [${sessionState.sessionId}]`)
        sendClientMessage(sessionState.clientWs, {
          type: 'live_connected',
          timestamp: Date.now(),
        })
      },
      onmessage: (msg) => {
        handleGeminiServerMessage(sessionState, msg)
      },
      onerror: (err) => {
        console.warn(`[VoiceStream] Gemini Live socket notice [${sessionState.sessionId}]:`, err.message || err)
      },
      onclose: (e) => {
        console.log(`[VoiceStream] Gemini Live closed for [${sessionState.sessionId}]`)
      },
    },
  }

  const session = await ai.live.connect(liveConnectConfig)
  sessionState.geminiSession = session
}

/**
 * Streams incoming 16 kHz PCM chunk from client into the persistent Gemini Live session
 */
function handleClientAudioChunk(sessionState, chunkBuffer) {
  if (!sessionState.geminiSession || !sessionState.isActive) return

  const base64Audio = chunkBuffer.toString('base64')
  try {
    sessionState.geminiSession.sendRealtimeInput({
      media: {
        mimeType: 'audio/pcm;rate=16000',
        data: base64Audio,
      },
    })
  } catch (err) {
    // Non-fatal streaming drop
  }
}

/**
 * Handles JSON control frames from the client
 */
async function handleClientControlMessage(sessionState, msg) {
  const { type } = msg

  switch (type) {
    case 'speech_start': {
      sessionState.metrics.speechStartTime = Date.now()
      sessionState.currentTurnId++
      sendClientMessage(sessionState.clientWs, {
        type: 'state_change',
        state: 'USER_SPEAKING',
        turnId: sessionState.currentTurnId,
      })
      break
    }

    case 'turn_complete': {
      // VAD detected end of speech immediately
      const now = Date.now()
      sessionState.metrics.speechEndTime = msg.speechEndTime || now
      sessionState.metrics.turnFinalizedTime = now
      sessionState.metrics.modelRequestTime = now

      const turnDetectionDelay = sessionState.metrics.speechEndTime
        ? now - sessionState.metrics.speechEndTime
        : 0

      console.log(`[VoiceStream] ⚡ End-of-speech finalized in ${turnDetectionDelay}ms for [${sessionState.sessionId}]`)

      sendClientMessage(sessionState.clientWs, {
        type: 'state_change',
        state: 'PROCESSING',
        turnId: sessionState.currentTurnId,
        metrics: {
          turnDetectionDelayMs: turnDetectionDelay,
        },
      })

      // Signal turn complete to Gemini Live session
      if (sessionState.geminiSession) {
        try {
          if (msg.text) {
            sessionState.geminiSession.sendClientContent({
              turns: [{ role: 'user', parts: [{ text: msg.text }] }],
              turnComplete: true,
            })
          } else {
            sessionState.geminiSession.sendClientContent({ turnComplete: true })
          }
        } catch (e) {
          console.warn('[VoiceStream] Error sending turnComplete to Gemini:', e.message)
        }
      }
      break
    }

    case 'interrupt': {
      // MANDATORY BARGE-IN: User spoke while assistant was speaking
      console.log(`[VoiceStream] 🛑 User Barge-in Interruption received for [${sessionState.sessionId}]`)
      sessionState.currentTurnId++
      sessionState.metrics.firstAudioTime = null

      sendClientMessage(sessionState.clientWs, {
        type: 'interrupted',
        turnId: sessionState.currentTurnId,
        timestamp: Date.now(),
      })

      // Reset client content on Gemini Live if possible
      if (sessionState.geminiSession) {
        try {
          sessionState.geminiSession.sendClientContent({ turns: [], turnComplete: false })
        } catch {}
      }
      break
    }

    case 'fast_dispatch_command': {
      // Direct fast-path text dispatch from client VAD / interim parser
      await handleFastDispatchCommand(sessionState, msg.text)
      break
    }

    default:
      break
  }
}

/**
 * Handles incoming events and streaming audio from Gemini Live
 */
function handleGeminiServerMessage(sessionState, msg) {
  if (!sessionState.isActive) return

  // 1. Tool Call handling (e.g. control_classroom_devices, set_classroom_rgb)
  if (msg.toolCall?.functionCalls) {
    for (const call of msg.toolCall.functionCalls) {
      handleToolCall(sessionState, call)
    }
  }

  // 2. Interruption event from Gemini server
  if (msg.serverContent?.interrupted) {
    sessionState.currentTurnId++
    sendClientMessage(sessionState.clientWs, {
      type: 'interrupted',
      turnId: sessionState.currentTurnId,
      timestamp: Date.now(),
    })
  }

  // 3. Audio parts and text from model turn
  if (msg.serverContent?.modelTurn?.parts) {
    const turnId = sessionState.currentTurnId

    for (const part of msg.serverContent.modelTurn.parts) {
      if (part.functionCall) {
        handleToolCall(sessionState, part.functionCall)
      }

      // Stream 24 kHz raw PCM audio chunk directly to client
      if (part.inlineData && part.inlineData.data) {
        const now = Date.now()
        if (!sessionState.metrics.firstAudioTime && sessionState.metrics.turnFinalizedTime) {
          sessionState.metrics.firstAudioTime = now
          const timeToFirstAudio = now - sessionState.metrics.turnFinalizedTime
          console.log(`[VoiceStream] ⚡ Time to First Audio Response: ${timeToFirstAudio}ms`)

          sendClientMessage(sessionState.clientWs, {
            type: 'latency_metric',
            metric: 'time_to_first_audio_ms',
            value: timeToFirstAudio,
          })
        }

        sendClientMessage(sessionState.clientWs, {
          type: 'audio_chunk',
          data: part.inlineData.data,
          turnId,
        })
      }

      // Stream generated conversational text transcript for UI
      if (part.text) {
        sendClientMessage(sessionState.clientWs, {
          type: 'transcript_chunk',
          text: part.text,
          turnId,
        })
      }
    }
  }

  // 4. Model turn complete
  if (msg.serverContent?.turnComplete) {
    sendClientMessage(sessionState.clientWs, {
      type: 'turn_complete',
      turnId: sessionState.currentTurnId,
    })
  }
}

/**
 * Executes tool calls asynchronously without blocking the conversational response
 */
async function handleToolCall(sessionState, call) {
  const { id, name, args } = call
  const callId = id || 'call_default'
  const toolName = name || 'control_classroom_devices'

  console.log(`[VoiceStream] 🛠️ Tool call received: ${toolName}`, args)

  if (toolName === 'control_classroom_devices') {
    const actions = args?.actions || []
    const validatedActions = []

    for (const item of actions) {
      const device = String(item.device || '').trim().toLowerCase()
      const action = String(item.action || '').trim().toUpperCase()
      const capability = item.capability ? String(item.capability).trim().toLowerCase() : undefined

      const validation = validateDeviceCapability(device, action, capability)
      if (validation.valid) {
        const tracker = createCommandTracker(device, action)
        validatedActions.push({
          device,
          action,
          capability: validation.capability,
          tracker,
        })
      }
    }

    // Acknowledge tool call immediately to Gemini Live so conversational voice streams WITHOUT waiting!
    if (sessionState.geminiSession) {
      try {
        sessionState.geminiSession.sendToolResponse({
          functionResponses: [
            {
              id: callId,
              name: toolName,
              response: {
                status: 'COMMAND_SENT',
                message: 'Device command dispatched asynchronously to classroom hardware controller.',
                actions: validatedActions.map((a) => ({
                  device: a.device,
                  action: a.action,
                  status: 'COMMAND_SENT',
                })),
              },
            },
          ],
        })
      } catch (err) {
        console.warn('[VoiceStream] Error sending tool response:', err.message)
      }
    }

    // Send immediate optimistic UI update to client
    sendClientMessage(sessionState.clientWs, {
      type: 'device_action_dispatched',
      actions: validatedActions.map((a) => ({
        device: a.device,
        action: a.action,
        status: 'COMMAND_SENT',
        commandId: a.tracker.commandId,
      })),
    })

    // NON-BLOCKING ASYNCHRONOUS HARDWARE DISPATCH
    // Hardware execution happens in background; voice response is NEVER blocked!
    setImmediate(async () => {
      for (const act of validatedActions) {
        // Latest command priority guard: if superseded by a newer user command, abort stale execution!
        if (!act.tracker.isLatest()) {
          console.log(`[VoiceStream] ⏩ Superseded command ${act.device} -> ${act.action} skipped for newer command`)
          continue
        }

        try {
          const cmdResult = await deviceCommandService.executeDeviceCommand({
            deviceType: act.device,
            action: act.action,
            classroom: sessionState.classroom,
            user: sessionState.user,
            source: 'VOICE_LIVE',
          })

          sendClientMessage(sessionState.clientWs, {
            type: 'device_action_result',
            device: act.device,
            action: act.action,
            success: Boolean(cmdResult.success && cmdResult.delivered),
            message: cmdResult.message,
            commandId: act.tracker.commandId,
          })
        } catch (execErr) {
          console.error(`[VoiceStream] Hardware dispatch error for ${act.device}:`, execErr.message)
        }
      }
    })
  } else if (toolName === 'set_classroom_rgb') {
    const device = String(args?.device || 'projector').trim().toLowerCase()
    const color = args?.color?.name || args?.colorName || args?.color || 'purple'
    const power = args?.power ? String(args.power).trim().toUpperCase() : 'ON'
    const tracker = createCommandTracker(`${device}-rgb`, power === 'OFF' ? 'OFF' : color)

    // Acknowledge immediately to Gemini Live
    if (sessionState.geminiSession) {
      try {
        sessionState.geminiSession.sendToolResponse({
          functionResponses: [
            {
              id: callId,
              name: toolName,
              response: {
                status: 'COMMAND_SENT',
                device,
                color,
                power,
                message: `RGB command dispatched to ${device}.`,
              },
            },
          ],
        })
      } catch {}
    }

    // Asynchronous non-blocking RGB dispatch
    setImmediate(async () => {
      if (!tracker.isLatest()) return
      try {
        const cmdResult = await deviceCommandService.executeDeviceColorCommand({
          deviceType: device,
          classroom: sessionState.classroom,
          power,
          color,
          user: sessionState.user,
          source: 'VOICE_LIVE',
        })

        sendClientMessage(sessionState.clientWs, {
          type: 'device_action_result',
          device,
          action: power === 'OFF' ? 'OFF' : 'SET_COLOR',
          color: cmdResult.color,
          success: Boolean(cmdResult.success && cmdResult.delivered),
          message: cmdResult.message,
          commandId: tracker.commandId,
        })
      } catch (rgbErr) {
        console.error('[VoiceStream] RGB execution error:', rgbErr.message)
      }
    })
  } else if (toolName === 'get_classroom_device_state') {
    const device = String(args?.device || 'all').trim().toLowerCase()
    try {
      const stateData = await classroomStateService.getClassroomState(sessionState.classroom)
      if (sessionState.geminiSession) {
        sessionState.geminiSession.sendToolResponse({
          functionResponses: [
            {
              id: callId,
              name: toolName,
              response: {
                classroom: sessionState.classroom,
                device,
                state: stateData,
                success: true,
              },
            },
          ],
        })
      }
    } catch (e) {
      if (sessionState.geminiSession) {
        sessionState.geminiSession.sendToolResponse({
          functionResponses: [
            {
              id: callId,
              name: toolName,
              response: { error: 'Hardware state unavailable' },
            },
          ],
        })
      }
    }
  }
}

/**
 * Handles fast-path command execution when Gemini Live is unavailable or client sends parsed text
 */
async function handleFastDispatchCommand(sessionState, text) {
  if (!text || typeof text !== 'string') return

  const commandParserService = require('./commandParser.service')
  const parsed = await commandParserService.parseClassroomCommand(text)

  if (parsed.intent === 'DEVICE_CONTROL' && parsed.device && parsed.action) {
    const tracker = createCommandTracker(parsed.device, parsed.action)

    sendClientMessage(sessionState.clientWs, {
      type: 'device_action_dispatched',
      actions: [{
        device: parsed.device,
        action: parsed.action,
        status: 'COMMAND_SENT',
        commandId: tracker.commandId,
      }],
    })

    // Verbal feedback text
    const verbalMessage = parsed.action === 'SET_COLOR'
      ? `Setting ${parsed.device} color to ${parsed.color?.name || 'custom'}.`
      : `${parsed.device.charAt(0).toUpperCase() + parsed.device.slice(1)} is ${parsed.action.toLowerCase()}.`

    sendClientMessage(sessionState.clientWs, {
      type: 'transcript_chunk',
      text: verbalMessage,
      turnId: sessionState.currentTurnId,
    })

    // Non-blocking hardware execution
    setImmediate(async () => {
      if (!tracker.isLatest()) return
      try {
        const cmdResult = await deviceCommandService.executeDeviceCommand({
          deviceType: parsed.device,
          action: parsed.action,
          color: parsed.color,
          classroom: sessionState.classroom,
          user: sessionState.user,
          source: 'VOICE_STREAM',
        })

        sendClientMessage(sessionState.clientWs, {
          type: 'device_action_result',
          device: parsed.device,
          action: parsed.action,
          success: Boolean(cmdResult.success && cmdResult.delivered),
          message: cmdResult.message,
          commandId: tracker.commandId,
        })
      } catch (err) {
        console.error('[VoiceStream] Fast dispatch hardware error:', err.message)
      }
    })
  }
}

/**
 * Sends a JSON frame safely to the client WebSocket
 */
function sendClientMessage(clientWs, obj) {
  if (!clientWs || clientWs.readyState !== WebSocket.OPEN) return
  try {
    clientWs.send(JSON.stringify(obj))
  } catch (err) {
    // Client write error
  }
}

/**
 * Cleans up session resources
 */
function cleanupSession(sessionState) {
  if (sessionState.geminiSession) {
    try {
      if (typeof sessionState.geminiSession.close === 'function') {
        sessionState.geminiSession.close()
      }
    } catch {}
    sessionState.geminiSession = null
  }
}

/**
 * Stops the VoiceStream WebSocket server cleanly
 */
async function closeVoiceStream() {
  if (!wss) return

  for (const session of activeSessions.values()) {
    cleanupSession(session)
  }
  activeSessions.clear()

  return new Promise((resolve) => {
    wss.close(() => {
      console.log('🔒 VoiceStream WebSocket server closed.')
      wss = null
      resolve()
    })
  })
}

module.exports = {
  initVoiceStream,
  closeVoiceStream,
  createCommandTracker,
}
