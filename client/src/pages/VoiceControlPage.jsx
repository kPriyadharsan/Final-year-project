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
  Activity,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSocketEvent } from '../context/SocketContext'
import { API_BASE_URL } from '../config/api'
import { RealtimeVAD } from '../components/voice/realtimeVad'
import { useMobileLayout, useHaptics } from '../hooks'

const QUICK_MOBILE_COMMANDS = [
  { label: 'Light ON', icon: '💡', text: 'turn on the light' },
  { label: 'Light OFF', icon: '🌑', text: 'turn off the light' },
  { label: 'Fan ON', icon: '❄️', text: 'turn on the fan' },
  { label: 'Fan OFF', icon: '⏹️', text: 'turn off the fan' },
  { label: 'Projector ON', icon: '📽️', text: 'turn on the projector' },
  { label: 'Purple Color', icon: '🟣', text: 'set the purple color' },
  { label: 'Blue Color', icon: '🔵', text: 'set the blue color' },
  { label: 'Red Color', icon: '🔴', text: 'set the red color' },
  { label: 'All OFF', icon: '⚡', text: 'turn off all devices' },
]

/**
 * Explicit Voice State Machine
 */
export const VOICE_STATES = Object.freeze({
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  USER_SPEAKING: 'USER_SPEAKING',
  PROCESSING: 'PROCESSING',
  ASSISTANT_SPEAKING: 'ASSISTANT_SPEAKING',
  INTERRUPTED: 'INTERRUPTED',
  ERROR: 'ERROR',
})

const CHATGPT_VOICES = [
  { id: 'breeze', name: 'Breeze', desc: 'Calm and balanced' },
  { id: 'cove', name: 'Cove', desc: 'Direct and clear' },
  { id: 'ember', name: 'Ember', desc: 'Confident and thoughtful' },
  { id: 'juniper', name: 'Juniper', desc: 'Open and upbeat' },
  { id: 'sol', name: 'Sol', desc: 'Natural and easygoing' },
  { id: 'vale', name: 'Vale', desc: 'Bright and curious' },
]

function getOppositeAction(action) {
  return String(action).toUpperCase() === 'ON' ? 'OFF' : 'ON'
}

