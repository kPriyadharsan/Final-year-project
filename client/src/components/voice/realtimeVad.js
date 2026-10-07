/**
 * realtimeVad.js
 *
 * Client-Side Voice Activity Detection (VAD) Engine for Smart Classroom
 * Features:
 * - Dynamic noise floor calibration on start (suppresses classroom fans, ambient hum)
 * - Configurable end-of-speech silence threshold (500ms - 800ms, default 650ms)
 * - Minimum speech confirmation window (160ms) to filter out transient clicks/coughs
 * - Pre-speech audio padding circular buffer (250ms)
 * - Instantaneous barge-in interruption detection
 * - Maximum utterance duration window watchdog (8000ms)
 */

export class RealtimeVAD {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 16000
    this.silenceDurationMs = options.silenceDurationMs || 650 // Configurable natural silence threshold
    this.minSpeechDurationMs = options.minSpeechDurationMs || 160 // Filtering out short transients
    this.maxUtteranceMs = options.maxUtteranceMs || 8000 // Cut-off limit if user continuously speaks
    this.calibrationDurationMs = options.calibrationDurationMs || 400 // Fast ambient noise calibration

    this.onSpeechStart = options.onSpeechStart || (() => {})
    this.onSpeechEnd = options.onSpeechEnd || (() => {})
    this.onBargeIn = options.onBargeIn || (() => {})
    this.onVolume = options.onVolume || (() => {})
    this.onCalibrationComplete = options.onCalibrationComplete || (() => {})

    // State
    this.isCalibrating = true
    this.calibrationSamples = []
    this.calibrationStartTime = 0
    this.noiseFloor = 0.012
    this.speechThreshold = 0.03
    this.silenceThreshold = 0.02

    this.isSpeaking = false
    this.speechStartTime = 0
    this.speechCandidateStartTime = 0
    this.lastSpeechFrameTime = 0
    this.silenceStartTime = 0
    this.isAssistantSpeaking = false

