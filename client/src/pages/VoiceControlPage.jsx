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

export const VOICE_STATES = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  SPEAKING: 'speaking',
  ERROR: 'error',
}

// 25+ Rich Default Fast Colors with exact hardware RGB mappings (Zero AI Latency)
const FAST_COLORS = {
  green: { name: 'green', hex: '#10B981', r: 0, g: 255, b: 0 },
  blue: { name: 'blue', hex: '#3B82F6', r: 0, g: 0, b: 255 },
  red: { name: 'red', hex: '#EF4444', r: 255, g: 0, b: 0 },
  yellow: { name: 'yellow', hex: '#FACC15', r: 255, g: 255, b: 0 },
  purple: { name: 'purple', hex: '#A855F7', r: 168, g: 85, b: 247 },
  violet: { name: 'violet', hex: '#8B5CF6', r: 139, g: 92, b: 246 },
  pink: { name: 'pink', hex: '#EC4899', r: 255, g: 105, b: 180 },
  orange: { name: 'orange', hex: '#F97316', r: 255, g: 128, b: 0 },
  cyan: { name: 'cyan', hex: '#06B6D4', r: 0, g: 255, b: 255 },
  white: { name: 'white', hex: '#FFFFFF', r: 255, g: 255, b: 255 },
  magenta: { name: 'magenta', hex: '#D946EF', r: 255, g: 0, b: 255 },
  lime: { name: 'lime', hex: '#84CC16', r: 132, g: 204, b: 22 },
  amber: { name: 'amber', hex: '#F59E0B', r: 245, g: 158, b: 11 },
  teal: { name: 'teal', hex: '#14B8A6', r: 20, g: 184, b: 166 },
  aqua: { name: 'aqua', hex: '#00FFFF', r: 0, g: 255, b: 255 },
  gold: { name: 'gold', hex: '#EAB308', r: 234, g: 179, b: 8 },
  indigo: { name: 'indigo', hex: '#6366F1', r: 99, g: 102, b: 241 },
  rose: { name: 'rose', hex: '#F43F5E', r: 244, g: 63, b: 94 },
  'warm white': { name: 'warm white', hex: '#FFF7ED', r: 255, g: 247, b: 237 },
  'cool white': { name: 'cool white', hex: '#F0FDF4', r: 240, g: 253, b: 244 },
  'sky blue': { name: 'sky blue', hex: '#38BDF8', r: 56, g: 189, b: 248 },
  lavender: { name: 'lavender', hex: '#C084FC', r: 192, g: 132, b: 252 },
}

const CHATGPT_VOICES = [
  { id: 'breeze', name: 'Breeze', gender: 'male', pitch: 1.0, rate: 1.1 },
  { id: 'cove', name: 'Cove', gender: 'male', pitch: 0.9, rate: 1.05 },
  { id: 'ember', name: 'Ember', gender: 'female', pitch: 1.15, rate: 1.1 },
  { id: 'juniper', name: 'Juniper', gender: 'female', pitch: 1.05, rate: 1.12 },
  { id: 'sol', name: 'Sol', gender: 'male', pitch: 0.95, rate: 1.05 },
  { id: 'vale', name: 'Vale', gender: 'female', pitch: 1.1, rate: 1.08 },
]

// Quick Action Preset Buttons for instant one-tap testing without typing
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

/**
 * Fast-Path Pattern Matcher:
 * Detects common classroom hardware commands instantaneously (<1ms)
 * without needing an expensive cloud LLM round-trip.
 */