export function VoiceControlPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const { isMobile } = useMobileLayout()
  const { triggerHaptic } = useHaptics()
  const apiBaseUrl = API_BASE_URL
  const classroom = 'Room 302'

  // Voice Persona selection (default index 3 = Juniper)
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState(3)
  const currentVoice = CHATGPT_VOICES[selectedVoiceIndex]

  // Voice State Machine
  const [voiceState, setVoiceState] = useState(VOICE_STATES.IDLE)
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [statusMessage, setStatusMessage] = useState('Tap the orb to start speaking')
  const [liveTranscript, setLiveTranscript] = useState('')
  const [actionCards, setActionCards] = useState([])
  const [errorMessage, setErrorMessage] = useState('')
  const [isMuted, setIsMuted] = useState(false)
  const [micVolume, setMicVolume] = useState(0) // Live volume 0..100 for orb scaling

  // Latency & Telemetry Metrics (Real-time tracking for project evaluation)
  const [latencyMetrics, setLatencyMetrics] = useState({
    turnDetectionMs: null,
    timeToFirstAudioMs: null,
    noiseFloor: null,
    speechThreshold: null,
  })
  const [showMetrics, setShowMetrics] = useState(false)

  // Confirmed hardware telemetry states directly synchronized from ESP32 & backend
  const [projectorState, setProjectorState] = useState('OFF')
  const [rgbPower, setRgbPower] = useState('OFF')
  const [rgbColor, setRgbColor] = useState({ name: 'blue', hex: '#3B82F6', r: 59, g: 130, b: 246 })

  // Audio & WebSocket Refs
  const wsRef = useRef(null)
  const micStreamRef = useRef(null)
  const inputAudioCtxRef = useRef(null)
  const outputAudioCtxRef = useRef(null)
  const scriptProcessorRef = useRef(null)
  const vadRef = useRef(null)
  const speechRecognitionRef = useRef(null)
  const lastTranscriptRef = useRef('')
  const lastDispatchedCommandRef = useRef('')
  const isMutedRef = useRef(false)
  const activeSourcesRef = useRef([])
  const nextPlaybackTimeRef = useRef(0)
  const currentTurnIdRef = useRef(0)
  const isInterruptedRef = useRef(false)

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
            if (proj.color && (proj.color.r !== 0 || proj.color.g !== 0 || proj.color.b !== 0)) setRgbColor(proj.color)
          }
        }
      } catch (err) {
        console.warn('[VoiceControlPage] Could not fetch initial device status:', err.message)
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
    if (isProjector && data.state) {
      setProjectorState(data.state)
    }
  })

  useSocketEvent('device:color', (data) => {
    if (!data) return
    const isProjector = data.type === 'PROJECTOR' || String(data.deviceId || '').toLowerCase().includes('proj')
    if (isProjector) {
      if (data.colorPower) setRgbPower(data.colorPower)
      if (data.color && (data.color.r !== 0 || data.color.g !== 0 || data.color.b !== 0)) setRgbColor(data.color)
    }
  })

  // Stop currently playing audio and clear output buffer queue immediately
  const stopAudioPlayback = useCallback(() => {
    isInterruptedRef.current = true
    currentTurnIdRef.current++

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel()
      } catch {}
    }

    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop()
      } catch {}
    })
    activeSourcesRef.current = []

    if (outputAudioCtxRef.current) {
      nextPlaybackTimeRef.current = outputAudioCtxRef.current.currentTime
    }

    if (vadRef.current) {
      vadRef.current.setAssistantSpeaking(false)
    }
  }, [])

  // Immediate conversational voice synthesis: AI speaks immediately without waiting!
  const speakConversationalAudio = useCallback((text, onComplete) => {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) return

    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.05
      utterance.pitch = 1.0

      const voices = window.speechSynthesis.getVoices()
      if (voices && voices.length > 0) {
        const preferredVoice =
          voices.find(
            (v) =>
              v.lang.startsWith('en') &&
              (v.name.includes('Google') ||
                v.name.includes('Natural') ||
                v.name.includes('Samantha') ||
                v.name.includes('Daniel') ||
                v.name.includes('Zira'))
          ) || voices.find((v) => v.lang.startsWith('en'))
        if (preferredVoice) utterance.voice = preferredVoice
      }

      utterance.onstart = () => {
        setVoiceState(VOICE_STATES.ASSISTANT_SPEAKING)
        if (vadRef.current) vadRef.current.setAssistantSpeaking(true)
      }

      utterance.onend = () => {
        if (vadRef.current) vadRef.current.setAssistantSpeaking(false)
        setVoiceState((cur) =>
          cur === VOICE_STATES.ASSISTANT_SPEAKING ? VOICE_STATES.LISTENING : cur
        )
        setStatusMessage('Listening... Speak naturally')
        if (onComplete) onComplete()
      }

      utterance.onerror = () => {
        if (vadRef.current) vadRef.current.setAssistantSpeaking(false)
        setVoiceState((cur) =>
          cur === VOICE_STATES.ASSISTANT_SPEAKING ? VOICE_STATES.LISTENING : cur
        )
      }

      window.speechSynthesis.speak(utterance)
    } catch (e) {
      console.warn('[VoiceControlPage] SpeechSynthesis error:', e)
    }
  }, [])

  // Progressive streaming playback of 24 kHz mono PCM audio chunks
  const playPcmChunk = useCallback((base64Data, turnId) => {
    try {
      if (turnId !== undefined && turnId !== currentTurnIdRef.current) {
        return // Stale chunk from interrupted or previous turn
      }

      if (!outputAudioCtxRef.current) {
        outputAudioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 24000,
        })
      }
      const ctx = outputAudioCtxRef.current
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
      activeSourcesRef.current.push(sourceNode)

      // State transition to ASSISTANT_SPEAKING
      setVoiceState(VOICE_STATES.ASSISTANT_SPEAKING)
      if (vadRef.current) {
        vadRef.current.setAssistantSpeaking(true)
      }

      sourceNode.onended = () => {
        const idx = activeSourcesRef.current.indexOf(sourceNode)
        if (idx !== -1) {
          activeSourcesRef.current.splice(idx, 1)
        }
        if (activeSourcesRef.current.length === 0) {
          if (vadRef.current) {
            vadRef.current.setAssistantSpeaking(false)
          }
          setVoiceState((current) => {
            if (current === VOICE_STATES.ASSISTANT_SPEAKING) {
              return VOICE_STATES.LISTENING
            }
            return current
          })
          setStatusMessage('Listening... Speak naturally')
        }
      }
    } catch (e) {
      console.warn('[VoiceControlPage] Error playing PCM chunk:', e.message)
    }
  }, [])

  // Send JSON control frame to backend WebSocket
  const sendWsControl = useCallback((obj) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(obj))
      } catch (err) {
        console.warn('[VoiceControlPage] Failed to send WS frame:', err)
      }
    }
  }, [])

