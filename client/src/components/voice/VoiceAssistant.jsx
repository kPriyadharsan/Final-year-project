import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Mic,
  MicOff,
  Radio,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Volume2,
  Sparkles,
  Bluetooth,
  ArrowRight,
  Send,
  Zap,
} from 'lucide-react'
import { Button, Badge } from '../ui'
import { useAuth } from '../../context/AuthContext'
import { API_BASE_URL } from '../../config/api'
import { GoogleGenAI } from '@google/genai'
import audioProcessorUrl from './geminiLiveAudioProcessor.js?url'

/**
 * Feature Flag: Enable Gemini Live real-time bidirectional audio session
 */
export const LIVE_VOICE_ENABLED = true

/**
 * Gemini Live Configuration
 */
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025'

const LIVE_SYSTEM_INSTRUCTION = `You control a smart classroom.

Supported devices:
- light
- fan
- projector

Supported actions:
- ON
- OFF

When the user requests a device action, call control_classroom_devices.

For multiple requested devices, include every requested device in the actions array.

Examples:

User: Turn on the fan.
Tool call:
actions = [
  { device: "fan", action: "ON" }
]

User: Turn on the fan and light.
Tool call:
actions = [
  { device: "fan", action: "ON" },
  { device: "light", action: "ON" }
]

User: Turn everything off.
Tool call:
actions = [
  { device: "fan", action: "OFF" },
  { device: "light", action: "OFF" },
  { device: "projector", action: "OFF" }
]

Never invent unsupported devices.

Keep responses short and natural.`

/**
 * Tool Declaration for Gemini Live device control
 */
