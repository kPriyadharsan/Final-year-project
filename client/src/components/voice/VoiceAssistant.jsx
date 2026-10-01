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
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

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
        })

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
        console.error('[VoiceAssistant] Backend dispatch error:', err)
        setErrorMessage(err.message || 'Communication failure with voice command server.')
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
    <div className={`space-y-5 text-slate-100 ${isEmbedded ? '' : 'p-1'}`}>
      {/* Mic Status & Bluetooth Awareness Badge */}
      <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <Bluetooth className="w-3.5 h-3.5 text-cyan-400" />
          <span>Microphone: Default System Audio (Built-in or Bluetooth)</span>
        </div>
        <Badge variant="outline" size="sm">
          en-US (English)
        </Badge>
      </div>

      {/* Main Dynamic State Viewport */}
      <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-6 text-center space-y-4 shadow-inner">
        {/* ================= STATE 1: IDLE ================= */}
        {currentState === VOICE_STATES.IDLE && (
          <div className="space-y-4 py-2">
            <button
              type="button"
              onClick={handleStartListening}
              className="w-20 h-20 mx-auto rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 hover:from-purple-500 hover:to-indigo-400 flex items-center justify-center text-white shadow-xl shadow-purple-600/30 transition-transform active:scale-95 cursor-pointer group"
              title="Tap to speak in English"
            >
              <Mic className="w-9 h-9 group-hover:scale-110 transition-transform" />
            </button>
            <div>
              <p className="text-sm font-bold text-white">Tap to Speak</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
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
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                Listening... Speak now
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Recording will stop automatically when speech finishes.
              </p>
            </div>

            {/* Live Real-Time Transcript Display */}
            <div className="min-h-14 p-3.5 rounded-xl bg-slate-950 border border-purple-500/30 text-xs text-left font-mono">
              <span className="text-slate-400 text-[11px] block uppercase font-sans font-bold mb-1">
                Live Speech Transcript:
              </span>
              <p className="text-white font-medium break-words">
                {transcript || interimTranscript || (
                  <span className="text-slate-500 italic">Listening for speech...</span>
                )}
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleStopListening}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Done Speaking
            </Button>
          </div>
        )}

        {/* ================= STATE 3: PROCESSING ================= */}
        {currentState === VOICE_STATES.PROCESSING && (
          <div className="space-y-4 py-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/10">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Analyzing Voice Command...</p>
              <p className="text-xs text-slate-400 mt-1">
                Gemini intent classification and backend allowlist validation in progress.
              </p>
            </div>

            {/* Echoed Transcript */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-left font-mono">
              <span className="text-slate-500 text-[10px] block uppercase font-sans mb-1">
                Transcribed Audio:
              </span>
              <p className="text-cyan-300 font-medium italic">"{transcript}"</p>
            </div>
          </div>
        )}

        {/* ================= STATE 4: SUCCESS ================= */}
        {currentState === VOICE_STATES.SUCCESS && resultData && (
          <div className="space-y-4 py-2 text-left">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-bold text-white">Command Executed</span>
              </div>
              <Badge
                variant={
                  resultData.executionStatus === 'EXECUTED'
                    ? 'success'
                    : resultData.executionStatus === 'DETECTED'
                    ? 'info'
                    : 'warning'
                }
              >
                {resultData.executionStatus}
              </Badge>
            </div>

            {/* Transcript Quote */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">
                Captured Transcript
              </span>
              <p className="text-xs font-mono text-purple-300 font-semibold italic">
                "{resultData.transcript}"
              </p>
            </div>

            {/* Intent & Device Badges */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Classified Intent</span>
                <span className="font-semibold text-white font-mono">{resultData.intent}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Target Device / Action</span>
                <span className="font-semibold text-cyan-300 font-mono">
                  {resultData.device ? `${resultData.device.toUpperCase()} → ${resultData.action}` : 'N/A (Software)'}
                </span>
              </div>
            </div>

            {/* Human Readable Message from Backend */}
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
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
            <div className="w-14 h-14 mx-auto rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Voice Command Notice</p>
              <p className="text-xs text-rose-300 mt-1 max-w-sm mx-auto">{errorMessage}</p>
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
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-purple-500/40 hover:bg-slate-800 text-[11px] text-slate-300 hover:text-white transition-all cursor-pointer font-mono flex items-center gap-1.5"
              >
                <span>"{phrase}"</span>
                <ArrowRight className="w-3 h-3 text-purple-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual Input Fallback */}
      <div className="pt-1 border-t border-slate-800/80">
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            type="text"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="Or type an English voice command..."
            className="flex-1 px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono"
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