// 50+ Standard Classroom Colors Definition (Local zero-latency matching without AI!)
const LOCAL_COLOR_PALETTE = {
  red: { r: 255, g: 0, b: 0, hex: '#FF0000', name: 'red' },
  green: { r: 0, g: 255, b: 0, hex: '#00FF00', name: 'green' },
  blue: { r: 0, g: 0, b: 255, hex: '#0000FF', name: 'blue' },
  purple: { r: 168, g: 85, b: 247, hex: '#A855F7', name: 'purple' },
  yellow: { r: 250, g: 204, b: 21, hex: '#FACC15', name: 'yellow' },
  orange: { r: 249, g: 115, b: 22, hex: '#F97316', name: 'orange' },
  pink: { r: 236, g: 72, b: 153, hex: '#EC4899', name: 'pink' },
  cyan: { r: 6, g: 182, b: 212, hex: '#06B6D4', name: 'cyan' },
  white: { r: 255, g: 255, b: 255, hex: '#FFFFFF', name: 'white' },
  'warm white': { r: 255, g: 214, b: 170, hex: '#FFD6AA', name: 'warm white' },
  'cool white': { r: 200, g: 230, b: 255, hex: '#C8E6FF', name: 'cool white' },
  'sky blue': { r: 56, g: 189, b: 248, hex: '#38BDF8', name: 'sky blue' },
  magenta: { r: 255, g: 0, b: 255, hex: '#FF00FF', name: 'magenta' },
  violet: { r: 139, g: 92, b: 246, hex: '#8B5CF6', name: 'violet' },
  lime: { r: 132, g: 204, b: 22, hex: '#84CC16', name: 'lime' },
  amber: { r: 245, g: 158, b: 11, hex: '#F59E0B', name: 'amber' },
  gold: { r: 255, g: 215, b: 0, hex: '#FFD700', name: 'gold' },
  golden: { r: 255, g: 215, b: 0, hex: '#FFD700', name: 'golden' },
  teal: { r: 20, g: 184, b: 166, hex: '#14B8A6', name: 'teal' },
  indigo: { r: 99, g: 102, b: 241, hex: '#6366F1', name: 'indigo' },
  turquoise: { r: 64, g: 224, b: 208, hex: '#40E0D0', name: 'turquoise' },
  aqua: { r: 0, g: 255, b: 255, hex: '#00FFFF', name: 'aqua' },
  crimson: { r: 220, g: 20, b: 60, hex: '#DC143C', name: 'crimson' },
  scarlet: { r: 255, g: 36, b: 0, hex: '#FF2400', name: 'scarlet' },
  maroon: { r: 128, g: 0, b: 0, hex: '#800000', name: 'maroon' },
  navy: { r: 0, g: 0, b: 128, hex: '#000080', name: 'navy' },
  'navy blue': { r: 0, g: 0, b: 128, hex: '#000080', name: 'navy blue' },
  'royal blue': { r: 65, g: 105, b: 225, hex: '#4169E1', name: 'royal blue' },
  'deep blue': { r: 0, g: 10, b: 180, hex: '#000AB4', name: 'deep blue' },
  'baby blue': { r: 137, g: 207, b: 240, hex: '#89CFF0', name: 'baby blue' },
  'ice blue': { r: 175, g: 238, b: 238, hex: '#AFEEEE', name: 'ice blue' },
  lavender: { r: 196, g: 181, b: 253, hex: '#C4B5FD', name: 'lavender' },
  lilac: { r: 200, g: 162, b: 200, hex: '#C8A2C8', name: 'lilac' },
  plum: { r: 221, g: 160, b: 221, hex: '#DDA0DD', name: 'plum' },
  coral: { r: 251, g: 113, b: 133, hex: '#FB7185', name: 'coral' },
  peach: { r: 255, g: 218, b: 185, hex: '#FFDAB9', name: 'peach' },
  salmon: { r: 250, g: 128, b: 114, hex: '#FA8072', name: 'salmon' },
  rose: { r: 244, g: 63, b: 94, hex: '#F43F5E', name: 'rose' },
  ruby: { r: 224, g: 17, b: 95, hex: '#E0115F', name: 'ruby' },
  emerald: { r: 16, g: 185, b: 129, hex: '#10B981', name: 'emerald' },
  mint: { r: 110, g: 231, b: 183, hex: '#6EE7B7', name: 'mint' },
  'mint green': { r: 110, g: 231, b: 183, hex: '#6EE7B7', name: 'mint green' },
  'forest green': { r: 34, g: 139, b: 34, hex: '#228B22', name: 'forest green' },
  olive: { r: 128, g: 128, b: 0, hex: '#808000', name: 'olive' },
  jade: { r: 0, g: 168, b: 107, hex: '#00A86B', name: 'jade' },
  aquamarine: { r: 127, g: 255, b: 212, hex: '#7FFFD4', name: 'aquamarine' },
  seafoam: { r: 159, g: 226, b: 191, hex: '#9FE2BF', name: 'seafoam' },
  sapphire: { r: 15, g: 82, b: 186, hex: '#0F52BA', name: 'sapphire' },
  'hot pink': { r: 255, g: 20, b: 147, hex: '#FF1493', name: 'hot pink' },
  sunset: { r: 253, g: 94, b: 83, hex: '#FD5E53', name: 'sunset' },
  bronze: { r: 205, g: 127, b: 50, hex: '#CD7F32', name: 'bronze' },
  copper: { r: 184, g: 115, b: 51, hex: '#B87333', name: 'copper' },
  silver: { r: 192, g: 192, b: 192, hex: '#C0C0C0', name: 'silver' },
  fuchsia: { r: 217, g: 70, b: 239, hex: '#D946EF', name: 'fuchsia' },
  'neon green': { r: 57, g: 255, b: 20, hex: '#39FF14', name: 'neon green' },
  'neon blue': { r: 77, g: 77, b: 255, hex: '#4D4DFF', name: 'neon blue' },
  'dark red': { r: 139, g: 0, b: 0, hex: '#8B0000', name: 'dark red' },
  'dark blue': { r: 0, g: 0, b: 139, hex: '#00008B', name: 'dark blue' },
  'dark green': { r: 0, g: 100, b: 0, hex: '#006400', name: 'dark green' },
  'dark purple': { r: 88, g: 28, b: 135, hex: '#581C87', name: 'dark purple' },
  'light blue': { r: 186, g: 230, b: 253, hex: '#BAE6FD', name: 'light blue' },
  'light green': { r: 187, g: 247, b: 208, hex: '#BBF7D0', name: 'light green' },
  'light pink': { r: 251, g: 207, b: 232, hex: '#FBCFE8', name: 'light pink' },
  'light purple': { r: 233, g: 213, b: 255, hex: '#E9D5FF', name: 'light purple' },
}