const CONTROL_CLASSROOM_DEVICES_TOOL = {
  functionDeclarations: [
    {
      name: 'control_classroom_devices',
      description: 'Control one or more smart classroom appliances (light, fan, projector) to turn them ON or OFF.',
      parameters: {
        type: 'OBJECT',
        properties: {
          actions: {
            type: 'ARRAY',
            description: 'List of device control actions to execute',
            items: {
              type: 'OBJECT',
              properties: {
                device: {
                  type: 'STRING',
                  enum: ['light', 'fan', 'projector'],
                  description: 'The target appliance to control',
                },
                action: {
                  type: 'STRING',
                  enum: ['ON', 'OFF'],
                  description: 'The target state: ON or OFF',
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
 * Supported Visual States of the Voice Assistant
 */
export const VOICE_STATES = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  ERROR: 'error',
}

const SAMPLE_COMMANDS = [
  'Turn on the fan',
  'Switch off classroom lights',
  'Turn on projector',
  'Turn on the fan and light',
  'Turn off the fan and projector',
  'Please switch off everything',
]

/**
 * Reusable VoiceAssistant Component for the Smart Classroom
 *
 * Supports Gemini Multimodal Live API real-time microphone streaming,
 * bidirectional function calling (control_classroom_devices),
 * with graceful fallback to browser Web Speech API.
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
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [resultData, setResultData] = useState(null)
  const [isSupported, setIsSupported] = useState(true)
  const [manualText, setManualText] = useState('')
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

      sourceNode.onended = () => {
        const idx = activeAudioSourcesRef.current.indexOf(sourceNode)
        if (idx !== -1) {
          activeAudioSourcesRef.current.splice(idx, 1)
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
      } catch {
        // Source may already have ended
      }
    })
    activeAudioSourcesRef.current = []
    if (outputAudioContextRef.current) {
      nextPlaybackTimeRef.current = outputAudioContextRef.current.currentTime
    }
  }, [])

  // Safely stop Gemini Live session and tear down audio graph
  const stopLiveSession = useCallback(async () => {
    console.log('[GeminiLive] 🛑 Stopping Live voice session...')
    stopAudioPlayback()

    // 1. Stop mic tracks
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch {}
      })
      micStreamRef.current = null
    }

    // 2. Disconnect audio worklet
    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.disconnect()
      } catch {}
      workletNodeRef.current = null
    }

    // 3. Close input AudioContext
    if (inputAudioContextRef.current) {
      try {
        if (inputAudioContextRef.current.state !== 'closed') {
          await inputAudioContextRef.current.close()
        }
      } catch {}
      inputAudioContextRef.current = null
    }

    // 4. Close output AudioContext
    if (outputAudioContextRef.current) {
      try {
        if (outputAudioContextRef.current.state !== 'closed') {
          await outputAudioContextRef.current.close()
        }
      } catch {}
      outputAudioContextRef.current = null
    }

    // 5. Close Live WebSocket session
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
      const { id, name, args } = call
      const actions = args?.actions

      const SUPPORTED_DEVICES = ['light', 'fan', 'projector']
      const SUPPORTED_ACTIONS = ['ON', 'OFF']

      // 1. Frontend validation: must be a non-empty array
      if (!Array.isArray(actions) || actions.length === 0) {
        console.warn('[GeminiLive] ⚠️ Rejected tool call: actions must be a non-empty array')
        if (liveSessionRef.current) {
          liveSessionRef.current.sendToolResponse({
            functionResponses: [
              {
                id,
                name,
                response: { error: 'Actions must be a non-empty array' },
              },
            ],
          })
        }
        return
      }

      // 2. Frontend validation: device and action allowlists
      const validatedActions = []
      for (const item of actions) {
        if (
          item &&
          SUPPORTED_DEVICES.includes(String(item.device || '').toLowerCase()) &&
          SUPPORTED_ACTIONS.includes(String(item.action || '').toUpperCase())
        ) {
          validatedActions.push({
            device: String(item.device).toLowerCase(),
            action: String(item.action).toUpperCase(),
          })
        }
      }

      if (validatedActions.length === 0) {
        console.warn('[GeminiLive] ⚠️ Rejected tool call: no valid actions found')
        if (liveSessionRef.current) {
          liveSessionRef.current.sendToolResponse({
            functionResponses: [
              {
                id,
                name,
                response: { error: 'No valid device actions found' },
              },
            ],
          })
        }
        return
      }

      console.log(`[GeminiLive] Actions: ${validatedActions.length}`)

      // 3. Dispatch to backend POST /api/voice/live/command
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

          // Update UI state with action outcome
          const allOk = actionResults.every((a) => a.success)
          setResultData({
            executionStatus: allOk ? 'EXECUTED' : 'FAILED',
            message: actionResults
              .map((a) => `${a.device.toUpperCase()} ${a.action} (${a.delivered ? 'Delivered' : 'Failed'})`)
              .join(', '),
            transcript: `[Live Action] ${validatedActions.map((a) => `${a.device} -> ${a.action}`).join(', ')}`,
            intent: 'DEVICE_CONTROL',
            device: validatedActions.map((a) => a.device).join(', '),
            action: validatedActions.map((a) => a.action).join(', '),
          })

          if (onCommandExecuted) {
            onCommandExecuted(result.data)
          }

          // 4. Return tool response to Gemini Live session
          if (liveSessionRef.current) {
            liveSessionRef.current.sendToolResponse({
              functionResponses: [
                {
                  id,
                  name,
                  response: {
                    actions: actionResults.map((a) => ({
                      device: a.device,
                      action: a.action,
                      success: a.success,
                    })),
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
                id,
                name,
                response: { error: err.message },
              },
            ],
          })
        }
      }
    },
    [apiBaseUrl, token, classroom, onCommandExecuted]
  )

  // Handle incoming messages from Gemini Live WebSocket
  const handleLiveServerMessage = useCallback(
    (msg) => {
      // 1. Tool call received from server (primary path)
      if (msg.toolCall?.functionCalls) {
        for (const call of msg.toolCall.functionCalls) {
          if (call.name === 'control_classroom_devices') {
            handleDeviceToolCall(call)
          }
        }
      }

      // 2. User speech activity detected by server
      if (msg.serverContent?.userTurn) {
        console.log('[GeminiLive] 🗣️ User speech activity detected by model')
        setLiveStatusText('Gemini is listening to your speech...')
      }

      // 3. Model response parts received
      if (msg.serverContent?.modelTurn?.parts) {
        console.log('[GeminiLive] 🤖 Gemini response received')
        for (const part of msg.serverContent.modelTurn.parts) {
          // Check for tool call embedded in model turn parts
          if (part.functionCall && part.functionCall.name === 'control_classroom_devices') {
            handleDeviceToolCall(part.functionCall)
          }
          if (part.inlineData && part.inlineData.data) {
            console.log('[GeminiLive] 🔊 Gemini audio response received')
            playPcmChunk(part.inlineData.data)
          }
          if (part.text) {
            console.log('[GeminiLive] 📝 Gemini text output received')
            setTranscript((prev) => (prev ? prev + ' ' : '') + part.text)
          }
        }
      }

      // 4. Model turn interrupted by user speech (barge-in)
      if (msg.serverContent?.interrupted) {
        console.log('[GeminiLive] ⚡ Gemini response interrupted by user speech')
        stopAudioPlayback()
        setLiveStatusText('Interrupted. Listening...')
      }

      // 5. Model turn complete
      if (msg.serverContent?.turnComplete) {
        console.log('[GeminiLive] ✅ Gemini response turn completed')
        setLiveStatusText('Gemini response finished. You can speak again.')
      }
    },
    [handleDeviceToolCall, playPcmChunk, stopAudioPlayback]
  )

  // Start Gemini Live API Session
  const startLiveSession = useCallback(async () => {
    console.log('[GeminiLive] 🚀 Initiating Gemini Live session with device control tools...')
    setErrorMessage('')
    setLiveStatusText('Requesting microphone access...')

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

    setLiveStatusText('Requesting ephemeral Live API token from backend...')

    // 2. Fetch short-lived ephemeral token from backend
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

    setLiveStatusText('Connecting to Gemini Live WebSocket...')

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
      // Fallback: load inline blob if external module fails to resolve
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

    // Connect to silent gain to keep AudioWorklet processing clock active
    const silentGain = inputCtx.createGain()
    silentGain.gain.value = 0
    sourceNode.connect(workletNode)
    workletNode.connect(silentGain)
    silentGain.connect(inputCtx.destination)

    // 5. Connect Gemini Live Session with control_classroom_devices tool
    const session = await ai.live.connect({
      model: LIVE_MODEL,
      config: {
        responseModalities: ['AUDIO'],
        systemInstruction: {
          parts: [{ text: LIVE_SYSTEM_INSTRUCTION }],
        },
        tools: [CONTROL_CLASSROOM_DEVICES_TOOL],
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
          console.warn('[GeminiLive] ⚠️ Gemini Live WebSocket error received')
        },
        onclose: (e) => {
          console.log('[GeminiLive] 🔌 Gemini Live WebSocket connection closed')
          setIsLiveActive(false)
          isLiveModeActiveRef.current = false
        },
      },
    })

    liveSessionRef.current = session
  }, [apiBaseUrl, token, handleLiveServerMessage])

  // Initialize SpeechRecognition on mount (Fallback Engine)
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      console.warn('[VoiceAssistant] Web Speech API is not supported in this browser environment.')
      setIsSupported(false)
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.lang = 'en-US'
      recognition.continuous = false // Stops automatically when speech ends
      recognition.interimResults = true
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        isSpeechEndedRef.current = false
        setCurrentState(VOICE_STATES.LISTENING)
        setErrorMessage('')
        console.log('[VoiceAssistant] 🎙️ Microphone active. Listening for English speech...')
      }

      recognition.onresult = (event) => {
        let interim = ''
        let final = ''

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i]
          if (res.isFinal) {
            final += res[0].transcript
          } else {
            interim += res[0].transcript
          }
        }

        if (final) {
          setTranscript(final.trim())
          setInterimTranscript('')
        } else if (interim) {
          setInterimTranscript(interim)
        }
      }

      recognition.onspeechend = () => {
        console.log('[VoiceAssistant] 🛑 Speech ended naturally. Stopping recognition...')
        isSpeechEndedRef.current = true
        recognition.stop()
      }

      recognition.onerror = (event) => {
        console.warn('[VoiceAssistant] Speech Recognition error:', event.error)
        let friendly = 'Voice recognition error occurred. Please try again.'

        switch (event.error) {
          case 'no-speech':
            friendly = 'No speech was detected. Please tap the microphone and speak clearly.'
            break
          case 'not-allowed':
          case 'service-not-allowed':
            friendly = 'Microphone permission was denied. Please allow microphone access in your browser.'
            break
          case 'audio-capture':
            friendly = 'No microphone found. Please check your laptop or Bluetooth microphone connection.'
            break
          case 'network':
            friendly = 'Network connection error during voice recognition.'
            break
          case 'aborted':
            return // Ignored when user cancels
          default:
            friendly = `Voice error: ${event.error}`
        }

        setErrorMessage(friendly)
        setCurrentState(VOICE_STATES.ERROR)
      }

      recognition.onend = () => {
        console.log('[VoiceAssistant] Recognition session ended.')
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
        } catch {
          // Cleanup ignore
        }
      }
      stopLiveSession()
    }
  }, [stopLiveSession])

  // Send Transcript to Backend POST /api/voice/command (Used by Fallback & Manual input)
  const sendTranscriptToBackend = useCallback(
    async (textToSend) => {
      const commandText = (textToSend || transcript).trim()
      if (!commandText) {
        setCurrentState(VOICE_STATES.ERROR)
        setErrorMessage('No speech transcript captured to process.')
        return
      }

      setCurrentState(VOICE_STATES.PROCESSING)
      setErrorMessage('')
      console.log(`[VoiceAssistant] 🚀 Sending transcript to backend: "${commandText}"`)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      try {
        const response = await fetch(`${apiBaseUrl}/api/voice/command`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            transcript: commandText,
            classroom,
          }),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        const result = await response.json()

        if (response.ok && result.status === 'success') {
          console.log('[VoiceAssistant] ✅ Command response received:', result.data)
          setResultData(result.data)
          setCurrentState(VOICE_STATES.SUCCESS)

          if (onCommandExecuted) {
            onCommandExecuted(result.data)
          }
        } else {
          throw new Error(result.message || 'Failed to process voice command.')
        }
      } catch (err) {
        clearTimeout(timeoutId)
        console.error('[VoiceAssistant] Backend dispatch error:', err)
        let friendlyMsg = err.message
        if (err.name === 'AbortError') {
          friendlyMsg = 'Voice command processing timed out after 10 seconds. AI engine or backend did not respond in time.'
        } else if (err.message && err.message.includes('Failed to fetch')) {
          friendlyMsg = 'Backend server is unavailable or offline. Please verify that the API server is running.'
        }
        setErrorMessage(friendlyMsg)
        setCurrentState(VOICE_STATES.ERROR)
      }
    },
    [transcript, apiBaseUrl, classroom, token, onCommandExecuted]
  )

  // When Web Speech finishes and we have captured transcript, automatically submit
  useEffect(() => {
    if (!isLiveModeActiveRef.current && transcript && isSpeechEndedRef.current && currentState === VOICE_STATES.LISTENING) {
      sendTranscriptToBackend(transcript)
    }
  }, [transcript, currentState, sendTranscriptToBackend])

  // Helper to trigger fallback Web Speech Recognition
  const startWebSpeech = useCallback(() => {
    if (!recognitionRef.current) {
      setErrorMessage('Speech recognition is not available in this browser.')
      setCurrentState(VOICE_STATES.ERROR)
      return
    }

    try {
      recognitionRef.current.start()
    } catch (err) {
      console.warn('[VoiceAssistant] Web Speech start error (attempting restart):', err.message)
      try {
        recognitionRef.current.stop()
        setTimeout(() => recognitionRef.current?.start(), 150)
      } catch {
        setCurrentState(VOICE_STATES.ERROR)
        setErrorMessage('Could not activate microphone. Please try again.')
      }
    }
  }, [])

  // Primary Start Listening Handler
  const handleStartListening = async () => {
    setErrorMessage('')
    setResultData(null)
    setTranscript('')
    setInterimTranscript('')
    isSpeechEndedRef.current = false

    // Attempt Gemini Live API connection if enabled
    if (LIVE_VOICE_ENABLED) {
      try {
        await startLiveSession()
        return
      } catch (err) {
        console.warn('[VoiceAssistant] ⚠️ Gemini Live connection failed, engaging Web Speech fallback:', err.message)
        await stopLiveSession()
        setErrorMessage(`Live session unavailable: ${err.message}. Engaging browser speech recognition fallback.`)
        // Fall back to Web Speech recognition
      }
    }

    // Fallback: Web Speech API
    startWebSpeech()
  }

  // Primary Stop Listening Handler
  const handleStopListening = async () => {
    if (isLiveModeActiveRef.current) {
      setCurrentState(VOICE_STATES.PROCESSING)
      await stopLiveSession()
      setTimeout(() => {
        setCurrentState(VOICE_STATES.IDLE)
      }, 500)
      return
    }

    // Fallback: Web Speech Stop
    if (recognitionRef.current) {
      try {
        isSpeechEndedRef.current = true
        recognitionRef.current.stop()
        if (transcript || interimTranscript) {
          const finalCandidate = transcript || interimTranscript
          setTranscript(finalCandidate)
          sendTranscriptToBackend(finalCandidate)
        } else {
          setCurrentState(VOICE_STATES.IDLE)
        }
      } catch {
        setCurrentState(VOICE_STATES.IDLE)
      }
    }
  }

  // Allow Retry
  const handleRetry = () => {
    setErrorMessage('')
    setResultData(null)
    setTranscript('')
    setInterimTranscript('')
    setCurrentState(VOICE_STATES.IDLE)
    stopLiveSession()
  }

  // Manual fallback execution
  const handleManualSubmit = (e) => {
    e?.preventDefault()
    if (!manualText.trim()) return
    setTranscript(manualText.trim())
    sendTranscriptToBackend(manualText.trim())
    setManualText('')
  }

  return (
    <div className={`space-y-5 text-slate-800 ${isEmbedded ? '' : 'p-1'}`}>
      {/* Mic Status & Live Awareness Badge */}
      <div className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-slate-100/80 border border-slate-200/80 text-xs">
        <div className="flex items-center gap-2 text-slate-600 font-medium">
          <Bluetooth className="w-3.5 h-3.5 text-blue-600" />
          <span>Microphone: Default System Audio (16kHz PCM)</span>
        </div>
        <div className="flex items-center gap-1.5">
          {LIVE_VOICE_ENABLED && (
            <Badge variant={isLiveActive ? 'purple' : 'neutral'} size="sm">
              {isLiveActive ? 'Gemini Live Active' : 'Gemini Live Ready'}
            </Badge>
          )}
          <Badge variant="info" size="sm">
            en-US (English)
          </Badge>
        </div>
      </div>

      {/* Main Dynamic State Viewport */}
      <div className="rounded-3xl bg-slate-50/90 border border-slate-200/80 p-6 sm:p-7 text-center space-y-4 shadow-sm">
        {/* ================= STATE 1: IDLE ================= */}
        {currentState === VOICE_STATES.IDLE && (
          <div className="space-y-4 py-2">
            {!isSupported && !LIVE_VOICE_ENABLED && (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                Speech recognition is unavailable in this browser. You can enter commands using the text input below.
              </div>
            )}
            <button
              type="button"
              onClick={handleStartListening}
              className="w-20 h-20 mx-auto rounded-full bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-500 hover:from-purple-500 hover:to-indigo-500 flex items-center justify-center text-white shadow-xl shadow-purple-500/30 transition-transform active:scale-95 cursor-pointer group"
              title="Tap to speak in English"
            >
              <Mic className="w-9 h-9 group-hover:scale-110 transition-transform" />
            </button>
            <div>
              <p className="text-base font-bold text-slate-900">
                {LIVE_VOICE_ENABLED ? 'Tap to Speak with Gemini Live' : 'Tap to Speak'}
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {LIVE_VOICE_ENABLED
                  ? 'Real-time bidirectional voice assistant with smart appliance function calling.'
                  : 'Speak naturally in English. Your voice is captured locally and parsed by Gemini AI.'}
              </p>
            </div>
          </div>
        )}

        {/* ================= STATE 2: LISTENING ================= */}
        {currentState === VOICE_STATES.LISTENING && (
          <div className="space-y-4 py-2">
            {/* Pulsing Mic Visualizer */}
            <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-purple-500/20 animate-ping" />
              <span className="absolute inset-2 rounded-full bg-purple-600/30 animate-pulse" />
              <button
                type="button"
                onClick={handleStopListening}
                className="relative z-10 w-16 h-16 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center shadow-lg shadow-purple-600/50 cursor-pointer"
                title="Tap when finished speaking"
              >
                <Radio className="w-7 h-7 animate-pulse text-amber-300" />
              </button>
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-purple-500 animate-ping" />
                {isLiveActive ? 'Live Audio Session Active' : 'Listening... Speak now'}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {liveStatusText || (isLiveActive ? 'Streaming audio to Gemini Live. Tap when done.' : 'Recording will stop automatically when speech finishes.')}
              </p>
            </div>

            {/* Live Real-Time Transcript Display */}
            <div className="min-h-14 p-3.5 rounded-2xl bg-white border border-purple-200 text-xs text-left font-mono shadow-sm">
              <span className="text-slate-400 text-[11px] block uppercase font-sans font-bold mb-1">
                {isLiveActive ? 'Live Assistant Audio / Transcript:' : 'Live Speech Transcript:'}
              </span>
              <p className="text-slate-800 font-medium break-words">
                {transcript || interimTranscript || (
                  <span className="text-slate-400 italic">Listening for speech...</span>
                )}
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleStopListening}
            >
              Done Speaking
            </Button>
          </div>
        )}

        {/* ================= STATE 3: PROCESSING ================= */}
        {currentState === VOICE_STATES.PROCESSING && (
          <div className="space-y-4 py-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-sm">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900">
                {isLiveActive ? 'Completing Live Session...' : 'Analyzing Voice Command...'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {isLiveActive
                  ? 'Executing classroom appliance commands and finalizing response.'
                  : 'Gemini intent classification and backend allowlist validation in progress.'}
              </p>
            </div>

            {/* Echoed Transcript */}
            {transcript && (
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 text-xs text-left font-mono shadow-sm">
                <span className="text-slate-400 text-[10px] block uppercase font-sans mb-1">
                  Transcribed Audio:
                </span>
                <p className="text-blue-600 font-semibold italic">"{transcript}"</p>
              </div>
            )}
          </div>
        )}

        {/* ================= STATE 4: SUCCESS ================= */}
        {currentState === VOICE_STATES.SUCCESS && resultData && (
          <div className="space-y-4 py-2 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                {resultData.executionStatus === 'FAILED' ? (
                  <AlertTriangle className="w-5 h-5 text-rose-500" />
                ) : resultData.executionStatus === 'EXECUTED' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-blue-600" />
                )}
                <span className="text-sm font-bold text-slate-900">
                  {resultData.executionStatus === 'FAILED'
                    ? 'Delivery Notice'
                    : resultData.executionStatus === 'EXECUTED'
                    ? 'Command Executed'
                    : 'Intent Detected'}
                </span>
              </div>
              <Badge
                variant={
                  resultData.executionStatus === 'EXECUTED'
                    ? 'success'
                    : resultData.executionStatus === 'DETECTED'
                    ? 'info'
                    : 'danger'
                }
              >
                {resultData.executionStatus}
              </Badge>
            </div>

            {/* Transcript Quote */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-1 shadow-sm">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                Captured Transcript
              </span>
              <p className="text-xs font-mono text-purple-700 font-semibold italic">
                "{resultData.transcript}"
              </p>
            </div>

            {/* Intent & Device Badges */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <span className="text-[10px] text-slate-400 block font-medium">Classified Intent</span>
                <span className="font-semibold text-slate-900 font-mono">{resultData.intent}</span>
              </div>
              <div className="p-3 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <span className="text-[10px] text-slate-400 block font-medium">Target Device / Action</span>
                <span className="font-semibold text-blue-600 font-mono">
                  {resultData.device ? `${resultData.device.toUpperCase()} → ${resultData.action}` : 'N/A (Software)'}
                </span>
              </div>
            </div>

            {/* Human Readable Message from Backend */}
            <div
              className={`p-3.5 rounded-2xl border text-xs font-medium ${
                resultData.executionStatus === 'FAILED'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : resultData.executionStatus === 'EXECUTED'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-sky-50 border-sky-200 text-sky-800'
              }`}
            >
              {resultData.message}
            </div>

            {/* Action Bar */}
            <div className="pt-2 flex justify-between items-center">
              <Button variant="outline" size="sm" onClick={handleRetry}>
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Speak Another
              </Button>
              {onClose && (
                <Button variant="primary" size="sm" onClick={onClose}>
                  Done
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ================= STATE 5: ERROR ================= */}
        {currentState === VOICE_STATES.ERROR && (
          <div className="space-y-4 py-2">
            <div className="w-14 h-14 mx-auto rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-500 shadow-sm">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Voice Command Notice</p>
              <p className="text-xs text-rose-600 mt-1 max-w-sm mx-auto">{errorMessage}</p>
            </div>
            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={handleRetry}>
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Retry
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Suggested Command Chips */}
      {currentState === VOICE_STATES.IDLE && (
        <div className="space-y-2">
          <span className="text-[11px] font-semibold text-slate-400 block">
            Suggested English Voice Commands:
          </span>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_COMMANDS.map((phrase, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setTranscript(phrase)
                  sendTranscriptToBackend(phrase)
                }}
                className="px-3 py-1.5 rounded-full bg-white border border-slate-200/80 hover:border-purple-300 hover:bg-purple-50/50 text-[11px] text-slate-700 hover:text-purple-700 transition-all cursor-pointer font-sans shadow-sm flex items-center gap-1.5 font-medium"
              >
                <span>"{phrase}"</span>
                <ArrowRight className="w-3 h-3 text-purple-500" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual Input Fallback */}
      <div className="pt-2 border-t border-slate-200">
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            type="text"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="Or type an English voice command..."
            className="flex-1 px-4 py-2.5 bg-white border border-slate-200/80 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 font-sans shadow-sm"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={!manualText.trim() || currentState === VOICE_STATES.PROCESSING}
          >
            <Send className="w-3.5 h-3.5 mr-1" />
            Send
          </Button>
        </form>
      </div>
    </div>
  )
}
