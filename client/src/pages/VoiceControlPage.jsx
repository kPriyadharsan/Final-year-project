import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  Mic,
  MicOff,
  RotateCcw,
  Zap,
  Lightbulb,
  Fan,
  Monitor,
  AlertTriangle,
  Loader2,
  Sparkles,
  Volume2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSocketEvent } from '../context/SocketContext'
import { API_BASE_URL } from '../config/api'
import { GoogleGenAI, Type } from '@google/genai'
import audioProcessorUrl from '../components/voice/geminiLiveAudioProcessor.js?url'

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

RESPONSE STYLE:
Keep voice responses extremely concise (1 short sentence max). Never give long explanations.`

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

function arrayBufferToBase64(buffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

const VOICE_STATES = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking',
  ERROR: 'error',
}

function getOppositeAction(action) {
  return String(action).toUpperCase() === 'ON' ? 'OFF' : 'ON'
}

function getDeviceIcon(device) {
  const d = String(device || '').toLowerCase()
  if (d === 'light') return Lightbulb
  if (d === 'fan') return Fan
  if (d === 'projector') return Monitor
  return Zap
}

const CHATGPT_VOICES = [
  { id: 'breeze', name: 'Breeze', desc: 'Calm and balanced' },
  { id: 'cove', name: 'Cove', desc: 'Direct and clear' },
  { id: 'ember', name: 'Ember', desc: 'Confident and thoughtful' },
  { id: 'juniper', name: 'Juniper', desc: 'Open and upbeat' },
  { id: 'sol', name: 'Sol', desc: 'Natural and easygoing' },
  { id: 'vale', name: 'Vale', desc: 'Bright and curious' },
]

export function VoiceControlPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const apiBaseUrl = API_BASE_URL
  const classroom = 'Room 302'

  // Voice Persona selection (default index 3 = Juniper, matching user reference image)
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState(3)
  const currentVoice = CHATGPT_VOICES[selectedVoiceIndex]

  // Live state
  const [currentState, setCurrentState] = useState(VOICE_STATES.IDLE)
  const [isLiveActive, setIsLiveActive] = useState(false)
  const [activeEngine, setActiveEngine] = useState('idle') // 'gemini' | 'webspeech' | 'idle'
  const [statusMessage, setStatusMessage] = useState('Tap the orb to start speaking')
  const [liveTranscript, setLiveTranscript] = useState('')
  const [actionCards, setActionCards] = useState([])
  const [errorMessage, setErrorMessage] = useState('')
  const [isMuted, setIsMuted] = useState(false)
  const [micVolume, setMicVolume] = useState(0) // Live volume meter 0..100

  // Confirmed hardware telemetry states directly synchronized from ESP32 & backend
  const [projectorState, setProjectorState] = useState('OFF')
  const [rgbPower, setRgbPower] = useState('OFF')
  const [rgbColor, setRgbColor] = useState({ name: 'purple', hex: '#A855F7', r: 168, g: 85, b: 247 })

  // Fetch initial confirmed device status from backend
  useEffect(() => {
    let isMounted = true
    async function fetchInitialStatus() {
      try {
        const res = await fetch(`${apiBaseUrl}/api/devices?classroom=${encodeURIComponent(classroom)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const data = await res.json()
        if (isMounted && res.ok && data.status === 'success' && Array.isArray(data.data)) {
          const proj = data.data.find((d) => d.type === 'PROJECTOR' || d.type === 'projector')
          if (proj) {
            setProjectorState(proj.state || 'OFF')
            if (proj.colorPower) setRgbPower(proj.colorPower)
            if (proj.color) setRgbColor(proj.color)
          }
        }
      } catch (err) {
        console.warn('[VoiceControlPage] Notice: Could not fetch initial device status:', err.message)
      }
    }
    fetchInitialStatus()
    return () => {
      isMounted = false
    }
  }, [apiBaseUrl, token, classroom])

  // Listen for real-time telemetry broadcasts from ESP32 via backend Socket.IO
  useSocketEvent('device:status', (data) => {
    if (!data) return
    const isProjector = data.type === 'PROJECTOR' || String(data.deviceId || '').toLowerCase().includes('proj')
    if (isProjector) {
      if (data.state) setProjectorState(data.state)
    }
  })

  useSocketEvent('device:color', (data) => {
    if (!data) return
    const isProjector = data.type === 'PROJECTOR' || String(data.deviceId || '').toLowerCase().includes('proj')
    if (isProjector) {
      if (data.colorPower) setRgbPower(data.colorPower)
      if (data.color) setRgbColor(data.color)
    }
  })

  // Live Audio Refs
  const liveSessionRef = useRef(null)
  const micStreamRef = useRef(null)
  const inputAudioContextRef = useRef(null)
  const outputAudioContextRef = useRef(null)
  const workletNodeRef = useRef(null)
  const analyserRef = useRef(null)
  const animFrameRef = useRef(null)
  const nextPlaybackTimeRef = useRef(0)
  const activeAudioSourcesRef = useRef([])
  const isLiveModeActiveRef = useRef(false)
  const isMutedRef = useRef(false)

  // Web Speech Fallback Ref
  const recognitionRef = useRef(null)

  // Real-time audio analyser loop to detect user voice amplitude
  const startVolumeAnalyser = useCallback((stream) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.5
      source.connect(analyser)
      analyserRef.current = { audioCtx, analyser }

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const checkVolume = () => {
        if (!analyserRef.current) return
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]
        }
        const avg = sum / dataArray.length
        setMicVolume(Math.min(100, Math.round((avg / 128) * 100)))
        animFrameRef.current = requestAnimationFrame(checkVolume)
      }
      checkVolume()
    } catch (e) {
      console.warn('[VoiceControlPage] Analyser error:', e.message)
    }
  }, [])

  const stopVolumeAnalyser = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.audioCtx.close()
      } catch {}
      analyserRef.current = null
    }
    setMicVolume(0)
  }, [])

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

      setCurrentState(VOICE_STATES.SPEAKING)

      sourceNode.onended = () => {
        const idx = activeAudioSourcesRef.current.indexOf(sourceNode)
        if (idx !== -1) {
          activeAudioSourcesRef.current.splice(idx, 1)
        }
        if (activeAudioSourcesRef.current.length === 0 && isLiveModeActiveRef.current) {
          setCurrentState(VOICE_STATES.LISTENING)
          setStatusMessage('Listening... Speak now')
        }
      }
    } catch (e) {
      console.warn('[VoiceControlPage] Error playing PCM chunk:', e.message)
    }
  }, [])

  // Stop currently playing audio
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

  // Disconnect active session
  const stopLiveSession = useCallback(async () => {
    stopAudioPlayback()
    stopVolumeAnalyser()

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
      recognitionRef.current = null
    }

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
    setActiveEngine('idle')
    isLiveModeActiveRef.current = false
    setCurrentState(VOICE_STATES.IDLE)
    setStatusMessage('Voice session paused. Tap orb to speak.')
  }, [stopAudioPlayback, stopVolumeAnalyser])

  // Handle Gemini Live tool call (control_classroom_devices)
  const handleDeviceToolCall = useCallback(
    async (call) => {
      setCurrentState(VOICE_STATES.PROCESSING)

      const { id, name, args } = call
      const callId = id || 'call_default'
      const toolName = name || 'control_classroom_devices'
      const rawActions = args?.actions

      const SUPPORTED_DEVICES = ['light', 'fan', 'projector']

      if (!Array.isArray(rawActions) || rawActions.length === 0) {
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
        if (isLiveModeActiveRef.current) setCurrentState(VOICE_STATES.LISTENING)
        return
      }

      // Normalization
      const normalizedActions = []
      for (let i = 0; i < rawActions.length; i++) {
        let entry = rawActions[i]
        if (typeof entry === 'string') {
          try {
            entry = JSON.parse(entry)
          } catch {
            continue
          }
        }
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          normalizedActions.push(entry)
        }
      }

      const validatedActions = []
      for (const item of normalizedActions) {
        const device = String(item.device || '').trim().toLowerCase()
        const action = String(item.action || '').trim().toUpperCase()
        const capability = item.capability ? String(item.capability).trim().toLowerCase() : undefined
        const color = item.color || item.colorName || undefined

        if (SUPPORTED_DEVICES.includes(device)) {
          if (action === 'ON' || action === 'OFF') {
            validatedActions.push({ device, capability: capability || 'power', action })
          } else if (action === 'SET_COLOR' && device === 'projector') {
            validatedActions.push({ device, capability: 'rgb', action: 'SET_COLOR', color: color || 'purple' })
          }
        }
      }

      if (validatedActions.length === 0) {
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
        if (isLiveModeActiveRef.current) setCurrentState(VOICE_STATES.LISTENING)
        return
      }

      // Update feedback transcript immediately
      const humanCommand = validatedActions
        .map((a) => {
          if (a.action === 'SET_COLOR') {
            return `Set ${a.device} to ${a.color || 'color'}`
          }
          return `${a.action === 'ON' ? 'Turn on' : 'Turn off'} ${a.device}`
        })
        .join(' & ')
      setLiveTranscript(humanCommand)
      setStatusMessage(`Executing: ${humanCommand}`)

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
          const newCards = actionResults
            .filter((a) => a.success)
            .map((a) => ({
              id: `${a.device}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              device: a.device,
              action: a.action,
              color: a.color,
              status: 'success',
              timestamp: Date.now(),
              oppositeAction: a.action === 'SET_COLOR' ? 'OFF' : getOppositeAction(a.action),
              isReverting: false,
              error: null,
            }))

          if (newCards.length > 0) {
            setActionCards((prev) => [...newCards, ...prev].slice(0, 4))
          }

          const summary = actionResults
            .map((a) => `${a.device} is ${a.action.toLowerCase()}`)
            .join(', ')
          setStatusMessage(summary ? `Classroom: ${summary}` : 'Command completed')

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
          throw new Error(result.message || 'Failed to dispatch command')
        }
      } catch (err) {
        console.error('[VoiceControlPage] Error executing live device command:', err.message)
        setStatusMessage(`Command error: ${err.message}`)
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
    [apiBaseUrl, token, classroom]
  )

  // Handle dedicated set_classroom_rgb tool call
  const handleRgbToolCall = useCallback(
    async (call) => {
      setCurrentState(VOICE_STATES.PROCESSING)

      const { id, name, args } = call
      const callId = id || 'call_rgb_default'
      const toolName = name || 'set_classroom_rgb'

      const device = String(args?.device || 'projector').trim().toLowerCase()
      const rawColor = args?.color?.name || args?.colorName || args?.color || 'purple'
      const power = args?.power ? String(args.power).trim().toUpperCase() : 'ON'

      const colorLabel = typeof rawColor === 'object' ? rawColor.name || 'color' : rawColor
      const humanCommand = power === 'OFF' ? `Turn off ${device} RGB light` : `Set ${device} RGB to ${colorLabel}`
      setLiveTranscript(humanCommand)
      setStatusMessage(`Executing: ${humanCommand}`)

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

          setActionCards((prev) => [newCard, ...prev].slice(0, 4))
          setStatusMessage(
            power === 'OFF'
              ? 'Projector RGB light turned OFF'
              : `Projector RGB set to ${rgbData.color?.name || 'custom color'}`
          )

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
          setStatusMessage(result.message || 'RGB command failed')
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
        console.error('[GeminiLive] Error calling /api/voice/live/rgb:', err)
        setStatusMessage('Network error during RGB command')
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
    [apiBaseUrl, token, classroom]
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

  // Handle incoming live server messages
  const handleLiveServerMessage = useCallback(
    (msg) => {
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
            setLiveTranscript(part.text)
          }
        }
      }

      if (msg.serverContent?.interrupted) {
        stopAudioPlayback()
      }

      if (msg.serverContent?.turnComplete) {
        if (activeAudioSourcesRef.current.length === 0 && isLiveModeActiveRef.current) {
          setCurrentState(VOICE_STATES.LISTENING)
          setStatusMessage('Listening... Speak now')
        }
      }
    },
    [handleDeviceToolCall, handleRgbToolCall, handleGetStateToolCall, playPcmChunk, stopAudioPlayback]
  )

  // Fallback to Web Speech API if Gemini Live is unreachable
  const startWebSpeechFallback = useCallback(
    async (stream) => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SpeechRecognition) {
        setCurrentState(VOICE_STATES.ERROR)
        setErrorMessage('Speech recognition not supported in this browser.')
        return
      }

      try {
        if (!micStreamRef.current) {
          const micStream = stream || await navigator.mediaDevices.getUserMedia({ audio: true })
          micStreamRef.current = micStream
          startVolumeAnalyser(micStream)
        }

        const recognition = new SpeechRecognition()
        recognition.lang = 'en-US'
        recognition.continuous = true
        recognition.interimResults = true

        recognition.onstart = () => {
          setIsLiveActive(true)
          setActiveEngine('webspeech')
          isLiveModeActiveRef.current = true
          setCurrentState(VOICE_STATES.LISTENING)
          setStatusMessage('Listening (Ready) • Speak now')
        }

        recognition.onresult = async (event) => {
          let interimTranscript = ''
          let finalTranscript = ''

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript
            } else {
              interimTranscript += event.results[i][0].transcript
            }
          }

          const currentWords = finalTranscript || interimTranscript
          if (currentWords) {
            setLiveTranscript(currentWords)
            setStatusMessage(`Heard: "${currentWords}"`)
          }

          if (finalTranscript.trim()) {
            setCurrentState(VOICE_STATES.PROCESSING)
            setStatusMessage(`Executing: "${finalTranscript.trim()}"`)

            try {
              const res = await fetch(`${apiBaseUrl}/api/voice/command`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ transcript: finalTranscript.trim(), classroom }),
              })
              const data = await res.json()
              if (res.ok && data.status === 'success') {
                const dev = data.data?.device || 'device'
                const act = data.data?.action || 'command'
                setActionCards((prev) => [
                  {
                    id: `${dev}-${Date.now()}`,
                    device: dev,
                    action: act,
                    status: 'success',
                    timestamp: Date.now(),
                    oppositeAction: getOppositeAction(act),
                    isReverting: false,
                    error: null,
                  },
                  ...prev,
                ].slice(0, 4))
                setStatusMessage(`${dev.toUpperCase()} switched ${act}`)
              } else {
                setStatusMessage(data.message || 'Could not recognize command.')
              }
            } catch {
              setStatusMessage('Command dispatch failed.')
            } finally {
              if (isLiveModeActiveRef.current) {
                setTimeout(() => {
                  setCurrentState(VOICE_STATES.LISTENING)
                  setStatusMessage('Listening... Speak now')
                }, 1200)
              }
            }
          }
        }

        recognition.onerror = (e) => {
          console.warn('[VoiceControlPage] Web Speech error:', e.error)
          if (e.error === 'not-allowed') {
            setCurrentState(VOICE_STATES.ERROR)
            setErrorMessage('Microphone blocked. Please allow microphone in browser address bar.')
            setStatusMessage('Microphone access blocked')
          }
        }

        recognition.onend = () => {
          if (isLiveModeActiveRef.current && currentState !== VOICE_STATES.PROCESSING) {
            try {
              recognition.start()
            } catch {}
          }
        }

        recognitionRef.current = recognition
        recognition.start()
      } catch (err) {
        console.error('[VoiceControlPage] Web Speech start failure:', err)
        setCurrentState(VOICE_STATES.ERROR)
        setErrorMessage(err.message || 'Could not access microphone.')
      }
    },
    [apiBaseUrl, token, classroom, currentState, startVolumeAnalyser]
  )

  // Start Gemini Live connection
  const startLiveSession = useCallback(async () => {
    setErrorMessage('')
    setCurrentState(VOICE_STATES.CONNECTING)
    setStatusMessage('Connecting audio & microphone...')

    let micStream = null
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      micStreamRef.current = micStream
      startVolumeAnalyser(micStream)
    } catch (err) {
      console.warn('[VoiceControlPage] Mic access error:', err)
      setCurrentState(VOICE_STATES.ERROR)
      const isBlocked = err.name === 'NotAllowedError' || err.message?.includes('Permission denied')
      setErrorMessage(
        isBlocked
          ? 'Microphone blocked. Please click the lock icon in your browser address bar and set Microphone to "Allow".'
          : 'Could not access microphone hardware. Please check your system settings.'
      )
      setStatusMessage('Microphone access required')
      return
    }

    try {
      const tokenRes = await fetch(`${apiBaseUrl}/api/voice/live/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })

      const tokenData = await tokenRes.json()
      if (!tokenRes.ok || tokenData.status !== 'success' || !tokenData.data?.token) {
        throw new Error(tokenData.message || 'Ephemeral token unavailable.')
      }

      const ephemeralToken = tokenData.data.token
      const ai = new GoogleGenAI({
        apiKey: ephemeralToken,
        httpOptions: { apiVersion: 'v1alpha' },
      })

      const inputCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      })
      inputAudioContextRef.current = inputCtx
      if (inputCtx.state === 'suspended') {
        await inputCtx.resume()
      }

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

      workletNode.port.onmessage = (event) => {
        if (!liveSessionRef.current || isMutedRef.current) return
        const pcmBuffer = event.data
        const base64Data = arrayBufferToBase64(pcmBuffer)
        try {
          liveSessionRef.current.sendRealtimeInput({
            media: {
              mimeType: 'audio/pcm;rate=16000',
              data: base64Data,
            },
          })
        } catch {}
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
            setIsLiveActive(true)
            setActiveEngine('gemini')
            isLiveModeActiveRef.current = true
            setCurrentState(VOICE_STATES.LISTENING)
            setStatusMessage('Listening... Speak naturally')
          },
          onmessage: (msg) => {
            handleLiveServerMessage(msg)
          },
          onerror: (err) => {
            console.warn('[VoiceControlPage] Gemini Live error:', err)
          },
          onclose: () => {
            setIsLiveActive(false)
            isLiveModeActiveRef.current = false
            setCurrentState(VOICE_STATES.IDLE)
            setStatusMessage('Session closed. Tap orb to restart.')
          },
        },
      })

      liveSessionRef.current = session
    } catch (err) {
      console.warn('[VoiceControlPage] Gemini Live WebSocket unavailable, engaging Web Speech fallback:', err.message)
      startWebSpeechFallback(micStream)
    }
  }, [apiBaseUrl, token, handleLiveServerMessage, startWebSpeechFallback, startVolumeAnalyser])

  // Automatically start voice on mount
  useEffect(() => {
    startLiveSession()
    return () => {
      stopLiveSession()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle Orb Click: toggle session / mic
  const handleOrbClick = () => {
    if (currentState === VOICE_STATES.ERROR) {
      startLiveSession()
      return
    }

    if (isLiveActive) {
      if (currentState === VOICE_STATES.LISTENING) {
        setIsMuted((prev) => {
          const next = !prev
          isMutedRef.current = next
          setStatusMessage(next ? 'Microphone muted' : 'Listening... Speak now')
          return next
        })
      } else {
        stopAudioPlayback()
      }
    } else {
      startLiveSession()
    }
  }

  // Handle Opposite Action Toggle
  const handleRevertAction = async (cardId, targetDevice, oppositeAction) => {
    setActionCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, isReverting: true, error: null } : c))
    )

    try {
      const response = await fetch(`${apiBaseUrl}/api/voice/live/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          actions: [{ device: targetDevice, action: oppositeAction }],
          classroom,
        }),
      })

      const data = await response.json()

      if (response.ok && data.status === 'success') {
        const nextOpposite = getOppositeAction(oppositeAction)
        setActionCards((prev) =>
          prev.map((c) =>
            c.id === cardId
              ? {
                  ...c,
                  action: oppositeAction,
                  oppositeAction: nextOpposite,
                  isReverting: false,
                  status: 'success',
                  timestamp: Date.now(),
                }
              : c
          )
        )
        setStatusMessage(`${targetDevice.toUpperCase()} turned ${oppositeAction}`)
      } else {
        throw new Error(data.message || 'Opposite command failed')
      }
    } catch (err) {
      setActionCards((prev) =>
        prev.map((c) =>
          c.id === cardId
            ? { ...c, isReverting: false, error: err.message || 'Failed' }
            : c
        )
      )
    }
  }

  // Dynamically calculate dynamic orb glow scaling according to real voice input volume
  const voiceScale = currentState === VOICE_STATES.LISTENING && micVolume > 5
    ? 1 + (micVolume / 100) * 0.12
    : 1

  return (
    <div className="chatgpt-voice-page min-h-screen bg-black text-white flex flex-col justify-between items-center px-3 sm:px-6 py-4 sm:py-8 select-none relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-[120px] pointer-events-none" />
      </div>

      {/* 1. TOP HEADER */}
      <header className="w-full max-w-md flex items-center justify-between z-10 px-1 sm:px-0">
        <button
          onClick={() => navigate('/teacher')}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white/80 hover:text-white transition-all focus:outline-none cursor-pointer shrink-0"
          title="Back to Dashboard"
        >
          <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>

        <div className="text-center">
          <h1 className="text-sm font-semibold tracking-wide text-white/90">Smart Classroom</h1>
          <div className="flex items-center justify-center gap-1.5 mt-0.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isLiveActive
                  ? currentState === VOICE_STATES.SPEAKING
                    ? 'bg-emerald-400 animate-pulse'
                    : currentState === VOICE_STATES.PROCESSING
                    ? 'bg-purple-400 animate-pulse'
                    : 'bg-sky-400 animate-pulse'
                  : 'bg-amber-400'
              }`}
            />
            <span className="text-[11px] text-white/50 tracking-wider uppercase font-medium">
              {currentState === VOICE_STATES.SPEAKING
                ? 'Speaking'
                : currentState === VOICE_STATES.PROCESSING
                ? 'Thinking'
                : currentState === VOICE_STATES.LISTENING
                ? 'Listening'
                : isLiveActive
                ? 'Room 302'
                : 'Connecting Audio'}
            </span>
          </div>
        </div>

        <button
          onClick={() => {
            if (isLiveActive) {
              stopLiveSession()
            } else {
              startLiveSession()
            }
          }}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white/80 hover:text-white transition-all focus:outline-none cursor-pointer"
          title="Restart Voice Session"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </header>

      {/* 2. CENTER STAGE (Hero Celestial Orb + Minimal Ambient Feedback) */}
      <main className="flex-1 flex flex-col items-center justify-center w-full max-w-md my-auto z-10 text-center px-1 sm:px-2">
        {/* Subtle Hardware Telemetry & Voice Pill */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-4 sm:mb-6 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-3.5 py-1 rounded-full bg-white/[0.04] border border-white/5 text-[11px] backdrop-blur-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-white/40">Projector:</span>
              <span className={`font-semibold ${projectorState === 'ON' ? 'text-emerald-400' : 'text-white/40'}`}>
                {projectorState}
              </span>
            </div>
            {rgbPower === 'ON' && (
              <>
                <span className="w-1 h-1 rounded-full bg-white/20" />
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{
                      backgroundColor: rgbColor?.hex || '#A855F7',
                      boxShadow: `0 0 6px ${rgbColor?.hex || '#A855F7'}`,
                    }}
                  />
                  <span className="text-white/80 capitalize font-medium">{rgbColor?.name || 'RGB'}</span>
                </div>
              </>
            )}
          </div>

          {/* Voice selector minimal dots */}
          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/[0.04] border border-white/5">
            {CHATGPT_VOICES.map((voice, idx) => (
              <button
                key={voice.id}
                onClick={() => setSelectedVoiceIndex(idx)}
                className={`transition-all rounded-full cursor-pointer ${
                  idx === selectedVoiceIndex ? 'w-2 h-2 bg-white' : 'w-1 h-1 bg-white/20 hover:bg-white/40'
                }`}
                title={`Voice: ${voice.name}`}
              />
            ))}
          </div>
        </div>

        {/* Luminous Celestial Cloud Orb */}
        <div
          onClick={handleOrbClick}
          style={{ transform: `scale(${voiceScale})` }}
          className={`chatgpt-celestial-orb mx-auto relative cursor-pointer transition-transform duration-150 ${
            currentState === VOICE_STATES.LISTENING ? 'is-listening' : ''
          } ${currentState === VOICE_STATES.SPEAKING ? 'is-speaking' : ''} ${
            currentState === VOICE_STATES.PROCESSING ? 'is-processing' : ''
          }`}
          title="Tap to speak or mute"
        >
          <div className="chatgpt-orb-nebula" />
        </div>

        {/* Unobtrusive Minimal Voice Status */}
        <div className="mt-7 flex flex-col items-center gap-2 max-w-sm">
          <div className="text-sm font-medium tracking-wide transition-all">
            {currentState === VOICE_STATES.LISTENING && (
              <span className="text-sky-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping inline-block" />
                Listening...
              </span>
            )}
            {currentState === VOICE_STATES.PROCESSING && (
              <span className="text-purple-300 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                Thinking...
              </span>
            )}
            {currentState === VOICE_STATES.SPEAKING && (
              <span className="text-emerald-300 flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                Speaking...
              </span>
            )}
            {currentState === VOICE_STATES.IDLE && (
              <span className="text-white/40 flex items-center gap-1.5 font-normal text-xs tracking-wider">
                <Sparkles className="w-3 h-3 text-white/30" />
                Hey, classroom...
              </span>
            )}
            {currentState === VOICE_STATES.CONNECTING && (
              <span className="text-amber-300 flex items-center gap-2 text-xs">
                <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                Connecting audio...
              </span>
            )}
            {currentState === VOICE_STATES.ERROR && (
              <span className="text-rose-400 flex items-center gap-1.5 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                Microphone access needed
              </span>
            )}
          </div>

          {/* Subtitle / Live Transcript preview (Clean & Translucent) */}
          {liveTranscript && (
            <p className="text-xs text-white/70 italic px-3 py-1 bg-white/[0.04] rounded-full border border-white/5 max-w-[280px] sm:max-w-xs truncate animate-fadeIn">
              &ldquo;{liveTranscript}&rdquo;
            </p>
          )}

          {/* Permission / Error Helper */}
          {currentState === VOICE_STATES.ERROR && (
            <div className="mt-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-left text-xs text-rose-200 space-y-2">
              <p>{errorMessage}</p>
              <button
                onClick={startLiveSession}
                className="w-full py-1.5 px-3 bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 rounded-lg font-semibold text-center cursor-pointer transition-colors"
              >
                Grant Permission &amp; Retry
              </button>
            </div>
          )}
        </div>

        {/* 3. COMPACT TRANSIENT ACTION NOTIFICATIONS */}
        {actionCards.length > 0 && (
          <div className="w-full mt-4 sm:mt-5 space-y-2 max-h-36 overflow-y-auto px-1">
            {actionCards.map((card) => {
              const isOn = String(card.action).toUpperCase() === 'ON'
              const isRgb = card.action === 'SET_COLOR'
              return (
                <div
                  key={card.id}
                  className="compact-action-badge w-full flex items-center justify-between px-3 py-1.5 sm:px-3.5 rounded-full bg-white/[0.07] hover:bg-white/[0.10] border border-white/10 backdrop-blur-md shadow-sm transition-all"
                >
                  <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-medium text-white tracking-wide truncate mr-2">
                    {isRgb ? (
                      <span
                        className="w-2 h-2 rounded-full inline-block shrink-0"
                        style={{
                          backgroundColor: card.color?.hex || '#A855F7',
                          boxShadow: `0 0 6px ${card.color?.hex || '#A855F7'}`,
                        }}
                      />
                    ) : (
                      <span className={isOn ? 'text-emerald-400 font-bold text-xs shrink-0' : 'text-white/40 font-bold text-xs shrink-0'}>
                        ✓
                      </span>
                    )}
                    <span className="capitalize text-white/90 truncate">{card.device}</span>
                    <span
                      className={`font-semibold uppercase text-[10px] shrink-0 ${
                        isOn
                          ? 'text-emerald-400'
                          : isRgb
                          ? 'text-purple-300 capitalize'
                          : 'text-white/40'
                      }`}
                    >
                      {isRgb ? (card.color?.name || 'Active') : card.action}
                    </span>
                  </div>

                  <button
                    onClick={() => handleRevertAction(card.id, card.device, card.oppositeAction)}
                    disabled={card.isReverting}
                    className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white/80 font-bold text-[10px] tracking-wider uppercase border border-white/10 transition-all cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {card.isReverting ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    ) : isRgb ? (
                      'OFF'
                    ) : (
                      card.oppositeAction
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* 4. BOTTOM CONTROLS (Iconic ChatGPT Large White Pill Button "Done") */}
      <footer className="w-full max-w-md flex items-center justify-center gap-3 sm:gap-4 pt-3 sm:pt-4 pb-2 z-10 px-1 sm:px-0">
        {/* Mic Mute / Unmute circular toggle */}
        <button
          onClick={() => {
            setIsMuted((prev) => {
              const next = !prev
              isMutedRef.current = next
              setStatusMessage(next ? 'Microphone muted' : 'Listening... Speak now')
              return next
            })
          }}
          className={`w-12 h-12 sm:w-13 sm:h-13 rounded-full border border-white/15 flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0 ${
            isMuted
              ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
          title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Iconic White Pill Button matching reference image: [ Done ] */}
        <button
          onClick={() => {
            stopLiveSession()
            navigate('/teacher')
          }}
          className="flex-1 py-3 sm:py-3.5 px-6 sm:px-8 rounded-full bg-white text-black font-semibold text-sm hover:bg-slate-100 active:scale-98 transition-all shadow-xl shadow-white/10 text-center cursor-pointer min-h-[44px]"
        >
          Done
        </button>
      </footer>
    </div>
  )
}