function matchLocalColor(text) {
  if (!text) return null
  const lower = text.toLowerCase().trim()
  const isColorPhrase =
    /\b(color|colour|glow|light|projector|rgb|set|change|make)\b/i.test(lower) ||
    Boolean(LOCAL_COLOR_PALETTE[lower])

  if (!isColorPhrase) return null

  // Sort color names by length descending so multi-word colors match before single-word
  const colorNames = Object.keys(LOCAL_COLOR_PALETTE).sort((a, b) => b.length - a.length)
  for (const name of colorNames) {
    const regex = new RegExp(`(^|\\s|[^a-z0-9])${name.replace(/\\s+/g, '\\s+')}($|\\s|[^a-z0-9])`, 'i')
    if (regex.test(lower)) {
      const base = LOCAL_COLOR_PALETTE[name]

      // Check optional brightness or percentage, e.g. "purple color like 100", "50%", "brightness 80"
      const brightnessMatch = lower.match(/\b(?:like|at|to|brightness|value|level)?\s*(\d{1,3})\s*%?\b/i)
      let factor = 1.0
      if (brightnessMatch && brightnessMatch[1]) {
        const val = parseInt(brightnessMatch[1], 10)
        if (!isNaN(val) && val > 0 && val <= 100) {
          factor = val / 100.0
        }
      }

      return {
        ...base,
        r: Math.min(255, Math.max(0, Math.round(base.r * factor))),
        g: Math.min(255, Math.max(0, Math.round(base.g * factor))),
        b: Math.min(255, Math.max(0, Math.round(base.b * factor))),
      }
    }
  }
  return null
}

  // Dispatch device control command via EXACT Web Button Architecture (POST /api/devices/:id/command)
  const dispatchDeviceCommandDirect = useCallback(
    async (deviceKey, action) => {
      try {
        console.log(`[VoiceControlPage] ⚡ Button-architecture direct dispatch: ${deviceKey} -> ${action}`)
        const res = await fetch(`${apiBaseUrl}/api/devices/${encodeURIComponent(deviceKey)}/command`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ action }),
        })
        const data = await res.json()
        if (res.ok && data.status === 'success') {
          console.log(`[VoiceControlPage] ✅ Hardware state executed via button path:`, data.message)
          const newCard = {
            id: data.logId || `${deviceKey}-${Date.now()}`,
            device: deviceKey,
            action,
            status: 'success',
            timestamp: Date.now(),
            oppositeAction: getOppositeAction(action),
            isReverting: false,
            error: null,
            message: data.message,
          }
          setActionCards((prev) => [newCard, ...prev.filter((c) => c.device !== deviceKey)].slice(0, 4))
          setStatusMessage(data.message || `${deviceKey} ${action} command sent.`)
        } else if (data.message) {
          setStatusMessage(data.message)
        }
      } catch (err) {
        console.error(`[VoiceControlPage] Button-path dispatch error:`, err.message)
      }
    },
    [apiBaseUrl, token]
  )

  // Dispatch projector RGB color command via EXACT Web Button Architecture (POST /api/devices/projector/color)
  const dispatchDeviceColorDirect = useCallback(
    async (colorObj) => {
      try {
        console.log(`[VoiceControlPage] ⚡ Button-architecture RGB dispatch:`, colorObj)
        const res = await fetch(`${apiBaseUrl}/api/devices/projector/color`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            power: 'ON',
            color: colorObj,
          }),
        })
        const data = await res.json()
        if (res.ok && data.status === 'success') {
          console.log(`[VoiceControlPage] ✅ Projector RGB updated via button path:`, data)
          setRgbPower('ON')
          setRgbColor(colorObj)
          setStatusMessage(`Projector color set to ${colorObj.name}.`)
        } else if (data.message) {
          setStatusMessage(data.message)
        }
      } catch (err) {
        console.error(`[VoiceControlPage] Color dispatch error:`, err.message)
      }
    },
    [apiBaseUrl, token]
  )

  // Process user turn with immediate conversational feedback and instant hardware dispatch
  const handleProcessedUserTurn = useCallback(
    (rawText) => {
      const text = (rawText || lastTranscriptRef.current || '').trim()
      if (!text) {
        setStatusMessage('Listening... Speak naturally')
        setVoiceState(VOICE_STATES.LISTENING)
        return
      }

      const lower = text.toLowerCase()
      console.log(`[VoiceControlPage] ⚡ Real-time processing turn: "${text}"`)

      // 1. FAST-PATH: Check 50+ Standard Classroom Colors (No AI call!)
      const matchedColor = matchLocalColor(text)
      if (matchedColor) {
        const cmdKey = `color-${matchedColor.name}-${matchedColor.r}-${matchedColor.g}-${matchedColor.b}`
        const verbal = `Sure, setting projector color to ${matchedColor.name}.`
        setStatusMessage(verbal)
        speakConversationalAudio(verbal)

        if (lastDispatchedCommandRef.current !== cmdKey) {
          lastDispatchedCommandRef.current = cmdKey
          dispatchDeviceColorDirect(matchedColor)
        }

        sendWsControl({
          type: 'fast_dispatch_command',
          text,
        })
        lastTranscriptRef.current = ''
        return
      }

      // 2. FAST-PATH: Parse classroom relay device intent (No AI call!)
      const isFan = /\b(fan|fans|ceiling\s+fan)\b/i.test(lower)
      const isLight = /\b(light|lights|lamp|bulb|tubelight)\b/i.test(lower)
      const isProjector = /\b(projector|screen|display)\b/i.test(lower)
      const isOn = /\b(turn\s+on|switch\s+on|power\s+on|start|activate|enable|on)\b/i.test(lower)
      const isOff = /\b(turn\s+off|switch\s+off|power\s+off|stop|deactivate|disable|off|kill|shutdown)\b/i.test(lower)

      let matchedDevice = null
      let matchedAction = null

      if (isFan && (isOn || isOff)) {
        matchedDevice = 'fan'
        matchedAction = isOn ? 'ON' : 'OFF'
      } else if (isLight && (isOn || isOff)) {
        matchedDevice = 'light'
        matchedAction = isOn ? 'ON' : 'OFF'
      } else if (isProjector && (isOn || isOff)) {
        matchedDevice = 'projector'
        matchedAction = isOn ? 'ON' : 'OFF'
      }

      if (matchedDevice && matchedAction) {
        const cmdKey = `${matchedDevice}-${matchedAction}`
        const verbal = matchedAction === 'ON'
          ? `Sure, turning on the ${matchedDevice}.`
          : `Sure, turning off the ${matchedDevice}.`

        setStatusMessage(verbal)
        speakConversationalAudio(verbal)

        // Dispatch via EXACT Web Button Architecture if not already dispatched in streaming phase
        if (lastDispatchedCommandRef.current !== cmdKey) {
          lastDispatchedCommandRef.current = cmdKey
          dispatchDeviceCommandDirect(matchedDevice, matchedAction)
        }

        // Keep WebSocket stream session in sync
        sendWsControl({
          type: 'fast_dispatch_command',
          text,
        })
        sendWsControl({
          type: 'turn_complete',
          text,
        })
      } else {
        // 3. Fallback to Gemini AI for general questions, complex queries, or creative requests
        const ack = 'Let me check that for you...'
        setStatusMessage(ack)
        speakConversationalAudio(ack)

        sendWsControl({
          type: 'turn_complete',
          text,
        })
      }

      lastTranscriptRef.current = ''
    },
    [dispatchDeviceColorDirect, dispatchDeviceCommandDirect, sendWsControl, speakConversationalAudio]
  )

  // Start Real-Time Voice Session
  const startVoiceSession = useCallback(async () => {
    setErrorMessage('')
    setVoiceState(VOICE_STATES.LISTENING)
    setStatusMessage('Calibrating microphone...')

    // 1. Establish persistent WebSocket bridge to backend /ws/voice
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${apiBaseUrl.replace(/^https?:/, wsProtocol)}/ws/voice`
    console.log(`[VoiceControlPage] 🔌 Connecting to voice bridge: ${wsUrl}`)

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[VoiceControlPage] ✅ Voice WebSocket bridge connected')
        setIsSessionActive(true)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)

          switch (msg.type) {
            case 'session_ready':
              console.log(`[VoiceControlPage] Session established: ${msg.sessionId}`)
              break

            case 'audio_chunk':
              playPcmChunk(msg.data, msg.turnId)
              break

            case 'transcript_chunk':
              if (msg.text) {
                setLiveTranscript((prev) => (msg.turnId !== currentTurnIdRef.current ? msg.text : `${prev} ${msg.text}`.trim()))
              }
              break

            case 'device_action_dispatched':
              if (Array.isArray(msg.actions)) {
                const newCards = msg.actions.map((a) => ({
                  id: a.commandId || `${a.device}-${Date.now()}`,
                  device: a.device,
                  action: a.action,
                  status: 'sent',
                  timestamp: Date.now(),
                  oppositeAction: getOppositeAction(a.action),
                  isReverting: false,
                  error: null,
                }))
                setActionCards((prev) => [...newCards, ...prev].slice(0, 4))
                setStatusMessage(`Dispatched: ${msg.actions.map((a) => `${a.device} -> ${a.action}`).join(', ')}`)
              }
              break

            case 'device_action_result':
              setActionCards((prev) =>
                prev.map((c) =>
                  c.device === msg.device
                    ? { ...c, status: msg.success ? 'success' : 'failed', message: msg.message }
                    : c
                )
              )
              if (msg.message) {
                setStatusMessage(msg.message)
              }
              break

            case 'interrupted':
              stopAudioPlayback()
              setVoiceState(VOICE_STATES.INTERRUPTED)
              setTimeout(() => {
                setVoiceState(VOICE_STATES.LISTENING)
                setStatusMessage('Listening... Speak now')
              }, 150)
              break

            case 'turn_complete':
              if (activeSourcesRef.current.length === 0) {
                setVoiceState(VOICE_STATES.LISTENING)
                setStatusMessage('Listening... Speak naturally')
              }
              break

            case 'latency_metric':
              if (msg.metric === 'time_to_first_audio_ms') {
                setLatencyMetrics((prev) => ({
                  ...prev,
                  timeToFirstAudioMs: msg.value,
                }))
              }
              break

            default:
              break
          }
        } catch (e) {
          // Non-JSON frame
        }
      }

      ws.onerror = (err) => {
        console.warn('[VoiceControlPage] Voice WebSocket error:', err)
      }

      ws.onclose = () => {
        console.log('[VoiceControlPage] Voice WebSocket bridge closed')
        setIsSessionActive(false)
        setVoiceState(VOICE_STATES.IDLE)
        setStatusMessage('Voice session ended. Tap orb to restart.')
      }

      // 1b. Initialize parallel SpeechRecognition for live streaming transcript
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition()
          rec.continuous = true
          rec.interimResults = true
          rec.lang = 'en-US'
          rec.onresult = (ev) => {
            let interim = ''
            let final = ''
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
              const res = ev.results[i]
              if (res.isFinal) {
                final += res[0].transcript
              } else {
                interim += res[0].transcript
              }
            }
            const recognized = (final || interim).trim()
            if (recognized) {
              lastTranscriptRef.current = recognized
              setLiveTranscript(recognized)

              // Ultra-fast 50+ Standard Color check while user is speaking (No AI call!)
              const matchedColor = matchLocalColor(recognized)
              if (matchedColor) {
                const key = `color-${matchedColor.name}-${matchedColor.r}-${matchedColor.g}-${matchedColor.b}`
                if (lastDispatchedCommandRef.current !== key) {
                  lastDispatchedCommandRef.current = key
                  const verbal = `Sure, setting projector color to ${matchedColor.name}.`
                  setStatusMessage(verbal)
                  speakConversationalAudio(verbal)
                  dispatchDeviceColorDirect(matchedColor)
                  sendWsControl({ type: 'fast_dispatch_command', text: recognized })
                }
                return
              }

              // Ultra-fast streaming relay intent check while user is speaking (No AI call!)
              const lower = recognized.toLowerCase()
              const isFan = /\b(fan|fans|ceiling\s+fan)\b/i.test(lower)
              const isLight = /\b(light|lights|lamp|bulb|tubelight)\b/i.test(lower)
              const isProjector = /\b(projector|screen|display)\b/i.test(lower)
              const isOn = /\b(turn\s+on|switch\s+on|power\s+on|start|activate|enable|on)\b/i.test(lower)
              const isOff = /\b(turn\s+off|switch\s+off|power\s+off|stop|deactivate|disable|off|kill|shutdown)\b/i.test(lower)

              let dev = null
              let act = null
              if (isFan && (isOn || isOff)) { dev = 'fan'; act = isOn ? 'ON' : 'OFF' }
              else if (isLight && (isOn || isOff)) { dev = 'light'; act = isOn ? 'ON' : 'OFF' }
              else if (isProjector && (isOn || isOff)) { dev = 'projector'; act = isOn ? 'ON' : 'OFF' }

              if (dev && act) {
                const key = `${dev}-${act}`
                if (lastDispatchedCommandRef.current !== key) {
                  lastDispatchedCommandRef.current = key
                  const verbal = act === 'ON' ? `Sure, turning on the ${dev}.` : `Sure, turning off the ${dev}.`
                  setStatusMessage(verbal)
                  speakConversationalAudio(verbal)
                  dispatchDeviceCommandDirect(dev, act)
                  sendWsControl({ type: 'fast_dispatch_command', text: recognized })
                }
              }
            }
          }
          rec.onerror = (e) => {
            if (e.error !== 'no-speech') {
              console.warn('[VoiceControlPage] SpeechRecognition notice:', e.error)
            }
          }
          rec.onend = () => {
            if (speechRecognitionRef.current) {
              try {
                speechRecognitionRef.current.start()
              } catch {}
            }
          }
          rec.start()
          speechRecognitionRef.current = rec
        } catch (recErr) {
          console.warn('[VoiceControlPage] SpeechRecognition init notice:', recErr.message)
        }
      }

      // 2. Capture microphone stream (16kHz mono linear PCM)
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          latency: 0,
        },
      })
      micStreamRef.current = micStream

      // 3. Initialize Web Audio Context & VAD Engine
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      })
      inputAudioCtxRef.current = audioCtx
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume()
      }

      const vad = new RealtimeVAD({
        sampleRate: 16000,
        silenceDurationMs: 650, // 650ms natural pause threshold
        minSpeechDurationMs: 160,
        maxUtteranceMs: 8000,
        calibrationDurationMs: 400,

        onSpeechStart: ({ timestamp }) => {
          lastDispatchedCommandRef.current = ''
          setVoiceState(VOICE_STATES.USER_SPEAKING)
          setStatusMessage('Heard speech... listening')
          sendWsControl({
            type: 'speech_start',
            timestamp,
          })
        },

        onSpeechEnd: ({ speechStartTime, speechEndTime, speechDurationMs, silenceDelayMs }) => {
          setVoiceState(VOICE_STATES.PROCESSING)
          setLatencyMetrics((prev) => ({
            ...prev,
            turnDetectionMs: Math.round(silenceDelayMs),
          }))

          handleProcessedUserTurn(lastTranscriptRef.current)
        },

        onBargeIn: () => {
          // INSTANT BARGE-IN: User spoke while assistant was speaking!
          lastDispatchedCommandRef.current = ''
          stopAudioPlayback()
          setVoiceState(VOICE_STATES.INTERRUPTED)
          sendWsControl({
            type: 'interrupt',
            timestamp: Date.now(),
          })
          setTimeout(() => {
            setVoiceState(VOICE_STATES.USER_SPEAKING)
            setStatusMessage('Listening...')
          }, 80)
        },

        onVolume: (vol) => {
          setMicVolume(vol)
        },

        onCalibrationComplete: ({ noiseFloor, speechThreshold }) => {
          setLatencyMetrics((prev) => ({
            ...prev,
            noiseFloor: Math.round(noiseFloor * 1000) / 1000,
            speechThreshold: Math.round(speechThreshold * 1000) / 1000,
          }))
          setStatusMessage('Listening... Speak naturally')
        },
      })

      vadRef.current = vad
      vad.startCalibration()

      // 4. Stream 16kHz PCM audio chunks to backend WebSocket
      const source = audioCtx.createMediaStreamSource(micStream)
      const bufferSize = 512 // 32ms frames at 16kHz
      const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1)
      scriptProcessorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (isMutedRef.current) return

        const inputData = e.inputBuffer.getChannelData(0)
        const pcm16 = new Int16Array(inputData.length)

        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]))
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }

        // Feed to VAD engine for real-time speech and silence detection
        vad.processSamples(pcm16)

        // Stream raw PCM chunk over WebSocket to backend
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(pcm16.buffer)
        }
      }

      source.connect(processor)
      const silentGain = audioCtx.createGain()
      silentGain.gain.value = 0
      processor.connect(silentGain)
      silentGain.connect(audioCtx.destination)
    } catch (err) {
      console.error('[VoiceControlPage] Voice session initialization failure:', err)
      setVoiceState(VOICE_STATES.ERROR)
      const isBlocked = err.name === 'NotAllowedError' || err.message?.includes('Permission denied')
      setErrorMessage(
        isBlocked
          ? 'Microphone blocked. Please click the lock icon in your address bar and allow microphone access.'
          : 'Could not access microphone hardware. Please check your system settings.'
      )
      setStatusMessage('Microphone access needed')
    }
  }, [apiBaseUrl, handleProcessedUserTurn, playPcmChunk, sendWsControl, stopAudioPlayback])

  // Stop Active Voice Session
  const stopVoiceSession = useCallback(() => {
    stopAudioPlayback()

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.abort()
      } catch {}
      speechRecognitionRef.current = null
    }

    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect()
      } catch {}
      scriptProcessorRef.current = null
    }

    if (inputAudioCtxRef.current) {
      try {
        inputAudioCtxRef.current.close()
      } catch {}
      inputAudioCtxRef.current = null
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
    }

    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch {}
      wsRef.current = null
    }

    if (vadRef.current) {
      vadRef.current.reset()
    }

    setIsSessionActive(false)
    setVoiceState(VOICE_STATES.IDLE)
    setStatusMessage('Voice session paused. Tap orb to speak.')
    setMicVolume(0)
  }, [stopAudioPlayback])

  // Automatically start voice session on mount
  useEffect(() => {
    startVoiceSession()
    return () => {
      stopVoiceSession()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle Orb Click: toggle session / mute / barge-in
  const handleOrbClick = () => {
    if (voiceState === VOICE_STATES.ERROR) {
      startVoiceSession()
      return
    }

    if (voiceState === VOICE_STATES.ASSISTANT_SPEAKING) {
      // Immediate manual tap to interrupt!
      stopAudioPlayback()
      sendWsControl({ type: 'interrupt', timestamp: Date.now() })
      setVoiceState(VOICE_STATES.LISTENING)
      setStatusMessage('Listening... Speak now')
      return
    }

    if (isSessionActive) {
      setIsMuted((prev) => {
        const next = !prev
        isMutedRef.current = next
        setStatusMessage(next ? 'Microphone muted' : 'Listening... Speak now')
        return next
      })
    } else {
      startVoiceSession()
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

  // Calculate dynamic orb glow scale based on real-time voice energy
  const voiceScale =
    voiceState === VOICE_STATES.USER_SPEAKING || (voiceState === VOICE_STATES.LISTENING && micVolume > 5)
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
                isSessionActive
                  ? voiceState === VOICE_STATES.ASSISTANT_SPEAKING
                    ? 'bg-emerald-400 animate-pulse'
                    : voiceState === VOICE_STATES.PROCESSING
                    ? 'bg-purple-400 animate-pulse'
                    : voiceState === VOICE_STATES.USER_SPEAKING
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-sky-400 animate-pulse'
                  : 'bg-zinc-500'
              }`}
            />
            <span className="text-[11px] text-white/50 tracking-wider uppercase font-medium">
              {voiceState === VOICE_STATES.ASSISTANT_SPEAKING
                ? 'Speaking'
                : voiceState === VOICE_STATES.PROCESSING
                ? 'Thinking'
                : voiceState === VOICE_STATES.USER_SPEAKING
                ? 'Listening'
                : voiceState === VOICE_STATES.LISTENING
                ? 'Ready'
                : isSessionActive
                ? 'Room 302'
                : 'Connecting Audio'}
            </span>
          </div>
        </div>

        <button
          onClick={() => {
            if (isSessionActive) {
              stopVoiceSession()
            } else {
              startVoiceSession()
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

          {/* Latency toggle pill */}
          <button
            onClick={() => setShowMetrics((p) => !p)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 text-[10px] text-white/50 cursor-pointer transition-colors"
            title="Toggle Live Latency Metrics"
          >
            <Activity className="w-3 h-3 text-sky-400" />
            <span>Metrics</span>
          </button>
        </div>

        {/* Live Latency Telemetry Badge (Collapsible) */}
        {showMetrics && (
          <div className="mb-4 px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-[11px] text-white/70 flex items-center gap-3 backdrop-blur-sm animate-fadeIn">
            <div>
              <span className="text-white/40 mr-1">VAD Turn:</span>
              <span className="text-sky-300 font-mono font-medium">{latencyMetrics.turnDetectionMs ? `${latencyMetrics.turnDetectionMs}ms` : '—'}</span>
            </div>
            <div>
              <span className="text-white/40 mr-1">AI Audio:</span>
              <span className="text-emerald-300 font-mono font-medium">{latencyMetrics.timeToFirstAudioMs ? `${latencyMetrics.timeToFirstAudioMs}ms` : '—'}</span>
            </div>
            <div>
              <span className="text-white/40 mr-1">NoiseFloor:</span>
              <span className="text-amber-300 font-mono font-medium">{latencyMetrics.noiseFloor !== null ? latencyMetrics.noiseFloor : '—'}</span>
            </div>
          </div>
        )}

        {/* Luminous Celestial Cloud Orb */}
        <div
          onClick={handleOrbClick}
          style={{ transform: `scale(${voiceScale})` }}
          className={`chatgpt-celestial-orb mx-auto relative cursor-pointer transition-transform duration-150 ${
            voiceState === VOICE_STATES.USER_SPEAKING || voiceState === VOICE_STATES.LISTENING ? 'is-listening' : ''
          } ${voiceState === VOICE_STATES.ASSISTANT_SPEAKING ? 'is-speaking' : ''} ${
            voiceState === VOICE_STATES.PROCESSING ? 'is-processing' : ''
          }`}
          title="Tap to speak, mute, or interrupt"
        >
          <div className="chatgpt-orb-nebula" />
        </div>

        {/* Unobtrusive Minimal Voice Status */}
        <div className="mt-7 flex flex-col items-center gap-2 max-w-sm">
          <div className="text-sm font-medium tracking-wide transition-all">
            {voiceState === VOICE_STATES.USER_SPEAKING && (
              <span className="text-amber-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
                Listening to you...
              </span>
            )}
            {voiceState === VOICE_STATES.LISTENING && (
              <span className="text-sky-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse inline-block" />
                Listening...
              </span>
            )}
            {voiceState === VOICE_STATES.PROCESSING && (
              <span className="text-purple-300 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                Thinking...
              </span>
            )}
            {voiceState === VOICE_STATES.ASSISTANT_SPEAKING && (
              <span className="text-emerald-300 flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                Speaking (Tap or speak to interrupt)
              </span>
            )}
            {voiceState === VOICE_STATES.INTERRUPTED && (
              <span className="text-amber-300 flex items-center gap-1.5 text-xs font-semibold">
                Interrupted
              </span>
            )}
            {voiceState === VOICE_STATES.IDLE && (
              <span className="text-white/40 flex items-center gap-1.5 font-normal text-xs tracking-wider">
                <Sparkles className="w-3 h-3 text-white/30" />
                Hey, classroom...
              </span>
            )}
            {voiceState === VOICE_STATES.ERROR && (
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
          {voiceState === VOICE_STATES.ERROR && (
            <div className="mt-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-left text-xs text-rose-200 space-y-2">
              <p>{errorMessage}</p>
              <button
                onClick={startVoiceSession}
                className="w-full py-1.5 px-3 bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 rounded-lg font-semibold text-center cursor-pointer transition-colors"
              >
                Grant Permission &amp; Retry
              </button>
            </div>
          )}
        </div>

        {/* 3. QUICK MOBILE THUMB COMMAND CHIPS (Centered, Easy Touch) */}
        <div className="w-full max-w-md my-3 select-none">
          <div className="text-[10px] uppercase font-bold tracking-wider text-white/40 mb-1.5 text-center">
            Quick Classroom Commands
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 px-1 justify-start sm:justify-center">
            {QUICK_MOBILE_COMMANDS.map((cmd) => (
              <button
                key={cmd.label}
                type="button"
                onClick={() => {
                  triggerHaptic('medium')
                  handleProcessedUserTurn(cmd.text)
                }}
                className="shrink-0 px-3 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.18] active:bg-white/25 border border-white/10 text-[11px] font-semibold text-white/90 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <span>{cmd.icon}</span>
                <span>{cmd.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 4. COMPACT TRANSIENT ACTION NOTIFICATIONS */}
        {actionCards.length > 0 && (
          <div className="w-full mt-2 sm:mt-4 space-y-2 max-h-36 overflow-y-auto px-1">
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
                    onClick={() => {
                      triggerHaptic('light')
                      handleRevertAction(card.id, card.device, card.oppositeAction)
                    }}
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

      {/* 5. BOTTOM CONTROLS (Ergonomic Thumb Bar with Center Action Button) */}
      <footer className="w-full max-w-md flex items-center justify-between gap-2.5 sm:gap-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-10 px-2 sm:px-0">
        {/* Left: Mic Mute / Unmute circular toggle */}
        <button
          onClick={() => {
            triggerHaptic('light')
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

        {/* Center: Hero Tap-to-Interrupt / Speak Tactical Button */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('impact')
            handleOrbClick()
          }}
          className={`h-12 sm:h-13 px-5 rounded-full flex items-center justify-center gap-2 font-bold text-xs tracking-wide transition-all active:scale-95 cursor-pointer shadow-lg shrink-0 ${
            voiceState === VOICE_STATES.ASSISTANT_SPEAKING
              ? 'bg-amber-400 text-slate-950 shadow-amber-400/30 ring-2 ring-white/50 animate-pulse'
              : voiceState === VOICE_STATES.PROCESSING
              ? 'bg-purple-600 text-white shadow-purple-600/30'
              : isSessionActive && !isMuted
              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-indigo-600/30 ring-2 ring-white/40'
              : 'bg-white/20 text-white'
          }`}
          title={
            voiceState === VOICE_STATES.ASSISTANT_SPEAKING
              ? 'Tap to Interrupt'
              : 'Microphone Active'
          }
        >
          {voiceState === VOICE_STATES.ASSISTANT_SPEAKING ? (
            <>
              <Volume2 className="w-4 h-4 animate-bounce" />
              <span>Interrupt</span>
            </>
          ) : voiceState === VOICE_STATES.PROCESSING ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Thinking...</span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4 animate-pulse" />
              <span>Live Mic</span>
            </>
          )}
        </button>

        {/* Right: Iconic White Pill Button matching reference image: [ Done ] */}
        <button
          onClick={() => {
            triggerHaptic('medium')
            stopVoiceSession()
            navigate('/teacher')
          }}
          className="flex-1 py-3 sm:py-3.5 px-4 sm:px-6 rounded-full bg-white text-black font-semibold text-xs sm:text-sm hover:bg-slate-100 active:scale-98 transition-all shadow-xl shadow-white/10 text-center cursor-pointer min-h-[44px] flex items-center justify-center"
        >
          Done
        </button>
      </footer>
    </div>
  )
}
