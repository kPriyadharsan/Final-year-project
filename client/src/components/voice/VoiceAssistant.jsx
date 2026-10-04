import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Mic,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  Zap,
  Lightbulb,
  Fan,
  Monitor,
  Square,
  X,
  Volume2,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { API_BASE_URL } from '../../config/api'
import { GoogleGenAI, Type } from '@google/genai'
import audioProcessorUrl from './geminiLiveAudioProcessor.js?url'

/**
 * Feature Flag: Enable Gemini Live real-time bidirectional audio session
 */
export const LIVE_VOICE_ENABLED = true

/**
 * Gemini Live Configuration
 */
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025'

const LIVE_SYSTEM_INSTRUCTION = `You are an intelligent Smart Classroom Voice Assistant.

DEVICE CAPABILITY MODEL:
- light: capabilities = ["power"]. Supported actions: ON, OFF. Main classroom lighting relay channel (GPIO 23). No RGB capability.
- fan: capabilities = ["power"]. Supported actions: ON, OFF. Ceiling fans relay channel (GPIO 22). No speed control or RGB capability.
- projector: capabilities = ["power", "rgb"]. Supported actions: ON, OFF, and RGB LED control. Projector master power relay (GPIO 21) and PWM ambient RGB LED (GPIO 25, 27, 32).
  Supported colors: red, green, blue, yellow, orange, purple, pink, cyan, white, warm white, magenta, violet, lime, amber, or hexadecimal colors (e.g. #FF00FF).

STRUCTURED TOOLS:
1. "control_classroom_devices": For general device power switching (light, fan, projector ON/OFF).
   Arguments: { actions: [{ device: "light"|"fan"|"projector", action: "ON"|"OFF" }] }

2. "set_classroom_rgb": Dedicated tool for projector RGB LED lighting control.
   Arguments: {
     device: "projector",
     color: { name: "purple" } // or "#FF00FF"
     power?: "ON" | "OFF"
   }

NATURAL LANGUAGE UNDERSTANDING:
- Color commands:
  "make it purple"
  "give it a purple glow"
  "set the light to purple"
  "make the RGB purple"
  "change the LED color to purple"
  "turn the projector light purple"
  -> All map to: set_classroom_rgb(device: "projector", color: { name: "purple" })
  Do not require the exact phrase "SET_COLOR".

CONTEXT & PRONOUN RESOLUTION:
- User: "Turn on the projector." -> AI: "Projector is on."
  User: "Make it purple." -> AI calls set_classroom_rgb(device: "projector", color: { name: "purple" }). Do NOT ask which device unless context is genuinely ambiguous.
- If user says "Make it blue" without any prior mention of an RGB-capable device, ask: "Make what blue?"

COMBINED COMMANDS:
- User: "Turn on the projector and make the light purple."
  AI calls both actions:
  1. control_classroom_devices({ actions: [{ device: "projector", action: "ON" }] })
  2. set_classroom_rgb({ device: "projector", color: { name: "purple" } })

RGB OFF BEHAVIOR:
- User: "Turn off the purple light."
  If conversational context indicates the user means the RGB LED:
  -> call set_classroom_rgb({ device: "projector", power: "OFF" })
  If conversational context indicates the user means the projector itself:
  -> call control_classroom_devices({ actions: [{ device: "projector", action: "OFF" }] })
  If genuinely ambiguous, ask one short question: "Turn off the projector or just the purple light?"

STRICT CAPABILITY ENFORCEMENT:
- Fan and Light DO NOT support RGB.
- If user requests RGB on fan ("Make the fan purple"): Do NOT call tool. Respond: "The fan doesn't have RGB lighting."
- If user requests speed control on fan: Do NOT call tool. Respond: "Fan speed control isn't available yet."

RESPONSE STYLE & CONVERSATIONAL NATURALNESS:
- Talk like a natural human assistant in real-time voice, NOT a command execution engine.
- Keep responses ultra-concise (1 to 4 words when confirming standard commands):
  Examples:
  User: "Turn on the projector." -> Assistant: "Projector is on."
  User: "Make it purple." -> Assistant: "Done."
  User: "Actually, make it blue." -> Assistant: "Blue."
  User: "Okay, turn it off." -> Assistant: "Projector is off."
  User: "Turn on the fan." -> Assistant: "Fan is on."
  User: "Turn off everything." -> Assistant: "All devices are off."
- AVOID robotic phrases like: "I have executed your command", "Command processed successfully", "Executing instruction", "Device parameter updated".
- NEVER ask unnecessary confirmations for normal classroom controls (e.g. NEVER ask "Are you sure you want to turn on the fan?"). Execute directly when intent is clear.
- ONLY ask for clarification when command is genuinely ambiguous (e.g. User: "Make it purple" with no device context -> Assistant: "Which device do you want me to make purple?").
- Natural explanation of limitations: If user asks for unsupported feature (e.g., fan speed or fan RGB), explain conversationally:
  "I can turn the fan on or off, but I can't control its speed yet."
  "The fan doesn't have RGB lighting, only the projector does."
- Maintain conversational memory across turns for immediate context and pronoun references ("it", "both", "that", "again").`

/**
 * Tool Declaration for Gemini Live device control
 */