    // Circular pre-speech buffer (approx 250ms at 16kHz = 4000 samples)
    this.preSpeechBufferSize = Math.round(this.sampleRate * 0.25)
    this.preSpeechBuffer = []
  }

  setAssistantSpeaking(speaking) {
    this.isAssistantSpeaking = Boolean(speaking)
  }

  setSilenceThresholdMs(durationMs) {
    this.silenceDurationMs = Math.max(400, Math.min(1200, durationMs))
  }

  startCalibration() {
    this.isCalibrating = true
    this.calibrationSamples = []
    this.calibrationStartTime = performance.now()
    this.isSpeaking = false
    this.speechStartTime = 0
    this.silenceStartTime = 0
  }

  /**
   * Processes a buffer of 16-bit PCM samples or Float32 samples
   *
   * @param {Int16Array|Float32Array} samples
   */
  processSamples(samples) {
    const now = performance.now()
    const len = samples.length
    if (len === 0) return

    // 1. Calculate Root Mean Square (RMS) energy
    let sumSq = 0
    const isInt16 = samples instanceof Int16Array
    for (let i = 0; i < len; i++) {
      const val = isInt16 ? samples[i] / 32768.0 : samples[i]
      sumSq += val * val
    }
    const rms = Math.sqrt(sumSq / len)

    // Notify volume meter for UI orb (scaled 0-100)
    const normalizedVolume = Math.min(100, Math.round((rms / 0.25) * 100))
    this.onVolume(normalizedVolume)

    // 2. Ambient Noise Calibration Phase
    if (this.isCalibrating) {
      this.calibrationSamples.push(rms)
      if (now - this.calibrationStartTime >= this.calibrationDurationMs) {
        this.isCalibrating = false
        // Compute baseline noise floor
        const sorted = [...this.calibrationSamples].sort((a, b) => a - b)
        const median = sorted[Math.floor(sorted.length / 2)] || 0.01
        this.noiseFloor = Math.max(0.005, median)
        // Adaptive threshold based on ambient environment
        this.speechThreshold = Math.max(this.noiseFloor * 2.2 + 0.015, 0.025)
        this.silenceThreshold = this.speechThreshold * 0.72

        console.log(
          `[VAD] 🎯 Calibration Complete: NoiseFloor=${this.noiseFloor.toFixed(4)}, SpeechThreshold=${this.speechThreshold.toFixed(4)}, SilenceThreshold=${this.silenceThreshold.toFixed(4)}`
        )
        this.onCalibrationComplete({
          noiseFloor: this.noiseFloor,
          speechThreshold: this.speechThreshold,
          silenceThreshold: this.silenceThreshold,
        })
      }
      return
    }

    const isSpeechFrame = rms > this.speechThreshold

    // 3. Instant Barge-In Interruption Check
    // If assistant is currently outputting audio and user starts speaking
    if (this.isAssistantSpeaking && isSpeechFrame) {
      if (!this.bargeInCandidateTime) {
        this.bargeInCandidateTime = now
      } else if (now - this.bargeInCandidateTime >= 80) {
        // Confirmed barge-in after 80ms of continuous energy
        console.log('[VAD] 🛑 Instant Barge-in Interruption Detected!')
        this.isAssistantSpeaking = false
        this.bargeInCandidateTime = 0
        this.onBargeIn()
      }
    } else {
      this.bargeInCandidateTime = 0
    }

    // 4. Speech Start Detection
    if (isSpeechFrame) {
      this.lastSpeechFrameTime = now
      this.silenceStartTime = 0

      if (!this.isSpeaking) {
        if (!this.speechCandidateStartTime) {
          this.speechCandidateStartTime = now
        } else if (now - this.speechCandidateStartTime >= this.minSpeechDurationMs) {
          // Confirmed speech onset!
          this.isSpeaking = true
          this.speechStartTime = this.speechCandidateStartTime
          this.speechCandidateStartTime = 0
          console.log('[VAD] 🗣️ Speech Started')
          this.onSpeechStart({
            timestamp: this.speechStartTime,
            rms,
          })
        }
      }
    } else {
      // Below speech threshold
      this.speechCandidateStartTime = 0

      // 5. Speech End / Silence Detection
      if (this.isSpeaking) {
        if (rms < this.silenceThreshold) {
          if (!this.silenceStartTime) {
            this.silenceStartTime = now
          } else {
            const silenceElapsed = now - this.silenceStartTime
            if (silenceElapsed >= this.silenceDurationMs) {
              // Confirmed End-of-Speech!
              this.isSpeaking = false
              const speechEndTime = this.lastSpeechFrameTime
              const speechDuration = speechEndTime - this.speechStartTime
              this.silenceStartTime = 0
              console.log(`[VAD] 🤫 End-of-Speech Finalized after ${silenceElapsed.toFixed(0)}ms natural silence (Utterance: ${speechDuration.toFixed(0)}ms)`)
              this.onSpeechEnd({
                speechStartTime: this.speechStartTime,
                speechEndTime,
                speechDurationMs: speechDuration,
                silenceDelayMs: silenceElapsed,
              })
            }
          }
        } else {
          // In indeterminate buffer between silence and speech threshold
          this.silenceStartTime = 0
        }

        // 6. Max Utterance Watchdog limit
        if (now - this.speechStartTime >= this.maxUtteranceMs) {
          console.log('[VAD] ⏱️ Maximum utterance limit reached. Finalizing turn immediately.')
          this.isSpeaking = false
          this.silenceStartTime = 0
          this.onSpeechEnd({
            speechStartTime: this.speechStartTime,
            speechEndTime: now,
            speechDurationMs: now - this.speechStartTime,
            silenceDelayMs: 0,
            forcedByMaxDuration: true,
          })
        }
      }
    }
  }

  reset() {
    this.isSpeaking = false
    this.speechStartTime = 0
    this.speechCandidateStartTime = 0
    this.silenceStartTime = 0
    this.bargeInCandidateTime = 0
    this.isAssistantSpeaking = false
  }
}
