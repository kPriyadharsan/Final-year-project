import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSocket, useSocketEvent } from '../context/SocketContext'
import { API_BASE_URL } from '../config/api'
import {
  Mic,
  MicOff,
  Lightbulb,
  Fan,
  Projector,
  Power,
  Sparkles,
  LogOut,
  Radio,
  CheckCircle2,
  Lock,
  RefreshCw,
  Volume2,
  RotateCcw,
  AlertTriangle,
  Loader2,
  Palette,
  Sliders,
  ChevronRight,
  Maximize2,
} from 'lucide-react'
import { useHaptics } from '../hooks'
import { CircularColorPicker } from '../components/ui/CircularColorPicker'

export const VOICE_STATES = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking',
  ERROR: 'error',
}

// 25+ Rich Colors with zero-latency hardware RGB mapping
const FAST_COLORS = {
  green: { name: 'green', hex: '#10B981', r: 16, g: 185, b: 129 },
  'mint green': { name: 'mint green', hex: '#10B981', r: 16, g: 185, b: 129 },
  blue: { name: 'blue', hex: '#3B82F6', r: 59, g: 130, b: 246 },
  'ocean blue': { name: 'ocean blue', hex: '#3B82F6', r: 59, g: 130, b: 246 },
  red: { name: 'red', hex: '#EF4444', r: 239, g: 68, b: 68 },
  yellow: { name: 'yellow', hex: '#FACC15', r: 250, g: 204, b: 21 },
  purple: { name: 'purple', hex: '#A855F7', r: 168, g: 85, b: 247 },
  violet: { name: 'violet', hex: '#8B5CF6', r: 139, g: 92, b: 246 },
  pink: { name: 'pink', hex: '#EC4899', r: 236, g: 72, b: 153 },
  orange: { name: 'orange', hex: '#F97316', r: 249, g: 115, b: 22 },
  cyan: { name: 'cyan', hex: '#06B6D4', r: 6, g: 182, b: 212 },
  white: { name: 'white', hex: '#FFFFFF', r: 255, g: 255, b: 255 },
  magenta: { name: 'magenta', hex: '#D946EF', r: 217, g: 70, b: 239 },
  lime: { name: 'lime', hex: '#84CC16', r: 132, g: 204, b: 22 },
  amber: { name: 'amber', hex: '#F59E0B', r: 245, g: 158, b: 11 },
  teal: { name: 'teal', hex: '#14B8A6', r: 20, g: 184, b: 166 },
  aqua: { name: 'aqua', hex: '#00FFFF', r: 0, g: 255, b: 255 },
  gold: { name: 'gold', hex: '#EAB308', r: 234, g: 179, b: 8 },
  indigo: { name: 'indigo', hex: '#6366F1', r: 99, g: 102, b: 241 },
  rose: { name: 'rose', hex: '#F43F5E', r: 244, g: 63, b: 94 },
  'sky blue': { name: 'sky blue', hex: '#38BDF8', r: 56, g: 189, b: 248 },
}

const CHATGPT_VOICES = [
  { id: 'breeze', name: 'Breeze', gender: 'male', pitch: 1.0, rate: 1.1 },
  { id: 'cove', name: 'Cove', gender: 'male', pitch: 0.9, rate: 1.05 },
  { id: 'ember', name: 'Ember', gender: 'female', pitch: 1.15, rate: 1.1 },
  { id: 'juniper', name: 'Juniper', gender: 'female', pitch: 1.05, rate: 1.12 },
  { id: 'sol', name: 'Sol', gender: 'male', pitch: 0.95, rate: 1.05 },
  { id: 'vale', name: 'Vale', gender: 'female', pitch: 1.1, rate: 1.08 },
]

// Preset Colors for One-Tap Mobile Selection
const PRESET_COLORS = [
  { name: 'Mint Green', hex: '#10b981', r: 16, g: 185, b: 129 },
  { name: 'Pure White', hex: '#ffffff', r: 255, g: 255, b: 255 },
  { name: 'Ocean Blue', hex: '#3b82f6', r: 59, g: 130, b: 246 },
  { name: 'Neon Purple', hex: '#a855f7', r: 168, g: 85, b: 247 },
  { name: 'Warm Gold', hex: '#f59e0b', r: 245, g: 158, b: 11 },
  { name: 'Crimson Red', hex: '#ef4444', r: 239, g: 68, b: 68 },
  { name: 'Cyber Cyan', hex: '#06b6d4', r: 6, g: 182, b: 212 },
  { name: 'Sunset Orange', hex: '#f97316', r: 249, g: 115, b: 22 },
]

const QUICK_SUGGESTIONS = [
  { label: 'Turn on light', text: 'turn on the lights' },
  { label: 'Turn off fan', text: 'turn off the fan' },
  { label: 'Set projector green', text: 'set projector to green' },
  { label: 'Change color blue', text: 'change projector color to blue' },
  { label: 'Turn off projector light', text: 'turn off projector light' },
  { label: 'Everything ON', text: 'turn on everything' },
]

function getOppositeAction(action) {
  return String(action).toUpperCase() === 'ON' ? 'OFF' : 'ON'
}

/**
 * Fast-Path Pattern Matcher:
 * Detects common classroom commands (<1ms) locally without cloud LLM latency.
 * Supports natural English + Tamil keywords.
 */
function matchFastCommand(text) {
  if (!text) return null
  const t = text.toLowerCase().trim()

  // 1. RGB Light OFF
  if (
    (/\b(projector|rgb|led)\b/i.test(t) &&
      /\b(light|glow|color|led|rgb)\b/i.test(t) &&
      /\b(off|turn off|switch off|stop|disable)\b/i.test(t)) ||
    /\b(turn off projector light|projector light off|rgb off|led off|turn off rgb|turn off led|turn off projector color|turn off color)\b/i.test(t)
  ) {
    return { type: 'RGB_POWER', power: 'OFF' }
  }

  // 2. RGB Color Matching (e.g. "set projector to green", "projector blue", "color red")
  for (const [colorName, colorObj] of Object.entries(FAST_COLORS)) {
    const colorRegex = new RegExp(`\\b${colorName}\\b`, 'i')
    if (colorRegex.test(t)) {
      const isColorIntent =
        /\b(color|colour|glow|projector|light|rgb|led|set|change|make|turn|put|switch)\b/i.test(t) ||
        t.split(' ').length <= 4
      if (isColorIntent) {
        return { type: 'RGB_COLOR', colorName, colorObj }
      }
    }
  }

  // 3. State / Status Queries
  if (
    /\b(current state|state of the classroom|classroom state|device status|devices state|what is on|what's on|which device|status of the classroom|is the fan on|is the light on|is the projector on)\b/i.test(
      t
    )
  ) {
    return { type: 'STATE_QUERY' }
  }

  // 4. All devices ON / OFF
  const hasOn =
    /\b(turn\s+on|switch\s+on|power\s+on|enable|start|இயக்கு|போடு)\b/i.test(t) ||
    /\b(on)\b/i.test(t)
  const hasOff =
    /\b(turn\s+off|switch\s+off|power\s+off|disable|stop|shutdown|அணை)\b/i.test(t) ||
    /\b(off)\b/i.test(t)

  if (/\b(everything|all|all devices|classroom)\b/i.test(t) && (hasOn || hasOff)) {
    return { type: 'ALL_DEVICES', action: hasOff ? 'OFF' : 'ON' }
  }

  // 5. Individual devices (with English & Tamil terms)
  let device = null
  if (/\b(light|lights|lamp|bulb|விளக்கு|விளக்கை)\b/i.test(t)) device = 'light'
  else if (/\b(fan|fans|மின்விசிறி|காத்தாடி)\b/i.test(t)) device = 'fan'
  else if (/\b(projector|screen|ப்ரோஜெக்டர்)\b/i.test(t)) device = 'projector'

  if (device && (hasOn || hasOff)) {
    const isOff = hasOff && !hasOn
    return { type: 'DEVICE', device, action: isOff ? 'OFF' : 'ON' }
  }

  return null
}