const CONTROL_CLASSROOM_DEVICES_TOOL = {
  functionDeclarations: [
    {
      name: 'control_classroom_devices',
      description: 'Control smart classroom appliances (light, fan, projector) for power switching (ON/OFF).',
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
                  description: 'The target power action: ON or OFF',
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

const GET_CLASSROOM_DEVICE_STATE_TOOL = {
  functionDeclarations: [
    {
      name: 'get_classroom_device_state',
      description: 'Query the authoritative, real-time hardware status of classroom devices (light, fan, projector). Use this tool whenever the user asks about device status or condition (e.g. "Is the fan on?", "Is the projector running?", "What is currently on?", "Which devices are off?", "What color is the projector?").',
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

// AudioWorklet inline definition fallback in case URL resolution fails in specific environments
const WORKLET_INLINE_CODE = `
class GeminiLiveAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Int16Array(this.bufferSize);
    this.bufferIndex = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channelData = input[0];
    for (let i = 0; i < channelData.length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      this.buffer[this.bufferIndex++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      if (this.bufferIndex >= this.bufferSize) {
        const chunk = this.buffer.slice(0, this.bufferSize);
        this.port.postMessage(chunk.buffer, [chunk.buffer]);
        this.buffer = new Int16Array(this.bufferSize);
        this.bufferIndex = 0;
      }
    }
    return true;
  }
}
registerProcessor('gemini-live-audio-processor', GeminiLiveAudioProcessor);
`

/**
 * Helper to convert an ArrayBuffer to a Base64 string
 */
function arrayBufferToBase64(buffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

/**
 * Supported Visual States of the Voice Assistant (ChatGPT Voice Mode style)
 */
export const VOICE_STATES = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking',
  ERROR: 'error',
  ENDED: 'ended',
}

/**
 * Helper to get opposite action
 */
export function getOppositeAction(action) {
  return String(action).toUpperCase() === 'ON' ? 'OFF' : 'ON'
}

/**
 * Helper to get device icon component
 */
function getDeviceIcon(device) {
  const d = String(device || '').toLowerCase()
  if (d === 'light') return Lightbulb
  if (d === 'fan') return Fan
  if (d === 'projector') return Monitor
  return Zap
}

const SAMPLE_COMMANDS = [
  'Turn on the fan',
  'Turn off the light',
  'Turn on the fan and light',
  'Turn off everything',
  'Turn on the projector',
]

/**
 * ChatGPT-Style Voice Conversation Assistant for Smart Classroom
 *
 * Provides a dedicated voice-mode experience:
 * - Large interactive voice orb with fluid state animations
 * - Real-time audio streaming via Gemini Multimodal Live API
 * - Automatic action result cards for executed hardware commands
 * - Individual opposite-action toggle buttons for quick corrections
 * - Graceful fallback to browser Web Speech API
 *
 * @param {Object} props
 * @param {string} [props.classroom='Room 302'] - Active classroom identifier
 * @param {Function} [props.onCommandExecuted] - Callback fired on successful command execution
 * @param {Function} [props.onClose] - Optional close modal callback
 * @param {boolean} [props.isEmbedded=false] - Whether to render as an embedded dashboard widget
 */
export function VoiceAssistant({
  classroom = 'Room 302',
  onCommandExecuted,
  onClose,
  isEmbedded = false,
}) {
  const { token } = useAuth()
  const apiBaseUrl = API_BASE_URL

  // State Management
  const [currentState, setCurrentState] = useState(VOICE_STATES.IDLE)
  const [latestUserText, setLatestUserText] = useState('')
  const [latestGeminiText, setLatestGeminiText] = useState('')
  const [actionCards, setActionCards] = useState([])
  const [errorMessage, setErrorMessage] = useState('')
  const [isSupported, setIsSupported] = useState(true)
  const [isLiveActive, setIsLiveActive] = useState(false)
  const [liveStatusText, setLiveStatusText] = useState('')

  // Web Speech API refs (Fallback mode)
  const recognitionRef = useRef(null)
  const isSpeechEndedRef = useRef(false)

  // Gemini Live API refs
  const liveSessionRef = useRef(null)
  const micStreamRef = useRef(null)
  const inputAudioContextRef = useRef(null)
  const outputAudioContextRef = useRef(null)
  const workletNodeRef = useRef(null)
  const nextPlaybackTimeRef = useRef(0)
  const activeAudioSourcesRef = useRef([])
  const isLiveModeActiveRef = useRef(false)

  // Helper to schedule and play 24kHz PCM audio from Gemini
  const playPcmChunk = useCallback((base64Data) => {
    try {
      if (!outputAudioContextRef.current) {
        outputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 24000,
        })
      }
      const ctx = outputAudioContextRef.current
      if (ctx.state === 'suspended') {
        ctx.resume()
      }

      const binaryString = window.atob(base64Data)
      const len = binaryString.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const int16Array = new Int16Array(bytes.buffer)
      const float32Array = new Float32Array(int16Array.length)
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0
      }

      const audioBuffer = ctx.createBuffer(1, float32Array.length, 24000)
      audioBuffer.getChannelData(0).set(float32Array)

      const sourceNode = ctx.createBufferSource()
      sourceNode.buffer = audioBuffer
      sourceNode.connect(ctx.destination)

      const currentTime = ctx.currentTime
      const startTime = Math.max(currentTime, nextPlaybackTimeRef.current)
      sourceNode.start(startTime)
      nextPlaybackTimeRef.current = startTime + audioBuffer.duration
      activeAudioSourcesRef.current.push(sourceNode)

      // Enter SPEAKING state while audio is playing
      setCurrentState(VOICE_STATES.SPEAKING)

      sourceNode.onended = () => {
        const idx = activeAudioSourcesRef.current.indexOf(sourceNode)
        if (idx !== -1) {
          activeAudioSourcesRef.current.splice(idx, 1)
        }
        // Return to LISTENING if all chunks finished and live session is still active
        if (activeAudioSourcesRef.current.length === 0 && isLiveModeActiveRef.current) {
          setCurrentState(VOICE_STATES.LISTENING)
        }
      }
    } catch (e) {
      console.warn('[GeminiLive] Error scheduling PCM playback:', e.message)
    }
  }, [])

  // Stop currently playing audio (e.g. on user barge-in)
  const stopAudioPlayback = useCallback(() => {
    activeAudioSourcesRef.current.forEach((src) => {
      try {
        src.stop()
      } catch {}
    })
    activeAudioSourcesRef.current = []
    if (outputAudioContextRef.current) {
      nextPlaybackTimeRef.current = outputAudioContextRef.current.currentTime
    }
    if (isLiveModeActiveRef.current) {
      setCurrentState(VOICE_STATES.LISTENING)
    }
  }, [])

  // Disconnect active Gemini Live session
  const stopLiveSession = useCallback(async () => {
    console.log('[GeminiLive] Stopping Live API session...')
    stopAudioPlayback()

    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.disconnect()
      } catch {}
      workletNodeRef.current = null
    }

    if (inputAudioContextRef.current) {
      try {
        await inputAudioContextRef.current.close()
      } catch {}
      inputAudioContextRef.current = null
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
    }

    if (liveSessionRef.current) {
      try {
        if (liveSessionRef.current.conn && typeof liveSessionRef.current.conn.close === 'function') {
          liveSessionRef.current.conn.close()
        }
      } catch {}
      liveSessionRef.current = null
    }

    setIsLiveActive(false)
    isLiveModeActiveRef.current = false
    setLiveStatusText('')
  }, [stopAudioPlayback])

  // Handle Gemini Live tool call (control_classroom_devices)
  const handleDeviceToolCall = useCallback(
    async (call) => {
      console.log('[GeminiLive] Function call: control_classroom_devices')
      setCurrentState(VOICE_STATES.PROCESSING)

      const { id, name, args } = call
      const callId = id || 'call_default'
      const toolName = name || 'control_classroom_devices'
      const rawActions = args?.actions

      const SUPPORTED_DEVICES = ['light', 'fan', 'projector']
      const SUPPORTED_ACTIONS = ['ON', 'OFF']

      // 1. Initial check: must be a non-empty array
      if (!Array.isArray(rawActions) || rawActions.length === 0) {
        console.warn('[GeminiLive] ⚠️ Rejected tool call: actions must be a non-empty array')
        if (liveSessionRef.current) {
          liveSessionRef.current.sendToolResponse({
            functionResponses: [
              {
                id: callId,
                name: toolName,
                response: { error: 'Actions must be a non-empty array' },
              },
            ],
          })
        }
        if (isLiveModeActiveRef.current) {
          setCurrentState(VOICE_STATES.LISTENING)
        }
        return
      }

      // 2. Normalization: Support BOTH Format A ({ device, action }) and Format B (JSON string)
      const normalizedActions = []
      for (let i = 0; i < rawActions.length; i++) {
        let entry = rawActions[i]

        if (typeof entry === 'string') {
          try {
            entry = JSON.parse(entry)
          } catch (parseErr) {
            console.warn(`[GeminiLive] ⚠️ Malformed JSON action string at index ${i}:`, entry)
            continue
          }
        }

        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          normalizedActions.push(entry)
        }
      }

      // 3. Strict allowlist validation
      const validatedActions = []
      for (const item of normalizedActions) {
        const device = String(item.device || '').trim().toLowerCase()
        const action = String(item.action || '').trim().toUpperCase()

        if (SUPPORTED_DEVICES.includes(device) && SUPPORTED_ACTIONS.includes(action)) {
          validatedActions.push({
            device,
            action,
          })
        } else {
          console.warn(`[GeminiLive] ⚠️ Discarded unsupported action item:`, item)
        }
      }

      if (validatedActions.length === 0) {
        console.warn('[GeminiLive] ⚠️ Rejected tool call: no valid actions found after validation')
        if (liveSessionRef.current) {
          liveSessionRef.current.sendToolResponse({
            functionResponses: [
              {
                id: callId,
                name: toolName,
                response: { error: 'No valid device actions found' },
              },
            ],
          })
        }
        if (isLiveModeActiveRef.current) {
          setCurrentState(VOICE_STATES.LISTENING)
        }
        return
      }

      console.log(`[GeminiLive] Actions: ${validatedActions.length}`)

      // Display transcribed user intent if not already populated
      setLatestUserText(
        validatedActions
          .map((a) => `${a.action === 'ON' ? 'Turn on' : 'Turn off'} the ${a.device}`)
          .join(' and ')
      )

      // 4. Dispatch to backend POST /api/voice/live/command
      try {
        const response = await fetch(`${apiBaseUrl}/api/voice/live/command`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            actions: validatedActions,
            classroom,
          }),
        })

        const result = await response.json()

        if (response.ok && result.status === 'success') {
          const actionResults = result.data?.actions || []
          actionResults.forEach((act) => {
            console.log(
              `[GeminiLive] Device command result: ${act.device} ${act.action} -> ${act.delivered ? 'delivered' : 'failed'}`
            )
          })

          // Generate action result cards for EACH executed action
          const newCards = actionResults
            .filter((a) => a.success)
            .map((a) => ({
              id: `${a.device}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              device: a.device,
              action: a.action,
              status: 'success',
              timestamp: Date.now(),
              oppositeAction: getOppositeAction(a.action),
              isReverting: false,
              error: null,
            }))

          if (newCards.length > 0) {
            setActionCards((prev) => [...newCards, ...prev].slice(0, 6))
          }

          // Generate concise spoken summary for Gemini response preview
          const summary = actionResults
            .map((a) => `${a.device.charAt(0).toUpperCase() + a.device.slice(1)} is ${a.action.toLowerCase()}`)
            .join(' and ')
          if (summary) {
            setLatestGeminiText(`${summary}.`)
          }

          if (onCommandExecuted) {
            onCommandExecuted(result.data)
          }

          // 5. Return clean tool response to Gemini Live session
          if (liveSessionRef.current) {
            liveSessionRef.current.sendToolResponse({
              functionResponses: [
                {
                  id: callId,
                  name: toolName,
                  response: {
                    actions: actionResults.map((a) => ({
                      device: a.device,
                      action: a.action,
                      success: a.success,
                      message: a.message,
                    })),
                    allSucceeded: actionResults.every((a) => a.success),
                    partialFailure: actionResults.some((a) => !a.success) && actionResults.some((a) => a.success),
                  },
                },
              ],
            })
          }
        } else {
          throw new Error(result.message || 'Failed to execute device actions')
        }
      } catch (err) {
        console.error('[GeminiLive] ❌ Error executing live device command:', err.message)
        if (liveSessionRef.current) {
          liveSessionRef.current.sendToolResponse({
            functionResponses: [
              {
                id: callId,
                name: toolName,
                response: {
                  actions: validatedActions.map((a) => ({
                    device: a.device,
                    action: a.action,
                    success: false,
                  })),
                  error: err.message,
                },
              },
            ],
          })
        }
      } finally {
        if (isLiveModeActiveRef.current && activeAudioSourcesRef.current.length === 0) {
          setCurrentState(VOICE_STATES.LISTENING)
        }
      }
    },
    [apiBaseUrl, token, classroom, onCommandExecuted]
  )

  // Handle Gemini Live RGB tool call (set_classroom_rgb)
  const handleRgbToolCall = useCallback(
    async (call) => {
      console.log('[GeminiLive] Function call: set_classroom_rgb')
      setCurrentState(VOICE_STATES.PROCESSING)

      const { id, name, args } = call
      const callId = id || 'call_rgb_default'
      const toolName = name || 'set_classroom_rgb'

      const device = String(args?.device || 'projector').trim().toLowerCase()
      const rawColor = args?.color?.name || args?.colorName || args?.color || 'purple'
      const power = args?.power ? String(args.power).trim().toUpperCase() : 'ON'

      try {
        const response = await fetch(`${apiBaseUrl}/api/voice/live/rgb`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            device,
            color: rawColor,
            power,
            classroom,
          }),
        })

        const result = await response.json()

        if (response.ok && result.status === 'success') {
          const rgbData = result.data
          const newCard = {
            id: `rgb-${device}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            device: rgbData.device,
            action: power === 'OFF' ? 'OFF' : 'SET_COLOR',
            color: rgbData.color,
            status: 'success',
            timestamp: Date.now(),
            oppositeAction: power === 'OFF' ? 'ON' : 'OFF',
            isReverting: false,
            error: null,
          }

          setActionCards((prev) => [newCard, ...prev].slice(0, 6))
          setLatestGeminiText(
            power === 'OFF'
              ? 'Projector RGB light is OFF.'
              : `Projector RGB light set to ${rgbData.color?.name || 'custom color'}.`
          )

          if (onCommandExecuted) {
            onCommandExecuted(result.data)
          }

          if (liveSessionRef.current) {
            liveSessionRef.current.sendToolResponse({
              functionResponses: [
                {
                  id: callId,
                  name: toolName,
                  response: {
                    device: rgbData.device,
                    status: 'success',
                    power: rgbData.power,
                    color: rgbData.color,
                  },
                },
              ],
            })
          }
        } else {
          console.warn('[GeminiLive] RGB command error response:', result)
          if (liveSessionRef.current) {
            liveSessionRef.current.sendToolResponse({
              functionResponses: [
                {
                  id: callId,
                  name: toolName,
                  response: {
                    error: result.message || 'RGB command failed',
                    code: result.code || 'RGB_ERROR',
                  },
                },
              ],
            })
          }
        }
      } catch (err) {
        console.error('[GeminiLive] ❌ Error executing live RGB command:', err.message)
        if (liveSessionRef.current) {
          liveSessionRef.current.sendToolResponse({
            functionResponses: [
              {
                id: callId,
                name: toolName,
                response: { error: 'Network error communicating with classroom controller' },
              },
            ],
          })
        }
      } finally {
        if (isLiveModeActiveRef.current && activeAudioSourcesRef.current.length === 0) {
          setCurrentState(VOICE_STATES.LISTENING)
        }
      }
    },
    [apiBaseUrl, token, classroom, onCommandExecuted]
  )

  // Handle get_classroom_device_state tool call for live state queries
  const handleGetStateToolCall = useCallback(
    async (call) => {
      console.log('[GeminiLive] Function call: get_classroom_device_state')
      setCurrentState(VOICE_STATES.PROCESSING)

      const { id, name, args } = call
      const callId = id || 'call_state_default'
      const toolName = name || 'get_classroom_device_state'
      const device = String(args?.device || 'all').trim().toLowerCase()

      try {
        const response = await fetch(
          `${apiBaseUrl}/api/voice/live/state?classroom=${encodeURIComponent(classroom)}&device=${encodeURIComponent(device)}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          }
        )

        const result = await response.json()
        const stateData = result?.data || {}

        if (liveSessionRef.current) {
          liveSessionRef.current.sendToolResponse({
            functionResponses: [
              {
                id: callId,
                name: toolName,
                response: {
                  classroom,
                  device,
                  state: stateData,
                  success: true,
                },
              },
            ],
          })
        }
      } catch (err) {
        console.error('[GeminiLive] Error retrieving state tool response:', err.message)
        if (liveSessionRef.current) {
          liveSessionRef.current.sendToolResponse({
            functionResponses: [
              {
                id: callId,
                name: toolName,
                response: {
                  classroom,
                  device,
                  error: 'Could not retrieve hardware state from classroom controller.',
                  success: false,
                },
              },
            ],
          })
        }
      } finally {
        if (isLiveModeActiveRef.current && activeAudioSourcesRef.current.length === 0) {
          setCurrentState(VOICE_STATES.LISTENING)
        }
      }
    },
    [apiBaseUrl, token, classroom]
  )

  // Handle incoming messages from Gemini Live WebSocket
  const handleLiveServerMessage = useCallback(
    (msg) => {
      // 1. Tool call received from server (primary path)
      if (msg.toolCall?.functionCalls) {
        for (const call of msg.toolCall.functionCalls) {
          if (call.name === 'set_classroom_rgb') {
            handleRgbToolCall(call)
          } else if (call.name === 'control_classroom_devices') {
            handleDeviceToolCall(call)
          } else if (call.name === 'get_classroom_device_state') {
            handleGetStateToolCall(call)
          }
        }
      }

      // 2. User speech activity detected by server
      if (msg.serverContent?.userTurn) {
        console.log('[GeminiLive] 🗣️ User speech activity detected')
      }

      // 3. Model response parts received
      if (msg.serverContent?.modelTurn?.parts) {
        for (const part of msg.serverContent.modelTurn.parts) {
          if (part.functionCall) {
            if (part.functionCall.name === 'set_classroom_rgb') {
              handleRgbToolCall(part.functionCall)
            } else if (part.functionCall.name === 'control_classroom_devices') {
              handleDeviceToolCall(part.functionCall)
            } else if (part.functionCall.name === 'get_classroom_device_state') {
              handleGetStateToolCall(part.functionCall)
            }
          }
          if (part.inlineData && part.inlineData.data) {
            playPcmChunk(part.inlineData.data)
          }
          if (part.text) {
            setLatestGeminiText(part.text)
          }
        }
      }

      // 4. Model turn interrupted by user speech (barge-in)
      if (msg.serverContent?.interrupted) {
        console.log('[GeminiLive] ⚡ Gemini response interrupted by user speech')
        stopAudioPlayback()
      }

      // 5. Model turn complete
      if (msg.serverContent?.turnComplete) {
        if (activeAudioSourcesRef.current.length === 0 && isLiveModeActiveRef.current) {
          setCurrentState(VOICE_STATES.LISTENING)
        }
      }
    },
    [handleDeviceToolCall, handleRgbToolCall, playPcmChunk, stopAudioPlayback]
  )

  // Start Gemini Live API Session
  const startLiveSession = useCallback(async () => {
    console.log('[GeminiLive] 🚀 Initiating Gemini Live session...')
    setErrorMessage('')
    setCurrentState(VOICE_STATES.PROCESSING)

    // 1. Request microphone permission
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })
    micStreamRef.current = micStream

    // 2. Request short-lived ephemeral token from backend
    const tokenRes = await fetch(`${apiBaseUrl}/api/voice/live/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

    const tokenData = await tokenRes.json()
    if (!tokenRes.ok || tokenData.status !== 'success' || !tokenData.data?.token) {
      throw new Error(tokenData.message || 'Failed to obtain Gemini Live session token from backend.')
    }
    const ephemeralToken = tokenData.data.token

    // 3. Initialize GoogleGenAI with ephemeral token
    const ai = new GoogleGenAI({
      apiKey: ephemeralToken,
      httpOptions: { apiVersion: 'v1alpha' },
    })

    // 4. Create and initialize input AudioContext (16kHz PCM capture)
    const inputCtx = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000,
    })
    inputAudioContextRef.current = inputCtx

    // Load AudioWorklet processor module
    try {
      await inputCtx.audioWorklet.addModule(audioProcessorUrl)
    } catch {
      const blob = new Blob([WORKLET_INLINE_CODE], { type: 'application/javascript' })
      const blobUrl = URL.createObjectURL(blob)
      await inputCtx.audioWorklet.addModule(blobUrl)
      URL.revokeObjectURL(blobUrl)
    }

    const sourceNode = inputCtx.createMediaStreamSource(micStream)
    const workletNode = new AudioWorkletNode(inputCtx, 'gemini-live-audio-processor')
    workletNodeRef.current = workletNode

    // Stream PCM audio chunks continuously to Gemini Live session
    workletNode.port.onmessage = (event) => {
      if (!liveSessionRef.current) return
      const pcmBuffer = event.data
      const base64Data = arrayBufferToBase64(pcmBuffer)
      try {
        liveSessionRef.current.sendRealtimeInput({
          media: {
            mimeType: 'audio/pcm;rate=16000',
            data: base64Data,
          },
        })
      } catch (err) {
        console.warn('[GeminiLive] Failed to send real-time audio chunk:', err.message)
      }
    }

    const silentGain = inputCtx.createGain()
    silentGain.gain.value = 0
    sourceNode.connect(workletNode)
    workletNode.connect(silentGain)
    silentGain.connect(inputCtx.destination)

    const backendInstructionText = tokenData.data?.systemInstruction?.parts?.[0]?.text || tokenData.data?.systemInstruction
    const systemInstructionText = typeof backendInstructionText === 'string' ? backendInstructionText : LIVE_SYSTEM_INSTRUCTION
    const toolsToUse = (tokenData.data?.tools && Array.isArray(tokenData.data.tools) && tokenData.data.tools.length > 0)
      ? tokenData.data.tools
      : [CONTROL_CLASSROOM_DEVICES_TOOL, SET_CLASSROOM_RGB_TOOL, GET_CLASSROOM_DEVICE_STATE_TOOL]

    // 5. Connect Gemini Live Session with backend tools
    const session = await ai.live.connect({
      model: tokenData.data?.model || LIVE_MODEL,
      config: {
        responseModalities: ['AUDIO'],
        systemInstruction: {
          parts: [{ text: systemInstructionText }],
        },
        tools: toolsToUse,
        sessionResumption: {},
      },
      callbacks: {
        onopen: () => {
          console.log('[GeminiLive] 🌐 Gemini Live WebSocket connection opened successfully')
          setIsLiveActive(true)
          isLiveModeActiveRef.current = true
          setCurrentState(VOICE_STATES.LISTENING)
          setLiveStatusText('Connected to Gemini Live. Speak naturally...')
        },
        onmessage: (msg) => {
          handleLiveServerMessage(msg)
        },
        onerror: (err) => {
          console.warn('[GeminiLive] ⚠️ Gemini Live WebSocket error:', err)
        },
        onclose: (e) => {
          console.log('[GeminiLive] 🔌 Gemini Live WebSocket connection closed')
          setIsLiveActive(false)
          isLiveModeActiveRef.current = false
          if (currentState !== VOICE_STATES.ERROR) {
            setCurrentState(VOICE_STATES.IDLE)
          }
        },
      },
    })

    liveSessionRef.current = session
  }, [apiBaseUrl, token, handleLiveServerMessage, currentState])

  // Initialize SpeechRecognition on mount (Fallback Engine)
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setIsSupported(false)
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.lang = 'en-US'
      recognition.continuous = false
      recognition.interimResults = true
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        isSpeechEndedRef.current = false
        setCurrentState(VOICE_STATES.LISTENING)
        setErrorMessage('')
      }

      recognition.onresult = (event) => {
        let final = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript
          }
        }
        if (final) {
          setLatestUserText(final.trim())
        }
      }

      recognition.onspeechend = () => {
        isSpeechEndedRef.current = true
        recognition.stop()
      }

      recognition.onerror = (event) => {
        console.warn('[VoiceAssistant] Web Speech Recognition error:', event.error)
        let friendly = 'Voice recognition error occurred. Please try again.'
        if (event.error === 'not-allowed') {
          friendly = 'Microphone permission was denied. Please allow microphone access in your browser.'
        } else if (event.error === 'no-speech') {
          friendly = 'No speech was detected. Tap to speak again.'
        }
        setErrorMessage(friendly)
        setCurrentState(VOICE_STATES.ERROR)
      }

      recognition.onend = () => {
        if (!isSpeechEndedRef.current && currentState === VOICE_STATES.LISTENING) {
          setCurrentState(VOICE_STATES.IDLE)
        }
      }

      recognitionRef.current = recognition
    } catch (err) {
      console.error('[VoiceAssistant] Failed to instantiate SpeechRecognition:', err)
      setIsSupported(false)
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch {}
      }
      stopLiveSession()
    }
  }, [stopLiveSession, currentState])

  // Fallback Web Speech execution: Dispatches transcript to /api/voice/command
  const sendTranscriptToBackend = useCallback(
    async (commandText) => {
      if (!commandText || !commandText.trim()) {
        setCurrentState(VOICE_STATES.IDLE)
        return
      }

      setCurrentState(VOICE_STATES.PROCESSING)
      setLatestUserText(commandText.trim())

      try {
        const response = await fetch(`${apiBaseUrl}/api/voice/command`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            transcript: commandText.trim(),
            classroom,
          }),
        })

        const result = await response.json()

        if (response.ok && result.status === 'success') {
          const data = result.data
          const messageText = data.humanReadableMessage || data.message || 'Command executed.'
          setLatestGeminiText(messageText)

          if (data.intent === 'DEVICE_CONTROL' && data.executionStatus === 'EXECUTED' && data.device && data.action) {
            const newCard = {
              id: `${data.device}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              device: data.device,
              action: data.action,
              status: 'success',
              timestamp: Date.now(),
              oppositeAction: getOppositeAction(data.action),
              isReverting: false,
              error: null,
            }
            setActionCards((prev) => [newCard, ...prev].slice(0, 6))
          }

          if (onCommandExecuted) {
            onCommandExecuted(data)
          }

          setCurrentState(VOICE_STATES.IDLE)
        } else {
          setErrorMessage(result.message || 'Voice command could not be processed.')
          setCurrentState(VOICE_STATES.ERROR)
        }
      } catch (err) {
        setErrorMessage(err.message || 'Network error executing voice command.')
        setCurrentState(VOICE_STATES.ERROR)
      }
    },
    [apiBaseUrl, token, classroom, onCommandExecuted]
  )

  // Start listening handler: tries Gemini Live first, falls back to Web Speech
  const handleStartListening = async () => {
    setErrorMessage('')

    if (LIVE_VOICE_ENABLED) {
      try {
        await startLiveSession()
        return
      } catch (err) {
        console.warn('[VoiceAssistant] ⚠️ Gemini Live connection failed, engaging Web Speech fallback:', err.message)
      }
    }

    // Web Speech Fallback path
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start()
      } catch (err) {
        setErrorMessage('Failed to start microphone. Please check permissions.')
        setCurrentState(VOICE_STATES.ERROR)
      }
    } else {
      setErrorMessage('Speech recognition is not available in this browser.')
      setCurrentState(VOICE_STATES.ERROR)
    }
  }

  // Stop listening handler
  const handleStopListening = async () => {
    if (isLiveModeActiveRef.current) {
      setCurrentState(VOICE_STATES.PROCESSING)
      await stopLiveSession()
      setTimeout(() => {
        setCurrentState(VOICE_STATES.IDLE)
      }, 400)
      return
    }

    if (recognitionRef.current) {
      try {
        isSpeechEndedRef.current = true
        recognitionRef.current.stop()
        if (latestUserText) {
          sendTranscriptToBackend(latestUserText)
        } else {
          setCurrentState(VOICE_STATES.IDLE)
        }
      } catch {
        setCurrentState(VOICE_STATES.IDLE)
      }
    }
  }

  // Handle opposite action click on an action card
  const handleOppositeAction = async (cardId) => {
    const card = actionCards.find((c) => c.id === cardId)
    if (!card || card.isReverting) return

    const targetDevice = card.device
    const targetOpposite = card.oppositeAction // e.g. "OFF" if currently "ON", "ON" if currently "OFF"

    // Set loading indicator on this specific card
    setActionCards((prev) =>
      prev.map((c) =>
        c.id === cardId ? { ...c, isReverting: true, error: null } : c
      )
    )

    try {
      // Dispatch through the existing backend device command architecture (POST /api/voice/live/command)
      const res = await fetch(`${apiBaseUrl}/api/voice/live/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          actions: [{ device: targetDevice, action: targetOpposite }],
          classroom,
        }),
      })

      const data = await res.json()
      const actionResult = data.data?.actions?.[0]

      if (res.ok && data.status === 'success' && actionResult?.success) {
        // Success: update the card to the new state and toggle oppositeAction
        setActionCards((prev) =>
          prev.map((c) =>
            c.id === cardId
              ? {
                  ...c,
                  action: targetOpposite,
                  oppositeAction: getOppositeAction(targetOpposite),
                  isReverting: false,
                  error: null,
                  timestamp: Date.now(),
                }
              : c
          )
        )

        const devName = targetDevice.charAt(0).toUpperCase() + targetDevice.slice(1)
        setLatestGeminiText(`${devName} turned ${targetOpposite}.`)

        if (onCommandExecuted) {
          onCommandExecuted({
            executionStatus: 'EXECUTED',
            message: `${targetDevice.toUpperCase()} ${targetOpposite} command sent.`,
          })
        }
      } else {
        throw new Error(
          actionResult?.message || data.message || `Failed to turn ${targetDevice} ${targetOpposite}`
        )
      }
    } catch (err) {
      console.error(`[VoiceAssistant] Failed opposite action for ${targetDevice}:`, err.message)
      // Error handling (Requirement 12): Keep original state, display error
      setActionCards((prev) =>
        prev.map((c) =>
          c.id === cardId
            ? {
                ...c,
                isReverting: false,
                error: `Failed to turn ${targetDevice} ${targetOpposite}`,
              }
            : c
        )
      )
    }
  }

  // End conversation handler
  const handleEndConversation = async () => {
    stopAudioPlayback()
    if (isLiveModeActiveRef.current) {
      await stopLiveSession()
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
    }
    setCurrentState(VOICE_STATES.ENDED)
  }

  // Central orb click handler
  const handleOrbClick = () => {
    if (currentState === VOICE_STATES.IDLE || currentState === VOICE_STATES.ENDED) {
      handleStartListening()
    } else if (currentState === VOICE_STATES.LISTENING) {
      handleStopListening()
    } else if (currentState === VOICE_STATES.SPEAKING) {
      stopAudioPlayback()
    } else if (currentState === VOICE_STATES.ERROR) {
      handleRetry()
    }
  }

  // Retry handler
  const handleRetry = () => {
    setErrorMessage('')
    setCurrentState(VOICE_STATES.IDLE)
    stopLiveSession()
  }

  return (
    <div
      className={`relative w-full overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 border border-slate-800 text-white shadow-2xl ${
        isEmbedded ? 'p-5 sm:p-6' : 'p-6 sm:p-8'
      }`}
    >
      {/* Background ambient radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="relative z-10 flex items-center justify-between pb-4 border-b border-slate-800/80 text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/90 border border-slate-700/70 text-slate-300 font-medium">
            <span
              className={`w-2 h-2 rounded-full ${
                isLiveActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
              }`}
            />
            <span>{isLiveActive ? 'Gemini Live' : 'Voice Mode'}</span>
          </span>
          <span className="text-slate-400 font-medium">{classroom}</span>
        </div>

        <div className="flex items-center gap-2">
          {currentState !== VOICE_STATES.IDLE && currentState !== VOICE_STATES.ENDED && (
            <button
              type="button"
              onClick={handleEndConversation}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            >
              <Square className="w-3 h-3 text-rose-400 fill-rose-400" />
              <span>End conversation</span>
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Close Voice Assistant"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Voice Center: Orb & State Announcement */}
      <div className="relative z-10 py-6 sm:py-8 flex flex-col items-center justify-center text-center">
        {/* The Central Visual Orb */}
        <div className="relative flex items-center justify-center">
          {/* Ambient wave animations for LISTENING */}
          {currentState === VOICE_STATES.LISTENING && (
            <>
              <span className="absolute -inset-4 rounded-full bg-cyan-400/20 animate-ping pointer-events-none" />
              <span className="absolute -inset-2 rounded-full bg-indigo-500/30 animate-pulse pointer-events-none" />
            </>
          )}

          {/* Ambient glow for SPEAKING */}
          {currentState === VOICE_STATES.SPEAKING && (
            <>
              <span className="absolute -inset-3 rounded-full bg-emerald-400/25 animate-pulse pointer-events-none" />
            </>
          )}

          {/* Ambient glow for PROCESSING */}
          {currentState === VOICE_STATES.PROCESSING && (
            <>
              <span className="absolute -inset-3 rounded-full bg-purple-500/25 animate-pulse pointer-events-none" />
            </>
          )}

          {/* Interactive Core Orb */}
          <button
            type="button"
            onClick={handleOrbClick}
            disabled={currentState === VOICE_STATES.PROCESSING}
            className={`relative z-10 w-28 h-28 sm:w-32 sm:h-32 rounded-full flex items-center justify-center text-white transition-all cursor-pointer active:scale-95 shadow-2xl ${
              currentState === VOICE_STATES.IDLE
                ? 'bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 shadow-indigo-500/30 hover:scale-105'
                : currentState === VOICE_STATES.LISTENING
                ? 'bg-gradient-to-tr from-sky-500 via-indigo-500 to-purple-600 shadow-cyan-500/40 hover:scale-105'
                : currentState === VOICE_STATES.PROCESSING
                ? 'bg-gradient-to-tr from-purple-600 via-indigo-600 to-amber-500 shadow-purple-500/40 animate-pulse cursor-wait'
                : currentState === VOICE_STATES.SPEAKING
                ? 'bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 shadow-emerald-500/40 hover:scale-105'
                : currentState === VOICE_STATES.ERROR
                ? 'bg-gradient-to-tr from-rose-600 via-amber-600 to-red-600 shadow-rose-500/30 hover:scale-105'
                : 'bg-slate-800 border-2 border-slate-700 text-slate-300 hover:border-slate-500 hover:scale-105'
            }`}
            title={
              currentState === VOICE_STATES.IDLE
                ? 'Tap to speak'
                : currentState === VOICE_STATES.LISTENING
                ? 'Listening... Tap when done'
                : currentState === VOICE_STATES.SPEAKING
                ? 'Gemini is speaking... Tap to interrupt'
                : 'Voice Assistant'
            }
          >
            {currentState === VOICE_STATES.IDLE && (
              <Mic className="w-10 h-10 transition-transform group-hover:scale-110" />
            )}
            {currentState === VOICE_STATES.LISTENING && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-6 bg-white rounded-full animate-pulse" />
                <span className="w-1.5 h-10 bg-white rounded-full animate-pulse" />
                <span className="w-1.5 h-7 bg-white rounded-full animate-pulse" />
                <span className="w-1.5 h-4 bg-white rounded-full animate-pulse" />
              </div>
            )}
            {currentState === VOICE_STATES.PROCESSING && (
              <Sparkles className="w-10 h-10 animate-spin text-amber-200" />
            )}
            {currentState === VOICE_STATES.SPEAKING && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-5 bg-white rounded-full animate-pulse" />
                <span className="w-1.5 h-9 bg-white rounded-full animate-pulse" />
                <span className="w-1.5 h-12 bg-white rounded-full animate-pulse" />
                <span className="w-1.5 h-8 bg-white rounded-full animate-pulse" />
                <span className="w-1.5 h-4 bg-white rounded-full animate-pulse" />
              </div>
            )}
            {currentState === VOICE_STATES.ERROR && (
              <AlertTriangle className="w-10 h-10 text-white" />
            )}
            {currentState === VOICE_STATES.ENDED && (
              <RotateCcw className="w-9 h-9 text-slate-300" />
            )}
          </button>
        </div>

        {/* State Headline & Subtitle */}
        <div className="mt-4 sm:mt-5">
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            {currentState === VOICE_STATES.IDLE && 'Tap to speak'}
            {currentState === VOICE_STATES.LISTENING && 'Listening...'}
            {currentState === VOICE_STATES.PROCESSING && 'Thinking...'}
            {currentState === VOICE_STATES.SPEAKING && 'Gemini is speaking...'}
            {currentState === VOICE_STATES.ERROR && 'Voice Error'}
            {currentState === VOICE_STATES.ENDED && 'Conversation ended'}
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            {currentState === VOICE_STATES.IDLE &&
              `Classroom ${classroom} • Controls light, fan, projector`}
            {currentState === VOICE_STATES.LISTENING &&
              'Speak naturally in English. Tap orb when finished.'}
            {currentState === VOICE_STATES.PROCESSING &&
              'Executing classroom command and updating hardware...'}
            {currentState === VOICE_STATES.SPEAKING &&
              'Tap orb anytime to interrupt or speak again.'}
            {currentState === VOICE_STATES.ERROR &&
              (errorMessage || 'Microphone or connection error occurred.')}
            {currentState === VOICE_STATES.ENDED &&
              'Tap the button to start a new voice session.'}
          </p>

          {currentState === VOICE_STATES.ERROR && (
            <button
              type="button"
              onClick={handleRetry}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
              <span>Retry</span>
            </button>
          )}
        </div>
      </div>

      {/* Latest Spoken Transcript Area (Concise, Secondary) */}
      {(latestUserText || latestGeminiText) && (
        <div className="relative z-10 w-full max-w-md mx-auto p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700/50 text-xs text-left shadow-sm space-y-2 mb-4">
          {latestUserText && (
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 w-12 shrink-0 pt-0.5">
                You
              </span>
              <span className="text-white font-medium italic break-words">
                "{latestUserText}"
              </span>
            </div>
          )}
          {latestGeminiText && (
            <div className="flex items-start gap-2 border-t border-slate-700/40 pt-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 w-12 shrink-0 pt-0.5">
                Gemini
              </span>
              <span className="text-slate-200 break-words font-medium">
                "{latestGeminiText}"
              </span>
            </div>
          )}
        </div>
      )}

      {/* ACTION RESULT CARDS (Compact transient notifications) */}
      {actionCards.length > 0 && (
        <div className="relative z-10 w-full max-w-sm mx-auto space-y-1.5 pt-2">
          {actionCards.map((card) => {
            const isRgb = card.action === 'SET_COLOR' || !!card.color
            const isCurrentlyOn = card.action.toUpperCase() === 'ON' || isRgb
            const devName = card.device.charAt(0).toUpperCase() + card.device.slice(1)
            const colorLabel = card.color?.name
              ? card.color.name.charAt(0).toUpperCase() + card.color.name.slice(1)
              : 'Purple'
            const displayLabel = isRgb
              ? `${devName} ${colorLabel}`
              : `${devName} ${card.action.toUpperCase()}`
            const reverseLabel = card.oppositeAction || (isRgb ? 'WHITE' : 'OFF')

            return (
              <div
                key={card.id}
                className="compact-action-badge flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/80 backdrop-blur-md border border-slate-700/60 shadow-lg text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isRgb ? (
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm animate-pulse"
                      style={{
                        backgroundColor: card.color?.hex || '#a855f7',
                        boxShadow: `0 0 8px ${card.color?.hex || '#a855f7'}`,
                      }}
                    />
                  ) : (
                    <CheckCircle2
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isCurrentlyOn ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    />
                  )}
                  <span className="font-semibold text-slate-200 truncate">
                    {displayLabel}
                  </span>
                </div>

                {/* Compact Opposite Action Button */}
                <button
                  type="button"
                  disabled={card.isReverting}
                  onClick={() => handleOppositeAction(card.id)}
                  className="ml-2 px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-60 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600/50 hover:border-slate-500"
                  title={`Switch ${card.device} to ${reverseLabel}`}
                >
                  {card.isReverting ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin text-indigo-400" />
                  ) : (
                    <span>[{reverseLabel}]</span>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Suggested Spoken Commands (When Idle) */}
      {currentState === VOICE_STATES.IDLE && (
        <div className="relative z-10 pt-4 flex flex-wrap items-center justify-center gap-1.5 max-w-sm mx-auto">
          {SAMPLE_COMMANDS.map((phrase) => (
            <button
              key={phrase}
              type="button"
              onClick={() => {
                handleStartListening()
              }}
              className="px-2.5 py-1 rounded-full bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-[11px] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer font-sans"
            >
              "{phrase}"
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
