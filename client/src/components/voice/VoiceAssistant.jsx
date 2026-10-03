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
  'Turn off the fan',
  'Create revision notes for physics',
  'Generate quiz with 5 questions',
]

/**
 * Reusable VoiceAssistant Component for the Smart Classroom
 *
 * Captures English voice input through browser Web Speech API (laptop or Bluetooth mic),
 * validates audio locally, and transmits text transcript to POST /api/voice/command.
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

  const recognitionRef = useRef(null)
  const isSpeechEndedRef = useRef(false)

  // Initialize SpeechRecognition on mount
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
    }
  }, [])

  // Send Transcript to Backend POST /api/voice/command
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

  // When speech ends and we have captured transcript, automatically submit
  useEffect(() => {
    if (transcript && isSpeechEndedRef.current && currentState === VOICE_STATES.LISTENING) {
      sendTranscriptToBackend(transcript)
    }
  }, [transcript, currentState, sendTranscriptToBackend])

  // Start Voice Recognition
  const handleStartListening = () => {
    setErrorMessage('')
    setResultData(null)
    setTranscript('')
    setInterimTranscript('')
    isSpeechEndedRef.current = false

    if (!recognitionRef.current) {
      setErrorMessage('Speech recognition is not available in this browser.')
      setCurrentState(VOICE_STATES.ERROR)
      return
    }

    try {
      recognitionRef.current.start()
    } catch (err) {
      console.warn('[VoiceAssistant] Start error (attempting restart):', err.message)
      try {
        recognitionRef.current.stop()
        setTimeout(() => recognitionRef.current?.start(), 150)
      } catch {
        setCurrentState(VOICE_STATES.ERROR)
        setErrorMessage('Could not activate microphone. Please try again.')
      }
    }
  }

  // Stop Voice Recognition manually
  const handleStopListening = () => {
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
      {/* Mic Status & Bluetooth Awareness Badge */}
      <div className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-slate-100/80 border border-slate-200/80 text-xs">
        <div className="flex items-center gap-2 text-slate-600 font-medium">
          <Bluetooth className="w-3.5 h-3.5 text-blue-600" />
          <span>Microphone: Default System Audio (Built-in or Bluetooth)</span>
        </div>
        <Badge variant="info" size="sm">
          en-US (English)
        </Badge>
      </div>

      {/* Main Dynamic State Viewport */}
      <div className="rounded-3xl bg-slate-50/90 border border-slate-200/80 p-6 sm:p-7 text-center space-y-4 shadow-sm">
        {/* ================= STATE 1: IDLE ================= */}
        {currentState === VOICE_STATES.IDLE && (
          <div className="space-y-4 py-2">
            {!isSupported && (
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
              <p className="text-base font-bold text-slate-900">Tap to Speak</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Speak naturally in English. Your voice is captured locally and parsed by Gemini AI.
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
                Listening... Speak now
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Recording will stop automatically when speech finishes.
              </p>
            </div>

            {/* Live Real-Time Transcript Display */}
            <div className="min-h-14 p-3.5 rounded-2xl bg-white border border-purple-200 text-xs text-left font-mono shadow-sm">
              <span className="text-slate-400 text-[11px] block uppercase font-sans font-bold mb-1">
                Live Speech Transcript:
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
              <p className="text-base font-bold text-slate-900">Analyzing Voice Command...</p>
              <p className="text-xs text-slate-500 mt-1">
                Gemini intent classification and backend allowlist validation in progress.
              </p>
            </div>

            {/* Echoed Transcript */}
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 text-xs text-left font-mono shadow-sm">
              <span className="text-slate-400 text-[10px] block uppercase font-sans mb-1">
                Transcribed Audio:
              </span>
              <p className="text-blue-600 font-semibold italic">"{transcript}"</p>
            </div>
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