export function StudentPage() {
  const navigate = useNavigate()
  const { user, token, logout, demoRevoked } = useAuth()
  const { isConnected: isSocketConnected, joinClassroom, leaveClassroom } = useSocket()
  const { triggerHaptic } = useHaptics()

  const selectedRoom = 'Room 302'

  // Mobile View Tabs: 'voice' | 'devices'
  const [activeTab, setActiveTab] = useState('voice')

  // Hardware Devices State
  const [devices, setDevices] = useState([
    {
      deviceId: 'ESP32-ROOM302-LIGHT-01',
      type: 'LIGHT',
      name: 'Classroom Light',
      state: 'OFF',
      classroom: 'Room 302',
    },
    {
      deviceId: 'ESP32-ROOM302-FAN-01',
      type: 'FAN',
      name: 'Ceiling Fan',
      state: 'OFF',
      classroom: 'Room 302',
    },
    {
      deviceId: 'ESP32-ROOM302-PROJ-01',
      type: 'PROJECTOR',
      name: 'Smart Projector',
      state: 'OFF',
      classroom: 'Room 302',
      color: { r: 16, g: 185, b: 129 },
      colorPower: 'OFF',
    },
  ])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pendingToggles, setPendingToggles] = useState({})
  const [projectorColor, setProjectorColor] = useState({ r: 16, g: 185, b: 129 })
  const [projectorColorPower, setProjectorColorPower] = useState('OFF')

  // ==========================================
  // VOICE AI ASSISTANT STATES & REFS
  // ==========================================
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState(3) // Juniper
  const [currentState, setCurrentState] = useState(VOICE_STATES.IDLE)
  const [isListeningActive, setIsListeningActive] = useState(false)
  const [statusMessage, setStatusMessage] = useState('Tap orb to speak')
  const [userTranscript, setUserTranscript] = useState('')
  const [isUserSpeaking, setIsUserSpeaking] = useState(false)
  const [assistantText, setAssistantText] = useState('')
  const [actionCards, setActionCards] = useState([])
  const [errorMessage, setErrorMessage] = useState('')
  const [isMuted, setIsMuted] = useState(false)
  const [micVolume, setMicVolume] = useState(0)

  // Immediate Execution Guard Refs
  const lastExecutedCommandRef = useRef({ text: '', time: 0 })
  const fastCommandTimerRef = useRef(null)
  const speakingTimeoutRef = useRef(null)
  const currentUtteranceRef = useRef(null)
  const isSpeakingRef = useRef(false)
  const recognitionRef = useRef(null)
  const isListeningRef = useRef(false)
  const isMutedRef = useRef(false)
  const activeAiAbortControllerRef = useRef(null)
  const micStreamRef = useRef(null)
  const analyserRef = useRef(null)
  const animFrameRef = useRef(null)

  // Color wheel throttling refs
  const inFlightColorRef = useRef(false)
  const queuedColorRef = useRef(null)
  const throttleTimerRef = useRef(null)
  const lastColorTimeRef = useRef(0)
  const THROTTLE_MS = 80

  // Admin Logout Soft Exit Animation State
  const [isLoggedOutByAdmin, setIsLoggedOutByAdmin] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const countdownTimerRef = useRef(null)

  // Listen for real-time demo session revocation from Super Admin
  const handleDemoRevoked = useCallback(() => {
    console.warn('[StudentPage] 🛑 Demo session revoked by instructor.')
    triggerHaptic?.('heavy')
    setIsLoggedOutByAdmin(true)
  }, [triggerHaptic])

  useSocketEvent('auth:demo_revoked', handleDemoRevoked)
  useSocketEvent('demo:revoked', handleDemoRevoked)
  useSocketEvent('demo:reset', handleDemoRevoked)

  useEffect(() => {
    if (demoRevoked && !isLoggedOutByAdmin) {
      handleDemoRevoked()
    }
  }, [demoRevoked, isLoggedOutByAdmin, handleDemoRevoked])

  // Soft Countdown and smooth redirection on admin logout
  useEffect(() => {
    if (!isLoggedOutByAdmin) return

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimerRef.current)
          logout()
          navigate('/login', { replace: true })
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    }
  }, [isLoggedOutByAdmin, logout, navigate])

  const handleManualExit = () => {
    triggerHaptic?.('light')
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    logout()
    navigate('/login', { replace: true })
  }

  // Join Socket.IO classroom room for real-time state synchronization
  useEffect(() => {
    if (selectedRoom) {
      joinClassroom(selectedRoom)
      return () => leaveClassroom(selectedRoom)
    }
  }, [selectedRoom, joinClassroom, leaveClassroom])

  // Fetch Classroom Devices from Backend
  const fetchDevices = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true)
      else setIsRefreshing(true)

      try {
        const res = await fetch(`${API_BASE_URL}/api/devices?classroom=${encodeURIComponent(selectedRoom)}`, {
          headers: token
            ? {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
              }
            : { Accept: 'application/json' },
        })

        if (!res.ok) {
          throw new Error(`Failed to load devices (HTTP ${res.status})`)
        }

        const data = await res.json()
        const channelDevices = (data.devices || data.data || []).filter(
          (d) =>
            d.entityType === 'CHANNEL' ||
            d.deviceCategory === 'CHANNEL' ||
            ['LIGHT', 'FAN', 'PROJECTOR'].includes(d.type)
        )

        if (channelDevices.length > 0) {
          const typeOrder = { LIGHT: 1, FAN: 2, PROJECTOR: 3 }
          channelDevices.sort((a, b) => (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99))
          setDevices(channelDevices)

          const proj = channelDevices.find((d) => d.type === 'PROJECTOR')
          if (proj?.color && (proj.color.r || proj.color.g || proj.color.b)) {
            setProjectorColor(proj.color)
          }
          if (proj?.colorPower) {
            setProjectorColorPower(proj.colorPower)
          }
        }
      } catch (err) {
        console.warn('[StudentPage] Device fetch note:', err.message)
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [token, selectedRoom]
  )

  useEffect(() => {
    fetchDevices(false)
  }, [fetchDevices])

  // Listen to incoming real-time Socket.IO device updates
  const handleDeviceUpdate = useCallback((incoming) => {
    if (!incoming || (!incoming.deviceId && !incoming.id && !incoming.type)) return

    setDevices((prev) =>
      prev.map((dev) => {
        const isMatch =
          dev.deviceId === incoming.deviceId ||
          dev._id === incoming.id ||
          dev._id === incoming.deviceId ||
          (dev.type && incoming.type && dev.type.toUpperCase() === incoming.type.toUpperCase())

        if (isMatch) {
          setPendingToggles((p) => {
            const next = { ...p }
            delete next[dev.deviceId || dev._id]
            return next
          })

          if (incoming.color && (incoming.color.r || incoming.color.g || incoming.color.b)) {
            setProjectorColor(incoming.color)
          }
          if (incoming.colorPower) {
            setProjectorColorPower(incoming.colorPower)
          }

          return {
            ...dev,
            state: incoming.state || dev.state,
            isOnline: typeof incoming.isOnline === 'boolean' ? incoming.isOnline : dev.isOnline,
            color: incoming.color || dev.color,
            colorPower: incoming.colorPower || dev.colorPower,
          }
        }
        return dev
      })
    )
  }, [])

  useSocketEvent('device:status', handleDeviceUpdate)
  useSocketEvent('device:state', handleDeviceUpdate)
  useSocketEvent('device:color', handleDeviceUpdate)
  useSocketEvent('projector:color', handleDeviceUpdate)

  // ==========================================
  // SPEECH SYNTHESIS & VOLUME ANALYSER
  // ==========================================
  const startVolumeAnalyser = useCallback((stream) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.4
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
      console.warn('[StudentPage] Analyser notice:', e.message)
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

  const speakUtterance = useCallback(
    (text) => {
      if (!('speechSynthesis' in window) || !text) return
      try {
        isSpeakingRef.current = true
        window.speechSynthesis.cancel()
        clearTimeout(speakingTimeoutRef.current)

        const utterance = new SpeechSynthesisUtterance(text)
        currentUtteranceRef.current = utterance // Prevent JavaScript GC mid-speech
        const persona = CHATGPT_VOICES[selectedVoiceIndex] || CHATGPT_VOICES[3]
        const voices = window.speechSynthesis.getVoices()

        const preferredVoice =
          voices.find(
            (v) =>
              v.lang.startsWith('en') &&
              (persona.gender === 'female'
                ? /female|woman|zira|samantha|karen|victoria|ava|jenny/i.test(v.name)
                : /male|man|david|george|alex|guy|christopher/i.test(v.name))
          ) || voices.find((v) => v.lang.startsWith('en'))

        if (preferredVoice) utterance.voice = preferredVoice
        utterance.pitch = persona.pitch || 1.05
        utterance.rate = persona.rate || 1.12

        utterance.onstart = () => {
          isSpeakingRef.current = true
          setCurrentState(VOICE_STATES.SPEAKING)
        }

        const handleDoneSpeaking = () => {
          isSpeakingRef.current = false
          currentUtteranceRef.current = null
          clearTimeout(speakingTimeoutRef.current)
          if (isListeningRef.current) {
            setCurrentState(VOICE_STATES.LISTENING)
            setStatusMessage('Listening... Speak now')
          } else {
            setCurrentState(VOICE_STATES.IDLE)
          }
        }

        utterance.onend = handleDoneSpeaking
        utterance.onerror = handleDoneSpeaking

        // Safety fallback timer so recognition never gets deadlocked on mobile browsers
        const safeDuration = Math.min(3000, Math.max(1200, text.length * 80))
        speakingTimeoutRef.current = setTimeout(handleDoneSpeaking, safeDuration)

        window.speechSynthesis.speak(utterance)
      } catch (err) {
        isSpeakingRef.current = false
        console.warn('[StudentPage] TTS warning:', err.message)
      }
    },
    [selectedVoiceIndex]
  )

  // ==========================================
  // FAST VOICE EXECUTION (<15ms ZERO LATENCY)
  // ==========================================
  const executeFastCommand = useCallback(
    async (match, rawText) => {
      triggerHaptic?.('medium')

      if (activeAiAbortControllerRef.current) {
        activeAiAbortControllerRef.current.abort()
        activeAiAbortControllerRef.current = null
      }
      window.speechSynthesis.cancel()

      if (match.type === 'DEVICE') {
        const dev = match.device
        const act = match.action
        const cardId = `${dev}-${Date.now()}`

        // Instant optimistic device state update
        setDevices((prev) =>
          prev.map((d) => {
            const isTarget =
              (dev === 'light' && (d.type === 'LIGHT' || d.type === 'CHANNEL')) ||
              (dev === 'fan' && d.type === 'FAN') ||
              (dev === 'projector' && d.type === 'PROJECTOR')
            return isTarget ? { ...d, state: act } : d
          })
        )

        setActionCards((prev) => [
          {
            id: cardId,
            device: dev,
            action: act,
            status: 'success',
            timestamp: Date.now(),
            oppositeAction: getOppositeAction(act),
            isReverting: false,
          },
          ...prev,
        ].slice(0, 4))

        const feedback = `${dev.charAt(0).toUpperCase() + dev.slice(1)} turned ${act.toLowerCase()}.`
        setStatusMessage(feedback)
        setAssistantText(feedback)
        speakUtterance(feedback)

        try {
          await fetch(`${API_BASE_URL}/api/voice/live/command`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              actions: [{ device: dev, action: act }],
              classroom: selectedRoom,
            }),
          })
        } catch (err) {
          console.warn('[StudentPage] Fast device command error:', err.message)
        }
      } else if (match.type === 'RGB_COLOR') {
        const { colorName, colorObj } = match
        const cardId = `projector-rgb-${Date.now()}`

        setProjectorColor(colorObj)
        setProjectorColorPower('ON')
        setDevices((prev) =>
          prev.map((d) => (d.type === 'PROJECTOR' ? { ...d, state: 'ON', color: colorObj, colorPower: 'ON' } : d))
        )

        setActionCards((prev) => [
          {
            id: cardId,
            device: 'projector',
            action: 'SET_COLOR',
            color: colorObj,
            status: 'success',
            timestamp: Date.now(),
            oppositeAction: 'OFF',
            isReverting: false,
          },
          ...prev,
        ].slice(0, 4))

        const feedback = `Projector set to ${colorName}.`
        setStatusMessage(feedback)
        setAssistantText(feedback)
        speakUtterance(feedback)

        try {
          await fetch(`${API_BASE_URL}/api/voice/live/rgb`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              device: 'projector',
              color: { name: colorName, hex: colorObj.hex, r: colorObj.r, g: colorObj.g, b: colorObj.b },
              colorName,
              power: 'ON',
              classroom: selectedRoom,
            }),
          })
        } catch (err) {
          console.warn('[StudentPage] Fast RGB error:', err.message)
        }
      } else if (match.type === 'RGB_POWER') {
        setProjectorColorPower('OFF')
        setDevices((prev) =>
          prev.map((d) => (d.type === 'PROJECTOR' ? { ...d, colorPower: 'OFF' } : d))
        )
        const feedback = 'Projector light turned off.'
        setStatusMessage(feedback)
        setAssistantText(feedback)
        speakUtterance(feedback)

        try {
          await fetch(`${API_BASE_URL}/api/voice/live/rgb`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ device: 'projector', power: 'OFF', classroom: selectedRoom }),
          })
        } catch {}
      } else if (match.type === 'ALL_DEVICES') {
        const act = match.action
        setDevices((prev) => prev.map((d) => ({ ...d, state: act })))
        const feedback = `All classroom devices turned ${act.toLowerCase()}.`
        setStatusMessage(feedback)
        setAssistantText(feedback)
        speakUtterance(feedback)

        try {
          await fetch(`${API_BASE_URL}/api/voice/live/command`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              actions: [
                { device: 'light', action: act },
                { device: 'fan', action: act },
                { device: 'projector', action: act },
              ],
              classroom: selectedRoom,
            }),
          })
        } catch {}
      } else if (match.type === 'STATE_QUERY') {
        const lightD = devices.find((d) => d.type === 'LIGHT')
        const fanD = devices.find((d) => d.type === 'FAN')
        const projD = devices.find((d) => d.type === 'PROJECTOR')

        const lightP = lightD?.state || 'OFF'
        const fanP = fanD?.state || 'OFF'
        const projP = projD?.state || 'OFF'
        const feedback = `Light is ${lightP}, fan is ${fanP}, and projector is ${projP}.`
        setStatusMessage(feedback)
        setAssistantText(feedback)
        speakUtterance(feedback)
      }
    },
    [token, selectedRoom, speakUtterance, devices, triggerHaptic]
  )

  // Execute Complex Commands via Gemini AI
  const executeAiCommand = useCallback(
    async (commandText) => {
      if (activeAiAbortControllerRef.current) {
        activeAiAbortControllerRef.current.abort()
      }
      window.speechSynthesis.cancel()

      const controller = new AbortController()
      activeAiAbortControllerRef.current = controller

      setCurrentState(VOICE_STATES.PROCESSING)
      setStatusMessage('AI Thinking...')

      try {
        const res = await fetch(`${API_BASE_URL}/api/voice/command`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ transcript: commandText, classroom: selectedRoom }),
          signal: controller.signal,
        })

        const data = await res.json()
        if (controller.signal.aborted) return

        if (res.ok && data.status === 'success') {
          const reply = data.data?.message || data.message || 'Command executed.'
          setStatusMessage(reply)
          setAssistantText(reply)
          speakUtterance(reply)

          if (data.data?.device && data.data?.action) {
            const dev = data.data.device
            const act = data.data.action

            setDevices((prev) =>
              prev.map((d) => {
                const isTarget =
                  (dev === 'light' && (d.type === 'LIGHT' || d.type === 'CHANNEL')) ||
                  (dev === 'fan' && d.type === 'FAN') ||
                  (dev === 'projector' && d.type === 'PROJECTOR')
                return isTarget ? { ...d, state: act } : d
              })
            )

            setActionCards((prev) => [
              {
                id: `${dev}-${Date.now()}`,
                device: dev,
                action: act,
                status: 'success',
                timestamp: Date.now(),
                oppositeAction: getOppositeAction(act),
                isReverting: false,
              },
              ...prev,
            ].slice(0, 4))
          }
        } else {
          const errMsg = data.message || 'Could not understand command.'
          setStatusMessage(errMsg)
          setAssistantText(errMsg)
          speakUtterance(errMsg)
        }
      } catch (err) {
        if (err.name === 'AbortError') return
        console.warn('[StudentPage] AI request error:', err.message)
        setStatusMessage('AI query could not complete.')
        if (isListeningRef.current) {
          setCurrentState(VOICE_STATES.LISTENING)
        }
      } finally {
        if (activeAiAbortControllerRef.current === controller) {
          activeAiAbortControllerRef.current = null
        }
      }
    },
    [token, selectedRoom, speakUtterance]
  )

  // ==========================================
  // ULTRA-RESPONSIVE WEB SPEECH API ENGINE
  // ==========================================
  const startFreshRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return null

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort()
      } catch {}
      recognitionRef.current = null
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.lang = 'en-US'
      recognition.continuous = false
      recognition.interimResults = true
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        isListeningRef.current = true
        setIsListeningActive(true)
        setCurrentState(VOICE_STATES.LISTENING)
        setStatusMessage('Listening... Speak now')
      }

      recognition.onresult = (event) => {
        if (isMutedRef.current || isSpeakingRef.current) return

        let fullTranscript = ''
        let hasInterim = false

        for (let i = 0; i < event.results.length; ++i) {
          fullTranscript += event.results[i][0].transcript
          if (!event.results[i].isFinal) {
            hasInterim = true
          }
        }

        const trimmedText = fullTranscript.trim()
        if (!trimmedText) return

        // 1. LIVE STREAMING TRANSCRIPT: Immediate 0ms word-by-word streaming
        setIsUserSpeaking(true)
        setUserTranscript(trimmedText)

        // Real-time barge-in: If user speaks while AI is thinking/speaking, cancel immediately
        if (activeAiAbortControllerRef.current) {
          activeAiAbortControllerRef.current.abort()
          activeAiAbortControllerRef.current = null
        }
        if (window.speechSynthesis && window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel()
          isSpeakingRef.current = false
          setCurrentState(VOICE_STATES.LISTENING)
        }

        const dispatchCommand = (text) => {
          const now = Date.now()
          if (
            now - lastExecutedCommandRef.current.time < 1200 &&
            lastExecutedCommandRef.current.text.toLowerCase() === text.toLowerCase()
          ) {
            return
          }
          lastExecutedCommandRef.current = { text, time: now }
          setIsUserSpeaking(false)

          const fastMatch = matchFastCommand(text)
          if (fastMatch) {
            console.log('[StudentPage] ⚡ Instant fast command triggered:', fastMatch, text)
            executeFastCommand(fastMatch, text)
          } else {
            console.log('[StudentPage] 🤖 Complex command -> Routing to Gemini AI:', text)
            executeAiCommand(text)
          }
        }

        // Fast-path instant debouncer (<200ms): If speech matches a hardware command, execute immediately!
        const fastMatch = matchFastCommand(trimmedText)
        if (fastMatch) {
          if (fastCommandTimerRef.current) {
            clearTimeout(fastCommandTimerRef.current)
          }
          fastCommandTimerRef.current = setTimeout(() => {
            dispatchCommand(trimmedText)
          }, 200)
        }

        // Final utterance fallback (when user pauses and silence is confirmed)
        if (!hasInterim && trimmedText) {
          if (fastCommandTimerRef.current) {
            clearTimeout(fastCommandTimerRef.current)
            fastCommandTimerRef.current = null
          }
          dispatchCommand(trimmedText)
        }
      }

      recognition.onerror = (e) => {
        if (e.error === 'aborted' || e.error === 'no-speech') return
        console.warn('[StudentPage] Speech recognition note:', e.error)
        if (e.error === 'not-allowed') {
          setCurrentState(VOICE_STATES.ERROR)
          setErrorMessage('Microphone blocked. Please allow microphone in browser address bar.')
          setStatusMessage('Microphone access blocked')
        }
      }

      recognition.onend = () => {
        setIsUserSpeaking(false)
        if (fastCommandTimerRef.current) {
          clearTimeout(fastCommandTimerRef.current)
          fastCommandTimerRef.current = null
        }
        // Auto-restart continuously if active session and not muted (rock-solid loop)
        if (isListeningRef.current && !isMutedRef.current) {
          setTimeout(() => {
            if (isListeningRef.current && !isMutedRef.current) {
              try {
                startFreshRecognition()
              } catch {}
            }
          }, 80)
        } else if (!isListeningRef.current) {
          setCurrentState(VOICE_STATES.IDLE)
        }
      }

      recognitionRef.current = recognition
      recognition.start()
      return recognition
    } catch (err) {
      console.warn('[StudentPage] Recognition start warning:', err.message)
      return null
    }
  }, [executeFastCommand, executeAiCommand])

  const stopVoiceSession = useCallback(() => {
    isListeningRef.current = false
    setIsListeningActive(false)
    setIsUserSpeaking(false)
    setCurrentState(VOICE_STATES.IDLE)
    setStatusMessage('Tap orb to speak')
    stopVolumeAnalyser()

    if (fastCommandTimerRef.current) {
      clearTimeout(fastCommandTimerRef.current)
      fastCommandTimerRef.current = null
    }
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current)
      speakingTimeoutRef.current = null
    }
    isSpeakingRef.current = false

    if (activeAiAbortControllerRef.current) {
      activeAiAbortControllerRef.current.abort()
      activeAiAbortControllerRef.current = null
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort()
      } catch {}
      recognitionRef.current = null
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
    }
  }, [stopVolumeAnalyser])

  const startVoiceSession = useCallback(async () => {
    setErrorMessage('')
    setCurrentState(VOICE_STATES.LISTENING)
    setStatusMessage('Listening... Speak naturally')
    isListeningRef.current = true
    setIsListeningActive(true)

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setCurrentState(VOICE_STATES.ERROR)
      setErrorMessage('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.')
      return
    }

    // Acquire microphone audio stream safely without blocking speech recognition
    if (!micStreamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        micStreamRef.current = stream
        startVolumeAnalyser(stream)
      } catch (err) {
        console.warn('[StudentPage] Optional mic analyser bypassed for mobile compatibility')
      }
    }

    startFreshRecognition()
  }, [startVolumeAnalyser, startFreshRecognition])

  useEffect(() => {
    return () => {
      stopVoiceSession()
    }
  }, [stopVoiceSession])

  const handleOrbClick = () => {
    triggerHaptic?.('medium')
    if (currentState === VOICE_STATES.ERROR) {
      startVoiceSession()
      return
    }

    if (isListeningActive) {
      if (currentState === VOICE_STATES.LISTENING) {
        setIsMuted((prev) => {
          const next = !prev
          isMutedRef.current = next
          setStatusMessage(next ? 'Microphone muted' : 'Listening... Speak now')
          return next
        })
      } else {
        if (activeAiAbortControllerRef.current) {
          activeAiAbortControllerRef.current.abort()
          activeAiAbortControllerRef.current = null
        }
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel()
        }
        setCurrentState(VOICE_STATES.LISTENING)
        setStatusMessage('Listening... Speak now')
      }
    } else {
      startVoiceSession()
    }
  }

  // Handle Action Undo / Revert
  const handleRevertAction = async (cardId, targetDevice, oppositeAction) => {
    triggerHaptic?.('medium')
    setActionCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, isReverting: true } : c))
    )

    try {
      const response = await fetch(`${API_BASE_URL}/api/voice/live/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          actions: [{ device: targetDevice, action: oppositeAction }],
          classroom: selectedRoom,
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

        setDevices((prev) =>
          prev.map((d) => {
            const isTarget =
              (targetDevice === 'light' && (d.type === 'LIGHT' || d.type === 'CHANNEL')) ||
              (targetDevice === 'fan' && d.type === 'FAN') ||
              (targetDevice === 'projector' && d.type === 'PROJECTOR')
            return isTarget ? { ...d, state: oppositeAction } : d
          })
        )

        const msg = `${targetDevice.toUpperCase()} switched ${oppositeAction}`
        setStatusMessage(msg)
        setAssistantText(msg)
        speakUtterance(msg)
      }
    } catch (err) {
      setActionCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, isReverting: false } : c))
      )
    }
  }

  // Execute Quick Suggestion chip
  const handleQuickSuggestion = (suggestion) => {
    triggerHaptic?.('light')
    setUserTranscript(suggestion.text)
    const fastMatch = matchFastCommand(suggestion.text)
    if (fastMatch) {
      executeFastCommand(fastMatch, suggestion.text)
    } else {
      executeAiCommand(suggestion.text)
    }
  }

  // ==========================================
  // HARDWARE TOGGLE & COLOR CONTROLS
  // ==========================================
  const handleToggleDevice = async (device) => {
    const devId = device.deviceId || device._id
    if (!devId || pendingToggles[devId]) return

    triggerHaptic?.('medium')
    const currentStateVal = device.state === 'ON' ? 'ON' : 'OFF'
    const nextAction = currentStateVal === 'ON' ? 'OFF' : 'ON'

    setPendingToggles((p) => ({ ...p, [devId]: true }))
    setDevices((prev) =>
      prev.map((d) => (d.deviceId === devId || d._id === devId ? { ...d, state: nextAction } : d))
    )

    try {
      const res = await fetch(`${API_BASE_URL}/api/devices/${encodeURIComponent(devId)}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: nextAction }),
      })

      if (!res.ok) {
        throw new Error('Failed to dispatch device command.')
      }
    } catch (err) {
      console.error('[StudentPage] Device command failed:', err)
      setDevices((prev) =>
        prev.map((d) => (d.deviceId === devId || d._id === devId ? { ...d, state: currentStateVal } : d))
      )
    } finally {
      setPendingToggles((p) => {
        const next = { ...p }
        delete next[devId]
        return next
      })
    }
  }

  // Live Throttled Color Sender (MQTT & Backend)
  const sendLiveProjectorColor = useCallback(
    async (targetColor, isFinal = false) => {
      const proj = devices.find((d) => d.type === 'PROJECTOR')
      const devId = proj?.deviceId || proj?._id || 'ESP32-ROOM302-PROJ-01'

      const now = Date.now()
      const timeSince = now - lastColorTimeRef.current

      if (!isFinal && timeSince < THROTTLE_MS) {
        queuedColorRef.current = targetColor
        if (!throttleTimerRef.current) {
          throttleTimerRef.current = setTimeout(() => {
            throttleTimerRef.current = null
            if (queuedColorRef.current) {
              const next = queuedColorRef.current
              queuedColorRef.current = null
              sendLiveProjectorColor(next, true)
            }
          }, THROTTLE_MS - timeSince)
        }
        return
      }

      inFlightColorRef.current = true
      lastColorTimeRef.current = now

      try {
        await fetch(`${API_BASE_URL}/api/devices/${encodeURIComponent(devId)}/color`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ power: 'ON', color: targetColor }),
        })
      } catch (err) {
        console.warn('[StudentPage] Live color update note:', err.message)
      } finally {
        inFlightColorRef.current = false
        if (queuedColorRef.current) {
          const next = queuedColorRef.current
          queuedColorRef.current = null
          sendLiveProjectorColor(next, true)
        }
      }
    },
    [devices, token]
  )

  const handleColorWheelChange = (newRgb, meta) => {
    setProjectorColor(newRgb)
    setProjectorColorPower('ON')
    setDevices((prev) =>
      prev.map((d) => (d.type === 'PROJECTOR' ? { ...d, state: 'ON', color: newRgb, colorPower: 'ON' } : d))
    )
    sendLiveProjectorColor(newRgb, meta?.isFinal === true)
  }

  const handleSelectPresetColor = (preset) => {
    triggerHaptic?.('light')
    setProjectorColor(preset)
    setProjectorColorPower('ON')
    setDevices((prev) =>
      prev.map((d) => (d.type === 'PROJECTOR' ? { ...d, state: 'ON', color: preset, colorPower: 'ON' } : d))
    )
    sendLiveProjectorColor(preset, true)
  }

  // Dynamic orb scaling according to voice volume meter or active speaking
  const voiceScale =
    isUserSpeaking
      ? 1.08 + (micVolume / 100) * 0.12
      : currentState === VOICE_STATES.LISTENING && micVolume > 5
      ? 1 + (micVolume / 100) * 0.12
      : 1

  // Projector device object
  const projectorDevice = devices.find((d) => d.type === 'PROJECTOR') || devices[2]
  const isProjectorOn = projectorDevice?.state === 'ON'
  const isProjectorPending = !!pendingToggles[projectorDevice?.deviceId || projectorDevice?._id]

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 selection:bg-emerald-500/20 selection:text-emerald-900 relative pb-24 font-sans">
      {/* Apple Vision Style Clean Ambient Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10 select-none">
        <div className="absolute -top-32 -left-32 w-[520px] h-[520px] bg-gradient-to-br from-emerald-200/35 via-teal-100/25 to-transparent rounded-full blur-3xl opacity-80" />
        <div className="absolute top-1/3 -right-32 w-[480px] h-[480px] bg-gradient-to-tr from-cyan-200/25 via-emerald-100/20 to-transparent rounded-full blur-3xl opacity-70" />
        <div className="absolute -bottom-32 left-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-teal-100/30 to-emerald-200/20 rounded-full blur-3xl opacity-60" />
      </div>

      {/* 1. TOP STICKY HEADER */}
      <header className="sticky top-0 z-30 border-b border-emerald-100/80 bg-white/85 backdrop-blur-2xl px-3 sm:px-6 py-2.5 sm:py-3 shadow-[0_2px_15px_rgba(16,185,129,0.03)]">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/25 shrink-0">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-xs sm:text-base font-extrabold text-slate-900 tracking-tight truncate">
                  Smart Classroom
                </h1>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                {user?.name || 'Demo Student'} &bull; {selectedRoom}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fetchDevices(true)}
              disabled={isRefreshing}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-50 hover:bg-emerald-50 text-slate-500 hover:text-emerald-700 border border-slate-200/80 transition-all cursor-pointer active:scale-95"
              title="Refresh Devices"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={handleManualExit}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-rose-50 hover:text-rose-600 border border-slate-200/80 text-xs font-semibold text-slate-600 transition-all cursor-pointer active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="text-[11px]">Exit</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. MOBILE-OPTIMIZED SEGMENTED TAB SWITCHER */}
      <div className="max-w-2xl mx-auto px-3 sm:px-6 pt-2.5 sm:pt-3">
        <div className="p-1 rounded-2xl bg-slate-200/60 backdrop-blur-md grid grid-cols-2 gap-1 border border-slate-200/80">
          <button
            type="button"
            onClick={() => {
              triggerHaptic?.('light')
              setActiveTab('voice')
            }}
            className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 sm:gap-2 transition-all cursor-pointer truncate ${
              activeTab === 'voice'
                ? 'bg-white text-slate-900 shadow-sm shadow-slate-300/50'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Mic className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'voice' ? 'text-emerald-600' : ''}`} />
            <span className="truncate">Voice Assistant</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic?.('light')
              setActiveTab('devices')
            }}
            className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 sm:gap-2 transition-all cursor-pointer truncate ${
              activeTab === 'devices'
                ? 'bg-white text-slate-900 shadow-sm shadow-slate-300/50'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sliders className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'devices' ? 'text-teal-600' : ''}`} />
            <span className="truncate">Device Switches</span>
          </button>
        </div>
      </div>

      {/* 3. MAIN CONTENT CONTAINER */}
      <main className="max-w-2xl mx-auto px-3 sm:px-6 pt-3 space-y-3.5">
        {/* =========================================================================
            TAB 1: VOICE AI ASSISTANT VIEW (PULSING ORB + TRANSCRIPTS + ACTIONS)
            ========================================================================= */}
        {activeTab === 'voice' && (
          <div className="space-y-3 animate-fadeIn">
            {/* Live Hardware Mini Status Strip */}
            <div className="bg-white/80 border border-emerald-100/80 rounded-2xl p-2 sm:p-2.5 backdrop-blur-xl shadow-xs flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar min-w-0">
                {devices.map((d) => {
                  const isOn = d.state === 'ON'
                  const isProj = d.type === 'PROJECTOR'
                  return (
                    <div
                      key={d.deviceId || d.type}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-xl text-[10px] sm:text-[11px] font-semibold border shrink-0 transition-all ${
                        isOn
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80 shadow-2xs'
                          : 'bg-slate-50 text-slate-500 border-slate-200/70'
                      }`}
                    >
                      {isProj && (
                        <span
                          className="w-2 h-2 rounded-full inline-block shrink-0"
                          style={{
                            backgroundColor: `rgb(${projectorColor.r}, ${projectorColor.g}, ${projectorColor.b})`,
                            boxShadow: `0 0 6px rgba(${projectorColor.r}, ${projectorColor.g}, ${projectorColor.b}, 0.5)`,
                          }}
                        />
                      )}
                      <span>
                        {d.type === 'LIGHT' ? 'Light' : d.type === 'FAN' ? 'Fan' : 'Projector'}:
                      </span>
                      <strong className={isOn ? 'text-emerald-700' : 'text-slate-400'}>
                        {isOn ? 'ON' : 'OFF'}
                      </strong>
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => navigate('/voice')}
                  className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-600 transition-all cursor-pointer"
                  title="Full Screen Immersive Voice Mode"
                >
                  <Maximize2 className="w-2.5 h-2.5" />
                  <span>Full Screen</span>
                </button>
                <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/70">
                  <Radio className="w-3 h-3" />
                  <span className="hidden sm:inline">Socket Live</span>
                </div>
              </div>
            </div>

            {/* Voice Arena Hero Card (Celestial Dark Chamber for Contrast) */}
            <div className="bg-gradient-to-b from-[#090d16] via-[#0b1329] to-[#040814] border border-slate-800/80 rounded-[28px] sm:rounded-[32px] p-4 sm:p-7 shadow-[0_12px_45px_rgba(0,0,0,0.25)] relative overflow-hidden text-center text-white flex flex-col items-center justify-between min-h-[430px] sm:min-h-[460px]">
              {/* Background ambient glow inside card */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] bg-sky-500/15 rounded-full blur-[80px] pointer-events-none" />
              </div>

              {/* Top Subheader: Status & Persona Dots */}
              <div className="w-full flex items-center justify-between z-10 gap-2 mb-1.5">
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-white/[0.06] border border-white/10 text-[10px] sm:text-[11px] backdrop-blur-md">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isListeningActive
                        ? currentState === VOICE_STATES.SPEAKING
                          ? 'bg-emerald-400 animate-pulse'
                          : currentState === VOICE_STATES.PROCESSING
                          ? 'bg-purple-400 animate-pulse'
                          : 'bg-sky-400 animate-pulse'
                        : 'bg-amber-400'
                    }`}
                  />
                  <span className="text-white/80 font-medium">
                    {currentState === VOICE_STATES.SPEAKING
                      ? 'Speaking'
                      : currentState === VOICE_STATES.PROCESSING
                      ? 'Thinking'
                      : currentState === VOICE_STATES.LISTENING
                      ? 'Listening...'
                      : 'Voice Ready'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/voice')}
                    className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all cursor-pointer"
                    title="Open Full Screen ChatGPT Voice UI"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Voice persona dots */}
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.06] border border-white/10">
                    {CHATGPT_VOICES.map((voice, idx) => (
                      <button
                        key={voice.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic?.('light')
                          setSelectedVoiceIndex(idx)
                        }}
                        className={`transition-all rounded-full cursor-pointer ${
                          idx === selectedVoiceIndex
                            ? 'w-2 h-2 bg-white'
                            : 'w-1 h-1 bg-white/20 hover:bg-white/40'
                        }`}
                        title={`Voice: ${voice.name}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Luminous Celestial Cloud Orb */}
              <div className="my-auto py-2 z-10">
                <div
                  onClick={handleOrbClick}
                  style={{ transform: `scale(${voiceScale})` }}
                  className={`chatgpt-celestial-orb mx-auto relative cursor-pointer transition-transform duration-150 ${
                    currentState === VOICE_STATES.LISTENING ? 'is-listening' : ''
                  } ${currentState === VOICE_STATES.SPEAKING ? 'is-speaking' : ''} ${
                    currentState === VOICE_STATES.PROCESSING ? 'is-processing' : ''
                  }`}
                  title="Tap to speak, interrupt, or mute"
                >
                  <div className="chatgpt-orb-nebula" />
                </div>
              </div>

              {/* Status Indicator & Live Transcripts Area */}
              <div className="z-10 mt-1 flex flex-col items-center gap-1.5 w-full">
                <div className="text-xs sm:text-sm font-medium tracking-wide">
                  {currentState === VOICE_STATES.LISTENING && (
                    <span className="text-sky-300 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping inline-block" />
                      Listening... Speak naturally
                    </span>
                  )}
                  {currentState === VOICE_STATES.PROCESSING && (
                    <span className="text-purple-300 flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                      AI Thinking...
                    </span>
                  )}
                  {currentState === VOICE_STATES.SPEAKING && (
                    <span className="text-emerald-300 flex items-center gap-2">
                      <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      Replying...
                    </span>
                  )}
                  {currentState === VOICE_STATES.IDLE && (
                    <span className="text-white/60 flex items-center gap-1.5 text-xs">
                      <Sparkles className="w-3 h-3 text-emerald-400" />
                      Tap the orb to start speaking
                    </span>
                  )}
                  {currentState === VOICE_STATES.ERROR && (
                    <span className="text-rose-400 flex items-center gap-1.5 text-xs">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      Microphone permission needed
                    </span>
                  )}
                </div>

                {/* ======================================================== */}
                {/* COMPACT & MODERN LIVE TRANSCRIPT DISPLAY                 */}
                {/* ======================================================== */}
                <div className="w-full max-w-[310px] sm:max-w-[360px] flex flex-col items-center gap-2 my-1">
                  {/* Real-Time Live User Speech (Interim + Final streaming) */}
                  {userTranscript ? (
                    <div
                      className="w-full px-3.5 py-2.5 rounded-2xl border flex items-start gap-2.5 text-left shadow-lg backdrop-blur-md animate-fadeIn"
                      style={{
                        backgroundColor: 'rgba(15, 23, 42, 0.94)',
                        borderColor: isUserSpeaking ? 'rgba(56, 189, 248, 0.55)' : 'rgba(16, 185, 129, 0.4)',
                        boxShadow: isUserSpeaking ? '0 0 20px rgba(56, 189, 248, 0.22)' : '0 0 12px rgba(16, 185, 129, 0.12)',
                      }}
                    >
                      {/* Live Audio Equalizer Waveform Indicator */}
                      <div className="mt-1 shrink-0 flex items-center gap-0.5">
                        {isUserSpeaking ? (
                          <div className="flex items-center gap-0.5 h-3.5">
                            <span className="w-0.5 h-2.5 bg-sky-400 rounded-full animate-pulse" />
                            <span className="w-0.5 h-3.5 bg-sky-300 rounded-full animate-bounce" style={{ animationDelay: '100ms' }} />
                            <span className="w-0.5 h-2 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                            <span className="w-0.5 h-3 bg-sky-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span
                            className="text-[9px] sm:text-[10px] uppercase tracking-wider font-extrabold flex items-center gap-1.5"
                            style={{ color: isUserSpeaking ? '#38bdf8' : '#34d399' }}
                          >
                            <span>{isUserSpeaking ? 'Listening to speech...' : 'Recognized:'}</span>
                          </span>
                          {isUserSpeaking && (
                            <span className="px-1.5 py-0.2 rounded-full text-[8px] font-mono font-bold bg-sky-500/25 text-sky-200 border border-sky-400/30 uppercase tracking-widest animate-pulse">
                              Live 0ms
                            </span>
                          )}
                        </div>
                        <p
                          className="no-light-override text-xs sm:text-sm font-bold tracking-wide break-words leading-relaxed select-text"
                          style={{ color: '#ffffff' }}
                        >
                          &ldquo;{userTranscript}&rdquo;
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="w-full py-1.5 px-3 text-center text-[10px] sm:text-[11px] font-medium tracking-wide rounded-full bg-white/[0.06] border border-white/10"
                      style={{ color: '#cbd5e1' }}
                    >
                      {currentState === VOICE_STATES.LISTENING
                        ? 'Listening... Speak naturally in English or Tamil'
                        : 'Tap the orb to start speaking'}
                    </div>
                  )}

                  {/* Immediate Response Feedback Pill */}
                  {actionCards.length > 0 && (
                    <div
                      className="w-full px-3 py-1.5 rounded-xl border flex items-center justify-between gap-2 shadow-xs backdrop-blur-md animate-fadeIn"
                      style={{
                        backgroundColor: 'rgba(6, 78, 59, 0.45)',
                        borderColor: 'rgba(16, 185, 129, 0.45)',
                      }}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 text-xs font-semibold text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="no-light-override truncate text-[11px]" style={{ color: '#a7f3d0' }}>
                          {actionCards[0].action === 'SET_COLOR'
                            ? `Projector light set to ${actionCards[0].color?.name || 'color'}`
                            : `${actionCards[0].device?.toUpperCase()} switched ${actionCards[0].action}`}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono font-bold text-emerald-300 px-1.5 py-0.5 rounded-md bg-emerald-500/25 border border-emerald-400/30 shrink-0">
                        ⚡ Instant
                      </span>
                    </div>
                  )}

                  {/* Assistant Spoken Response Card */}
                  {assistantText && (
                    <div
                      className="w-full px-3 py-1.5 rounded-xl border text-left flex items-start gap-2 shadow-md backdrop-blur-md animate-fadeIn"
                      style={{
                        backgroundColor: 'rgba(88, 28, 135, 0.35)',
                        borderColor: 'rgba(168, 85, 247, 0.45)',
                        color: '#ffffff',
                      }}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-300 mt-0.5 shrink-0" />
                      <p className="no-light-override text-[10px] sm:text-xs text-purple-100 font-medium break-words leading-snug" style={{ color: '#f3e8ff' }}>
                        {assistantText}
                      </p>
                    </div>
                  )}
                </div>

                {/* Error Helper */}
                {currentState === VOICE_STATES.ERROR && (
                  <div className="w-full max-w-xs mt-1 p-2 bg-rose-500/15 border border-rose-500/30 rounded-xl text-left text-xs text-rose-200 space-y-1">
                    <p className="text-[11px] leading-tight">{errorMessage}</p>
                    <button
                      type="button"
                      onClick={startVoiceSession}
                      className="w-full py-1 px-2.5 bg-rose-500/25 hover:bg-rose-500/40 text-rose-100 rounded-lg font-semibold text-center text-xs cursor-pointer"
                    >
                      Grant Permission &amp; Retry
                    </button>
                  </div>
                )}

                {/* Recent Action Badges with One-Tap Revert / Undo */}
                {actionCards.length > 0 && (
                  <div className="w-full max-w-sm mt-1 space-y-1.5 max-h-24 overflow-y-auto px-1 no-scrollbar">
                    {actionCards.map((card) => {
                      const isOn = String(card.action).toUpperCase() === 'ON'
                      const isRgb = card.action === 'SET_COLOR'
                      return (
                        <div
                          key={card.id}
                          className="w-full flex items-center justify-between px-2.5 py-1 rounded-full bg-white/[0.08] hover:bg-white/[0.12] border border-white/10 backdrop-blur-md shadow-xs transition-all text-xs"
                        >
                          <div className="flex items-center gap-1.5 text-xs font-medium text-white tracking-wide truncate mr-2">
                            {isRgb ? (
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                                style={{
                                  backgroundColor: card.color?.hex || '#10b981',
                                  boxShadow: `0 0 6px ${card.color?.hex || '#10b981'}`,
                                }}
                              />
                            ) : (
                              <span
                                className={
                                  isOn
                                    ? 'text-emerald-400 font-bold shrink-0'
                                    : 'text-white/40 font-bold shrink-0'
                                }
                              >
                                ✓
                              </span>
                            )}
                            <span className="capitalize text-white/95 truncate text-[11px]">
                              {card.device}
                            </span>
                            <span
                              className={`font-semibold uppercase text-[9px] shrink-0 ${
                                isOn
                                  ? 'text-emerald-400'
                                  : isRgb
                                  ? 'text-teal-300 capitalize'
                                  : 'text-white/40'
                              }`}
                            >
                              {isRgb ? card.color?.name || 'Active' : card.action}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              handleRevertAction(card.id, card.device, card.oppositeAction)
                            }
                            disabled={card.isReverting}
                            className="px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white/90 font-bold text-[9px] tracking-wider uppercase border border-white/10 transition-all cursor-pointer disabled:opacity-50 shrink-0"
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
              </div>

              {/* Bottom Dock: Mic Mute / Unmute & Restart */}
              <div className="w-full max-w-xs flex items-center justify-between z-10 gap-2.5 pt-2.5 mt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic?.('light')
                    setIsMuted((prev) => {
                      const next = !prev
                      isMutedRef.current = next
                      setStatusMessage(next ? 'Microphone muted' : 'Listening... Speak now')
                      return next
                    })
                  }}
                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-white/15 flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0 ${
                    isMuted
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                  title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic?.('medium')
                    if (isListeningActive) stopVoiceSession()
                    else startVoiceSession()
                  }}
                  className={`flex-1 py-2 px-3 rounded-full font-bold text-xs transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shadow-md ${
                    isListeningActive
                      ? 'bg-rose-500/90 hover:bg-rose-600 text-white shadow-rose-500/20'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-emerald-500/25'
                  }`}
                >
                  {isListeningActive ? (
                    <>
                      <MicOff className="w-3.5 h-3.5" />
                      <span>Stop Listening</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5" />
                      <span>Start Listening</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic?.('light')
                    if (isListeningActive) {
                      stopVoiceSession()
                      setTimeout(startVoiceSession, 100)
                    } else {
                      startVoiceSession()
                    }
                  }}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white/80 hover:text-white transition-all cursor-pointer border border-white/15 shrink-0"
                  title="Restart Voice Session"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Try-It Chips */}
            <div className="bg-white/80 border border-slate-200/80 rounded-2xl p-3 shadow-xs backdrop-blur-xl space-y-1.5">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Quick Voice Commands (Tap to execute)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_SUGGESTIONS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => handleQuickSuggestion(item)}
                    className="px-2.5 py-1 rounded-xl bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 active:scale-95 text-slate-700 font-semibold text-[11px] border border-slate-200/80 transition-all cursor-pointer flex items-center gap-1"
                  >
                    <span>{item.label}</span>
                    <ChevronRight className="w-3 h-3 opacity-40" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: CLASSROOM DEVICES VIEW (CONSISTENT MOBILE BUTTON SIZES)
            ========================================================================= */}
        {activeTab === 'devices' && (
          <div className="space-y-3.5 animate-fadeIn">
            {/* Devices Grid: Light & Fan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Device 1: Main Classroom Light */}
              {(() => {
                const lightDevice = devices.find((d) => d.type === 'LIGHT') || devices[0]
                const isOn = lightDevice?.state === 'ON'
                const devId = lightDevice?.deviceId || lightDevice?._id || 'LIGHT'
                const isPending = !!pendingToggles[devId]

                return (
                  <div
                    key={devId}
                    className={`bg-white/95 border rounded-[24px] p-4 backdrop-blur-xl shadow-xs transition-all duration-200 flex flex-col justify-between space-y-3 ${
                      isOn
                        ? 'border-emerald-300 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-400/20'
                        : 'border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${
                          isOn
                            ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        <Lightbulb className="w-5 h-5" />
                      </div>

                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${
                          isOn
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                            : 'bg-slate-100 text-slate-500 border border-slate-200/60'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isOn ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                          }`}
                        />
                        <span>{isOn ? 'ACTIVE (ON)' : 'STANDBY (OFF)'}</span>
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                        Classroom Light
                      </h3>
                      <p className="text-[11px] text-slate-400 font-mono">GPIO 23 &bull; Relay 1</p>
                    </div>

                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleToggleDevice(lightDevice)}
                      className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-60 min-h-[42px] ${
                        isOn
                          ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm shadow-rose-600/20'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/20'
                      }`}
                    >
                      <Power className={`w-3.5 h-3.5 ${isPending ? 'animate-spin' : ''}`} />
                      <span>{isOn ? 'Turn OFF' : 'Turn ON'}</span>
                    </button>
                  </div>
                )
              })()}

              {/* Device 2: Ceiling Fan */}
              {(() => {
                const fanDevice = devices.find((d) => d.type === 'FAN') || devices[1]
                const isOn = fanDevice?.state === 'ON'
                const devId = fanDevice?.deviceId || fanDevice?._id || 'FAN'
                const isPending = !!pendingToggles[devId]

                return (
                  <div
                    key={devId}
                    className={`bg-white/95 border rounded-[24px] p-4 backdrop-blur-xl shadow-xs transition-all duration-200 flex flex-col justify-between space-y-3 ${
                      isOn
                        ? 'border-emerald-300 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-400/20'
                        : 'border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${
                          isOn
                            ? 'bg-teal-500 text-white shadow-md shadow-teal-500/30'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        <Fan className={`w-5 h-5 ${isOn ? 'animate-spin' : ''}`} />
                      </div>

                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${
                          isOn
                            ? 'bg-teal-50 text-teal-700 border border-teal-200/80'
                            : 'bg-slate-100 text-slate-500 border border-slate-200/60'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isOn ? 'bg-teal-500 animate-pulse' : 'bg-slate-400'
                          }`}
                        />
                        <span>{isOn ? 'SPINNING (ON)' : 'STANDBY (OFF)'}</span>
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                        Ceiling Fan
                      </h3>
                      <p className="text-[11px] text-slate-400 font-mono">GPIO 22 &bull; Relay 2</p>
                    </div>

                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleToggleDevice(fanDevice)}
                      className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-60 min-h-[42px] ${
                        isOn
                          ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm shadow-rose-600/20'
                          : 'bg-teal-600 hover:bg-teal-500 text-white shadow-sm shadow-teal-600/20'
                      }`}
                    >
                      <Power className={`w-3.5 h-3.5 ${isPending ? 'animate-spin' : ''}`} />
                      <span>{isOn ? 'Turn OFF' : 'Turn ON'}</span>
                    </button>
                  </div>
                )
              })()}
            </div>

            {/* Device 3: Smart Projector (Unified Card with Identical Sized Button) */}
            <div className="bg-white/95 border border-emerald-200/90 rounded-[26px] p-4 sm:p-5 backdrop-blur-xl shadow-md shadow-emerald-500/5 space-y-3.5">
              {/* Header: Exact same layout as Light & Fan */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${
                      isProjectorOn
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <Projector className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                      Smart Projector
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono">
                      GPIO 21 &bull; Relay 3 &bull; RGB LED
                    </p>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${
                    isProjectorOn
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80'
                      : 'bg-slate-100 text-slate-500 border border-slate-200/60'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isProjectorOn ? 'bg-indigo-500 animate-pulse' : 'bg-slate-400'
                    }`}
                  />
                  <span>{isProjectorOn ? 'ACTIVE (ON)' : 'STANDBY (OFF)'}</span>
                </span>
              </div>

              {/* Exact full-width Turn ON/OFF Button matching Fan and Light */}
              <button
                type="button"
                disabled={isProjectorPending}
                onClick={() => handleToggleDevice(projectorDevice)}
                className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-60 min-h-[42px] ${
                  isProjectorOn
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm shadow-rose-600/20'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/20'
                }`}
              >
                <Power className={`w-3.5 h-3.5 ${isProjectorPending ? 'animate-spin' : ''}`} />
                <span>{isProjectorOn ? 'Turn OFF' : 'Turn ON'}</span>
              </button>

              {/* Interactive RGB Color Wheel Section */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50/80 border border-slate-200/70 flex flex-col items-center justify-center space-y-2.5">
                <div className="flex items-center justify-between w-full px-0.5">
                  <div className="flex items-center gap-1.5">
                    <Palette className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-800">
                      RGB Color Wheel
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-full border border-black/10 shadow-xs"
                      style={{
                        backgroundColor: `rgb(${projectorColor.r}, ${projectorColor.g}, ${projectorColor.b})`,
                      }}
                    />
                    <span className="text-[10px] font-mono font-bold text-slate-600 uppercase">
                      rgb({projectorColor.r},{projectorColor.g},{projectorColor.b})
                    </span>
                  </div>
                </div>

                <div className="py-1 flex items-center justify-center w-full overflow-hidden">
                  <CircularColorPicker
                    color={projectorColor}
                    power={isProjectorOn && projectorColorPower !== 'OFF' ? 'ON' : 'OFF'}
                    onChange={handleColorWheelChange}
                    onDragEnd={(finalRgb) => sendLiveProjectorColor(finalRgb, true)}
                    onDisabledClick={() => {
                      if (!isProjectorOn) handleToggleDevice(projectorDevice)
                    }}
                    disabled={false}
                    size={155}
                  />
                </div>

                <p className="text-[10px] sm:text-[11px] text-slate-500 text-center max-w-xs leading-tight">
                  {isProjectorOn
                    ? 'Drag or tap along the wheel for instant zero-latency RGB light color changes.'
                    : 'Projector is currently OFF. Dragging the wheel or tapping a preset turns it ON.'}
                </p>
              </div>

              {/* Color Presets */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-600 block">
                  Color Presets
                </span>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                  {PRESET_COLORS.map((preset) => {
                    const isSelected =
                      projectorColor.r === preset.r &&
                      projectorColor.g === preset.g &&
                      projectorColor.b === preset.b

                    return (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => handleSelectPresetColor(preset)}
                        className={`flex flex-col items-center justify-center p-1.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-500/30'
                            : 'border-slate-200/80 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className="w-4 h-4 sm:w-5 sm:h-5 rounded-full border border-black/10 shadow-xs mb-1"
                          style={{ backgroundColor: preset.hex }}
                        />
                        <span className="text-[9px] font-bold text-slate-700 truncate w-full text-center">
                          {preset.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Minimal Footer Note */}
        <p className="text-center text-[10px] sm:text-[11px] text-slate-400 pt-2 pb-4">
          AI Voice-Controlled Smart Classroom &bull; Demo Access &bull; Room 302
        </p>
      </main>

      {/* =========================================================================
          SOFT APPLE-STYLE LOGOUT ANIMATION OVERLAY
          Triggers smoothly when Super Admin resets or logs out the demo session.
          ========================================================================= */}
      {isLoggedOutByAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-2xl bg-slate-900/40 transition-all duration-500 animate-fadeIn">
          <div className="w-full max-w-sm bg-white/95 border border-emerald-200/90 rounded-[32px] p-6 sm:p-8 text-center shadow-2xl shadow-slate-900/20 backdrop-blur-3xl space-y-5 animate-scaleUp">
            <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-emerald-800 bg-emerald-100/80 border border-emerald-200/80 mb-1">
                <span>Smart Classroom</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Demo Session Concluded
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                The instructor has concluded or reset the live demonstration. Thank you for testing the Smart Classroom!
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs font-medium text-slate-600 flex items-center justify-center gap-2">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                Returning to welcome screen in <strong>{countdown}s</strong>...
              </span>
            </div>

            <button
              type="button"
              onClick={handleManualExit}
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs shadow-md shadow-emerald-600/25 transition-all cursor-pointer"
            >
              Done &bull; Return to Login
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