function matchFastCommand(text) {
  if (!text) return null
  const t = text.toLowerCase().trim()

  // 1. RGB Light OFF matching
  if (
    (/\b(projector|rgb|led)\b/i.test(t) && /\b(light|glow|color|led|rgb)\b/i.test(t) && /\b(off|turn off|switch off|stop|disable)\b/i.test(t)) ||
    /\b(turn off projector light|projector light off|rgb off|led off|turn off rgb|turn off led|turn off projector color|turn off color)\b/i.test(t)
  ) {
    return { type: 'RGB_POWER', power: 'OFF' }
  }

  // 2. RGB Color Matching (e.g. "set color of the projector green", "change projector color to red", "make it purple", "blue glow")
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

  // 3. State / Status Queries (e.g. "what is the current state of the classroom", "what is on", "is fan on")
  if (
    /\b(current state|state of the classroom|classroom state|device status|devices state|what is on|what's on|which device|status of the classroom|is the fan on|is the light on|is the projector on)\b/i.test(t)
  ) {
    return { type: 'STATE_QUERY' }
  }

  // 4. All devices ON / OFF
  const hasOn = /\b(turn\s+on|switch\s+on|power\s+on|enable|start)\b/i.test(t) || /\b(on)\b/i.test(t)
  const hasOff = /\b(turn\s+off|switch\s+off|power\s+off|disable|stop|shutdown)\b/i.test(t) || /\b(off)\b/i.test(t)

  if (/\b(everything|all|all devices|classroom)\b/i.test(t) && (hasOn || hasOff)) {
    return { type: 'ALL_DEVICES', action: hasOff ? 'OFF' : 'ON' }
  }

  // 5. Individual devices: light, fan, projector
  let device = null
  if (/\b(light|lights|lamp|bulb)\b/i.test(t)) device = 'light'
  else if (/\b(fan|fans)\b/i.test(t)) device = 'fan'
  else if (/\b(projector|screen)\b/i.test(t)) device = 'projector'

  if (device && (hasOn || hasOff)) {
    const isOff = /\b(off|turn off|switch off|power off|disable|stop)\b/i.test(t)
    return { type: 'DEVICE', device, action: isOff ? 'OFF' : 'ON' }
  }

  return null
}

export function VoiceControlPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const apiBaseUrl = API_BASE_URL
  const classroom = 'Room 302'

  // Voice Persona selection (default index 3 = Juniper)
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState(3)

  // Live state
  const [currentState, setCurrentState] = useState(VOICE_STATES.IDLE)
  const [isListeningActive, setIsListeningActive] = useState(false)
  const [statusMessage, setStatusMessage] = useState('Tap the orb to start speaking')
  
  // Real-time transcript states
  const [userTranscript, setUserTranscript] = useState('')
  const [isUserSpeaking, setIsUserSpeaking] = useState(false)
  const [assistantText, setAssistantText] = useState('')

  const [actionCards, setActionCards] = useState([])
  const [errorMessage, setErrorMessage] = useState('')
  const [isMuted, setIsMuted] = useState(false)
  const [micVolume, setMicVolume] = useState(0) // Live volume meter 0..100

  // Confirmed hardware telemetry states directly synchronized from ESP32 & backend
  const [projectorState, setProjectorState] = useState('OFF')
  const [rgbPower, setRgbPower] = useState('OFF')
  const [rgbColor, setRgbColor] = useState({ name: 'blue', hex: '#3B82F6', r: 59, g: 130, b: 246 })

  // Refs for audio processing, interruption, and AI dispatching
  const recognitionRef = useRef(null)
  const isListeningRef = useRef(false)
  const isMutedRef = useRef(false)
  const activeAiAbortControllerRef = useRef(null)
  const micStreamRef = useRef(null)
  const analyserRef = useRef(null)
  const animFrameRef = useRef(null)

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
    if (isProjector && data.state) {
      setProjectorState(data.state)
    }
  })

  useSocketEvent('device:color', (data) => {
    if (!data) return
    const isProjector = data.type === 'PROJECTOR' || String(data.deviceId || '').toLowerCase().includes('proj')
    if (isProjector) {
      if (data.colorPower) setRgbPower(data.colorPower)
      if (data.color && (data.color.r !== 0 || data.color.g !== 0 || data.color.b !== 0)) {
        setRgbColor(data.color)
      }
    }
  })

  // Start real-time audio volume analyser to pulse the luminous orb
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

  // Spoken voice feedback with selected persona
  const speakUtterance = useCallback(
    (text) => {
      if (!('speechSynthesis' in window) || !text) return
      try {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
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
          setCurrentState(VOICE_STATES.SPEAKING)
        }
        utterance.onend = () => {
          if (isListeningRef.current) {
            setCurrentState(VOICE_STATES.LISTENING)
            setStatusMessage('Listening... Speak now')
          } else {
            setCurrentState(VOICE_STATES.IDLE)
          }
        }
        utterance.onerror = () => {
          if (isListeningRef.current) {
            setCurrentState(VOICE_STATES.LISTENING)
          }
        }

        window.speechSynthesis.speak(utterance)
      } catch (err) {
        console.warn('[VoiceControlPage] SpeechSynthesis warning:', err.message)
      }
    },
    [selectedVoiceIndex]
  )

  // Execute Instant Local Default Command (<50ms zero-latency execution)
  const executeFastCommand = useCallback(
    async (match, rawText) => {
      // 1. Immediately cancel any speaking TTS or pending AI call
      if (activeAiAbortControllerRef.current) {
        activeAiAbortControllerRef.current.abort()
        activeAiAbortControllerRef.current = null
      }
      window.speechSynthesis.cancel()

      if (match.type === 'DEVICE') {
        const dev = match.device
        const act = match.action
        const cardId = `${dev}-${Date.now()}`

        // Update action cards immediately
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

        // Asynchronously execute hardware command
        try {
          await fetch(`${apiBaseUrl}/api/voice/command`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ transcript: rawText, classroom }),
          })
        } catch (err) {
          console.warn('[VoiceControlPage] Fast device command error:', err.message)
        }
      } else if (match.type === 'RGB_COLOR') {
        const { colorName, colorObj } = match
        const cardId = `projector-rgb-${Date.now()}`

        // Immediately reflect in UI states
        setRgbPower('ON')
        setRgbColor(colorObj)

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

        const feedback = `Projector light set to ${colorName}.`
        setStatusMessage(feedback)
        setAssistantText(feedback)
        speakUtterance(feedback)

        // Asynchronously execute hardware RGB command with complete parameters
        try {
          await fetch(`${apiBaseUrl}/api/voice/live/rgb`, {
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
              classroom,
            }),
          })
        } catch (err) {
          console.warn('[VoiceControlPage] Fast RGB error:', err.message)
        }
      } else if (match.type === 'RGB_POWER') {
        setRgbPower('OFF')
        const feedback = 'Projector light turned off.'
        setStatusMessage(feedback)
        setAssistantText(feedback)
        speakUtterance(feedback)

        try {
          await fetch(`${apiBaseUrl}/api/voice/live/rgb`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ device: 'projector', power: 'OFF', classroom }),
          })
        } catch {}
      } else if (match.type === 'ALL_DEVICES') {
        const act = match.action
        const feedback = `All classroom devices turned ${act.toLowerCase()}.`
        setStatusMessage(feedback)
        setAssistantText(feedback)
        speakUtterance(feedback)

        try {
          await fetch(`${apiBaseUrl}/api/voice/live/command`, {
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
              classroom,
            }),
          })
        } catch {}
      } else if (match.type === 'STATE_QUERY') {
        setStatusMessage('Checking devices...')
        try {
          const res = await fetch(`${apiBaseUrl}/api/voice/live/state?classroom=${encodeURIComponent(classroom)}`)
          const json = await res.json()
          const devs = json.data?.devices || {}
          const lightP = devs.light?.power || 'OFF'
          const fanP = devs.fan?.power || 'OFF'
          const projP = devs.projector?.power || 'OFF'
          const rgbInfo = devs.projector?.rgb?.power === 'ON' ? ` with ${devs.projector?.rgb?.color || 'RGB'} light` : ''
          const feedback = `Light is ${lightP}, fan is ${fanP}, and projector is ${projP}${rgbInfo}.`
          setStatusMessage(feedback)
          setAssistantText(feedback)
          speakUtterance(feedback)
        } catch {
          const feedback = `Projector is ${projectorState}.`
          setStatusMessage(feedback)
          setAssistantText(feedback)
          speakUtterance(feedback)
        }
      }
    },
    [apiBaseUrl, token, classroom, speakUtterance, projectorState]
  )

  // Execute Complicated Commands through Gemini AI
  const executeAiCommand = useCallback(
    async (commandText) => {
      // Interrupt any prior pending AI call
      if (activeAiAbortControllerRef.current) {
        activeAiAbortControllerRef.current.abort()
      }
      window.speechSynthesis.cancel()

      const controller = new AbortController()
      activeAiAbortControllerRef.current = controller

      setCurrentState(VOICE_STATES.PROCESSING)
      setStatusMessage('AI Thinking...')

      try {
        const res = await fetch(`${apiBaseUrl}/api/voice/command`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ transcript: commandText, classroom }),
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
        if (err.name === 'AbortError') {
          console.log('[VoiceControlPage] Pending AI request interrupted by user')
          return
        }
        console.warn('[VoiceControlPage] AI request error:', err.message)
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
    [apiBaseUrl, token, classroom, speakUtterance]
  )

  // Create and start a fresh SpeechRecognition instance (Chrome requirement)
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
      recognition.continuous = false // Continuous = false avoids Chrome continuous timeout lockup
      recognition.interimResults = true
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        isListeningRef.current = true
        setIsListeningActive(true)
        setCurrentState(VOICE_STATES.LISTENING)
        setStatusMessage('Listening... Speak now')
      }

      recognition.onresult = (event) => {
        if (isMutedRef.current) return

        let fullTranscript = ''
        let hasInterim = false

        // Loop through all results from index 0 to accumulate the full sentence seamlessly
        for (let i = 0; i < event.results.length; ++i) {
          fullTranscript += event.results[i][0].transcript
          if (!event.results[i].isFinal) {
            hasInterim = true
          }
        }

        const trimmedText = fullTranscript.trim()

        // Real-time barge-in: If user speaks while AI is thinking or speaking, cancel AI/TTS immediately!
        if (trimmedText) {
          setIsUserSpeaking(true)
          setUserTranscript(trimmedText)

          if (activeAiAbortControllerRef.current) {
            activeAiAbortControllerRef.current.abort()
            activeAiAbortControllerRef.current = null
          }
          if (window.speechSynthesis && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel()
            setCurrentState(VOICE_STATES.LISTENING)
          }
        }

        // When the utterance is finalized
        if (!hasInterim && trimmedText) {
          setIsUserSpeaking(false)
          console.log('[VoiceControlPage] 🎙️ Final user speech:', trimmedText)

          // 1. Instant default command matching (Zero AI Latency)
          const fastMatch = matchFastCommand(trimmedText)
          if (fastMatch) {
            console.log('[VoiceControlPage] ⚡ Instant default command triggered:', fastMatch)
            executeFastCommand(fastMatch, trimmedText)
          } else {
            // 2. Complicated / conversational command -> Routes to Gemini AI
            console.log('[VoiceControlPage] 🤖 Complex command -> Routing to Gemini AI:', trimmedText)
            executeAiCommand(trimmedText)
          }
        }
      }

      recognition.onerror = (e) => {
        if (e.error === 'aborted' || e.error === 'no-speech') {
          // Expected benign events, ignore and let onend restart if active
          return
        }
        console.warn('[VoiceControlPage] Speech recognition event:', e.error)
        if (e.error === 'not-allowed') {
          setCurrentState(VOICE_STATES.ERROR)
          setErrorMessage('Microphone blocked. Please allow microphone in browser address bar.')
          setStatusMessage('Microphone access blocked')
        }
      }

      recognition.onend = () => {
        setIsUserSpeaking(false)
        // Auto-restart recognition continuously if active and not muted
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
      console.warn('[VoiceControlPage] Speech recognition init warning:', err.message)
      return null
    }
  }, [executeFastCommand, executeAiCommand])

  // Stop active voice session
  const stopVoiceSession = useCallback(() => {
    isListeningRef.current = false
    setIsListeningActive(false)
    setIsUserSpeaking(false)
    setCurrentState(VOICE_STATES.IDLE)
    setStatusMessage('Tap orb to start speaking')
    stopVolumeAnalyser()

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

  // Start voice session triggered by user gesture
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

    // Acquire microphone audio for the live volume visualizer
    if (!micStreamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        micStreamRef.current = stream
        startVolumeAnalyser(stream)
      } catch (err) {
        console.warn('[VoiceControlPage] Microphone volume stream warning:', err.message)
      }
    }

    startFreshRecognition()
  }, [startVolumeAnalyser, startFreshRecognition])

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      stopVoiceSession()
    }
  }, [stopVoiceSession])

  // Handle Orb Click: toggle session / mic
  const handleOrbClick = () => {
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
        // If speaking or thinking, tap interrupts and resets to listening
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

  // Handle Revert Action (Undo / Opposite)
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
        const msg = `${targetDevice.toUpperCase()} switched ${oppositeAction}`
        setStatusMessage(msg)
        setAssistantText(msg)
        speakUtterance(msg)
      } else {
        throw new Error(data.message || 'Failed')
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


  // Dynamic orb scaling according to voice volume meter
  const voiceScale =
    currentState === VOICE_STATES.LISTENING && micVolume > 5
      ? 1 + (micVolume / 100) * 0.14
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
                isListeningActive
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
                : isListeningActive
                ? 'Room 302'
                : 'Ready'}
            </span>
          </div>
        </div>

        <button
          onClick={() => {
            if (isListeningActive) {
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

      {/* 2. CENTER STAGE (Luminous Orb + Prominent Live Transcripts + Suggestion Chips) */}
      <main className="flex-1 flex flex-col items-center justify-center w-full max-w-md my-auto z-10 text-center px-1 sm:px-2">
        {/* Hardware Status Pill & Voice Persona Selector */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-3 sm:mb-5 flex-wrap">
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
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{
                      backgroundColor: rgbColor?.hex || '#A855F7',
                      boxShadow: `0 0 8px ${rgbColor?.hex || '#A855F7'}`,
                    }}
                  />
                  <span className="text-white/90 capitalize font-medium">{rgbColor?.name || 'RGB'}</span>
                </div>
              </>
            )}
          </div>

          {/* Voice persona selector dots */}
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
          title="Tap to speak, interrupt, or mute"
        >
          <div className="chatgpt-orb-nebula" />
        </div>

        {/* Status Indicator */}
        <div className="mt-4 flex flex-col items-center gap-2 max-w-sm w-full">
          <div className="text-xs sm:text-sm font-medium tracking-wide transition-all">
            {currentState === VOICE_STATES.LISTENING && (
              <span className="text-sky-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping inline-block" />
                Listening... Speak naturally
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
                Replying...
              </span>
            )}
            {currentState === VOICE_STATES.IDLE && (
              <span className="text-white/40 flex items-center gap-1.5 font-normal text-xs tracking-wider">
                <Sparkles className="w-3 h-3 text-white/30" />
                Tap orb to speak
              </span>
            )}
            {currentState === VOICE_STATES.ERROR && (
              <span className="text-rose-400 flex items-center gap-1.5 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                Microphone access needed
              </span>
            )}
          </div>

          {/* ======================================================== */}
          {/* COMPACT & MODERN LIVE TRANSCRIPT DISPLAY                 */}
          {/* ======================================================== */}
          <div className="w-full max-w-[280px] sm:max-w-[320px] flex flex-col items-center gap-1.5 my-2">
            {/* 1. What the user is speaking in real time (Interim + Final) */}
            {userTranscript ? (
              <div
                className="w-full px-3.5 py-2 rounded-2xl border flex items-start gap-2.5 text-left shadow-lg backdrop-blur-md animate-fadeIn"
                style={{ backgroundColor: 'rgba(24, 24, 27, 0.85)', borderColor: 'rgba(255, 255, 255, 0.15)' }}
              >
                <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${isUserSpeaking ? 'bg-sky-400 animate-ping' : 'bg-emerald-400'}`} />
                <div className="flex-1 min-w-0">
                  <span
                    className="text-[10px] uppercase tracking-wider block font-bold mb-0.5"
                    style={{ color: isUserSpeaking ? '#38bdf8' : '#34d399' }}
                  >
                    {isUserSpeaking ? 'Listening...' : 'Heard:'}
                  </span>
                  <p
                    className="text-xs sm:text-sm font-semibold tracking-wide break-words leading-relaxed select-text"
                    style={{ color: '#ffffff' }}
                  >
                    &ldquo;{userTranscript}&rdquo;
                  </p>
                </div>
              </div>
            ) : (
              <div
                className="w-full py-1.5 px-3 text-center text-[11px] font-medium tracking-wide rounded-full bg-white/[0.04] border border-white/5"
                style={{ color: '#cbd5e1' }}
              >
                {currentState === VOICE_STATES.LISTENING ? 'Listening... Speak naturally' : 'Tap orb to speak'}
              </div>
            )}

            {/* 2. Compact Assistant spoken confirmation / answer */}
            {assistantText && (
              <div
                className="w-full px-3 py-1.5 rounded-xl border text-left flex items-start gap-2 shadow-md backdrop-blur-md animate-fadeIn"
                style={{ backgroundColor: 'rgba(88, 28, 135, 0.25)', borderColor: 'rgba(168, 85, 247, 0.35)', color: '#ffffff' }}
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-300 mt-0.5 shrink-0" />
                <p className="text-[11px] sm:text-xs text-purple-100 font-medium break-words leading-snug">
                  {assistantText}
                </p>
              </div>
            )}
          </div>

          {/* Error Message Helper */}
          {currentState === VOICE_STATES.ERROR && (
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

        {/* 3. RECENT ACTION BADGES WITH REVERT / UNDO */}
        {actionCards.length > 0 && (
          <div className="w-full mt-3 space-y-2 max-h-36 overflow-y-auto px-1">
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
                        className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
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

      {/* 4. BOTTOM CONTROLS */}
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

        {/* Iconic White Pill Button: [ Done ] */}
        <button
          onClick={() => {
            stopVoiceSession()
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
