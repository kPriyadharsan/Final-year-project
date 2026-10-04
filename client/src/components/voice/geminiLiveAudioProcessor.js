/**
 * geminiLiveAudioProcessor.js
 *
 * Dedicated AudioWorkletProcessor for Gemini Live API.
 * Converts microphone Float32 audio samples into 16-bit mono linear PCM chunks.
 */

class GeminiLiveAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    // 512 samples = ~32ms at 16kHz for ultra-low latency streaming
    this.bufferSize = 512
    this.buffer = new Int16Array(this.bufferSize)
    this.bufferIndex = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true

    const channelData = input[0]
    for (let i = 0; i < channelData.length; i++) {
      let sample = channelData[i]
      // Intelligent Noise Gate: clean silence below -40dB (suppresses fan hiss and room hum)
      if (Math.abs(sample) < 0.01) {
        sample = 0
      }
      sample = Math.max(-1, Math.min(1, sample))
      this.buffer[this.bufferIndex++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff

      if (this.bufferIndex >= this.bufferSize) {
        const chunk = this.buffer.slice(0, this.bufferSize)
        this.port.postMessage(chunk.buffer, [chunk.buffer])
        this.buffer = new Int16Array(this.bufferSize)
        this.bufferIndex = 0
      }
    }

    return true
  }
}

registerProcessor('gemini-live-audio-processor', GeminiLiveAudioProcessor)
